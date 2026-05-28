import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Input, Segmented, Tag, Tooltip, Typography } from 'antd';
import { EditOutlined, EyeOutlined, ReloadOutlined, SaveOutlined, SplitCellsOutlined } from '@ant-design/icons';
import { message } from '@/utils/notify';
import { buildHtmlPreviewSrcdoc } from '@/utils/htmlPreview';
import { uploadFile } from '@/api/attachments';
import { flushOnUnmount, type EditorSaveHandle } from './editorSaveLifecycle';

const { TextArea } = Input;
const { Text } = Typography;

interface Props {
  /** HTML source stored in document.raw_content. */
  value: string;
  onChange: (next: string) => void;
  onAutoSave?: (next: string) => Promise<void> | void;
  autosaveMs?: number;
  readOnly?: boolean;
  /** Document being edited — used to attach image uploads. */
  documentId?: number;
  /**
   * Existing HTML attachment URL. When ``value`` is empty (legacy docs imported
   * before HTML→raw_content migration), the editor fetches this URL, detects
   * encoding (UTF-8 → GBK fallback) and hydrates ``value`` via ``onChange``.
   */
  legacyAttachmentUrl?: string | null;
  /** Lift the textarea up so host can scroll/seek it (find / outline). */
  onTextareaReady?: (el: HTMLTextAreaElement | null) => void;
  onSaveReady?: (handle: EditorSaveHandle | null) => void;
  /** When false, only the source textarea is shown (page-level preview). */
  showPreviewPane?: boolean;
}

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/** Pure helper — exported for unit tests. The `--split` modifier may only ride
 *  along when the host actually permits preview AND the user picked split;
 *  otherwise a stale localStorage 'split' would leave the source pane in a
 *  1fr 1fr grid with a blank right column. */
export function htmlEditorPanesClass(
  showPreviewPane: boolean,
  layoutMode: 'edit' | 'preview' | 'split',
): string {
  return 'jz-html-editor-panes'
    + (showPreviewPane && layoutMode === 'split' ? ' jz-html-editor-panes--split' : '');
}

const STATUS_LABEL: Record<SaveStatus, { text: string; color?: string }> = {
  idle: { text: '已同步' },
  pending: { text: '待保存…', color: 'orange' },
  saving: { text: '保存中…', color: 'blue' },
  saved: { text: '已保存', color: 'green' },
  error: { text: '保存失败', color: 'red' },
};

/**
 * Decode a binary HTML payload. We try UTF-8 first (most modern files), and if
 * the result has too many U+FFFD replacement chars (typical sign of a
 * legacy-encoded file like Windows-1252 or GBK being read as UTF-8), fall back
 * to GBK. GBK covers GB2312/GB18030 in practice and is what 99% of "乱码"
 * Chinese HTML files actually are.
 */
function decodeHtml(buf: ArrayBuffer): { text: string; encoding: 'utf-8' | 'gbk' } {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  const repCount = (utf8.match(/\uFFFD/g) || []).length;
  if (repCount > 3) {
    try {
      const gbk = new TextDecoder('gbk').decode(buf);
      return { text: gbk, encoding: 'gbk' };
    } catch {
      // browser without 'gbk' label — keep UTF-8
    }
  }
  return { text: utf8, encoding: 'utf-8' };
}

export default function HtmlEditor({
  value,
  onChange: onChangeProp,
  onAutoSave,
  autosaveMs = 5000,
  readOnly = false,
  documentId,
  legacyAttachmentUrl,
  onTextareaReady,
  onSaveReady,
  showPreviewPane = true,
}: Props) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [encoding, setEncoding] = useState<'utf-8' | 'gbk' | null>(null);
  const [hydrating, setHydrating] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Persist the user's view choice across sessions when preview is available.
  const [layoutMode, setLayoutMode] = useState<'edit' | 'preview' | 'split'>(() => {
    if (!showPreviewPane) return 'edit';
    try {
      const v = localStorage.getItem('jz-html-editor-layout');
      if (v === 'edit' || v === 'preview' || v === 'split') return v;
    } catch { /* localStorage may be blocked — fall through */ }
    return 'split';
  });
  useEffect(() => {
    if (!showPreviewPane) return;
    try { localStorage.setItem('jz-html-editor-layout', layoutMode); } catch { /* ignore */ }
  }, [layoutMode, showPreviewPane]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastSavedRef = useRef(value);
  /** Last value we emitted locally — used to detect external updates. */
  const lastLocalRef = useRef(value);
  /** Save sequence guard to keep stale completions from overwriting state. */
  const saveSeqRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const onAutoSaveRef = useRef(onAutoSave);
  const onChangeRef = useRef(onChangeProp);
  useEffect(() => {
    onAutoSaveRef.current = onAutoSave;
  }, [onAutoSave]);
  useEffect(() => {
    onChangeRef.current = onChangeProp;
  }, [onChangeProp]);

  // Wrap onChange so local edits update lastLocalRef. External value updates
  // (legacy hydration completes after user typed) are then distinguishable.
  const onChange = useCallback(
    (next: string) => {
      lastLocalRef.current = next;
      onChangeProp(next);
    },
    [onChangeProp],
  );

  // ── 兜底加载：若 raw_content 为空但有历史 HTML 附件，把附件内容解码进编辑器
  const hydrationKey = `${documentId ?? 'no'}::${legacyAttachmentUrl ?? ''}`;
  const triedHydrationRef = useRef<string | null>(null);
  useEffect(() => {
    if (triedHydrationRef.current === hydrationKey) return;
    triedHydrationRef.current = hydrationKey;
    if (value || !legacyAttachmentUrl) return;
    const controller = new AbortController();
    setHydrating(true);
    fetch(legacyAttachmentUrl, { signal: controller.signal })
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        // Skip if user typed or focused the editor while fetch was in flight.
        if (lastLocalRef.current !== '') return;
        if (textareaRef.current === document.activeElement) return;
        const { text, encoding: enc } = decodeHtml(buf);
        setEncoding(enc);
        onChange(text);
      })
      .catch((err) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        message.error('无法读取历史 HTML 附件');
      })
      .finally(() => setHydrating(false));
    return () => controller.abort();
    // intentionally narrow deps so we only run once per (doc, url) pair —
    // onChange identity changes on every render and would loop us.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrationKey]);

  useEffect(() => {
    lastSavedRef.current = value;
    lastLocalRef.current = value;
    setStatus('idle');
  }, []); // sync on mount

  // External value sync — distinguish server echo from genuine external update.
  useEffect(() => {
    if (value === lastLocalRef.current) return;
    lastSavedRef.current = value;
    lastLocalRef.current = value;
    setStatus('idle');
  }, [value]);

  useEffect(() => {
    if (!onAutoSave) return;
    if (value === lastSavedRef.current) return;
    setStatus('pending');
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const mySeq = ++saveSeqRef.current;
    timerRef.current = window.setTimeout(async () => {
      setStatus('saving');
      try {
        await onAutoSave(value);
        if (mySeq !== saveSeqRef.current) return;
        lastSavedRef.current = value;
        setStatus('saved');
      } catch {
        if (mySeq !== saveSeqRef.current) return;
        setStatus('error');
      }
    }, autosaveMs);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [value, onAutoSave, autosaveMs]);

  const saveNow = useCallback(async () => {
    if (!onAutoSave) return;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (value === lastSavedRef.current && status === 'saved') return;
    const mySeq = ++saveSeqRef.current;
    setStatus('saving');
    try {
      await onAutoSave(value);
      if (mySeq !== saveSeqRef.current) return;
      lastSavedRef.current = value;
      setStatus('saved');
    } catch {
      if (mySeq !== saveSeqRef.current) return;
      setStatus('error');
    }
  }, [onAutoSave, value, status]);

  useEffect(() => {
    if (readOnly || !onAutoSave) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        void saveNow();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveNow, readOnly, onAutoSave]);

  useEffect(() => {
    onSaveReady?.({ saveNow });
    return () => onSaveReady?.(null);
  }, [saveNow, onSaveReady]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      flushOnUnmount({
        getLiveContent: () => lastLocalRef.current,
        lastSaved: lastSavedRef.current,
        onChange: (next) => {
          lastLocalRef.current = next;
          onChangeRef.current(next);
        },
        onAutoSave: onAutoSaveRef.current,
        saveSeqRef,
        lastSavedRef,
        lastEmittedRef: lastLocalRef,
      });
    };
  }, []);

  /** Re-fetch the legacy attachment with the OTHER encoding so the user can
   *  recover if our heuristic guessed wrong. */
  async function reloadWithEncoding(target: 'utf-8' | 'gbk') {
    if (!legacyAttachmentUrl) return;
    try {
      setHydrating(true);
      const buf = await fetch(legacyAttachmentUrl).then((r) => r.arrayBuffer());
      const text = new TextDecoder(target).decode(buf);
      setEncoding(target);
      onChange(text);
    } catch {
      message.error('重新读取失败');
    } finally {
      setHydrating(false);
    }
  }

  function escapeHtmlAttr(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /** Upload a batch of images in order; re-reads live textarea before each
   *  insertion so concurrent typing is preserved. */
  async function uploadAndInsert(files: File[]) {
    setUploading(true);
    try {
      const ta = textareaRef.current;
      let start = ta?.selectionStart ?? lastLocalRef.current.length;
      let end = ta?.selectionEnd ?? start;
      let caret = end;
      let any = false;
      for (const f of files) {
        start = Math.min(start, ta1Len(ta));
        end = Math.min(end, ta1Len(ta));
        try {
          const att = await uploadFile(f, documentId);
          const next = ta?.value ?? lastLocalRef.current;
          const alt = escapeHtmlAttr(att.original_filename || f.name);
          const src = escapeHtmlAttr(att.url);
          const tag = `<img src="${src}" alt="${alt}" />`;
          const merged = next.slice(0, start) + tag + next.slice(end);
          lastLocalRef.current = merged;
          start += tag.length;
          end = start;
          caret = start;
          any = true;
        } catch (err) {
          message.error(err instanceof Error ? err.message : '图片上传失败');
        }
      }
      if (any) {
        onChange(lastLocalRef.current);
        queueMicrotask(() => {
          if (ta) {
            ta.focus();
            ta.setSelectionRange(caret, caret);
          }
        });
      }
    } finally {
      setUploading(false);
    }
  }

  function ta1Len(ta: HTMLTextAreaElement | null | undefined): number {
    return (ta?.value ?? lastLocalRef.current).length;
  }

  /** Paste image → upload → insert <img src="..." /> at cursor. */
  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (readOnly) return;
    const images = Array.from(e.clipboardData?.items ?? [])
      .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .filter((f): f is File => !!f);
    if (images.length === 0) return;
    e.preventDefault();
    await uploadAndInsert(images);
  }

  async function handleDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    if (readOnly) return;
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
      f.type.startsWith('image/'),
    );
    if (files.length === 0) return;
    e.preventDefault();
    await uploadAndInsert(files);
  }

  function handleDragOver(e: React.DragEvent<HTMLTextAreaElement>) {
    if (readOnly) return;
    const items = Array.from(e.dataTransfer?.items ?? []);
    if (items.some((i) => i.kind === 'file')) e.preventDefault();
  }

  // ``srcdoc`` is rebuilt on every value change; the iframe ditches its old
  // document and reparses. For long HTML this could cost a few ms, fine for
  // human typing speed. Sandboxed so scripts in the user's HTML can't read our
  // cookies or top-level DOM.
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedValue(value), 200);
    return () => window.clearTimeout(t);
  }, [value]);

  const previewSrcdoc = useMemo(() => buildHtmlPreviewSrcdoc(debouncedValue), [debouncedValue]);

  return (
    <div className="jz-editor-surface jz-html-editor">
      <div className="jz-editor-toolbar jz-editor-toolbar--compact jz-html-editor-toolbar" role="toolbar" aria-label="HTML 工具栏">
        {/* LEFT zone — status info (sticky, never wraps) */}
        <div className="jz-html-toolbar-status">
          <Tag color={STATUS_LABEL[status].color} style={{ margin: 0 }}>
            {STATUS_LABEL[status].text}
          </Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {value.length.toLocaleString()} 字符
          </Text>
          {encoding && (
            <Tooltip
              title={
                encoding === 'gbk'
                  ? '检测到 GBK 编码，已自动转码；保存后将以 UTF-8 写回 raw_content'
                  : '以 UTF-8 解码'
              }
            >
              <Tag color={encoding === 'gbk' ? 'orange' : 'default'}>编码: {encoding}</Tag>
            </Tooltip>
          )}
          {uploading && <Tag color="blue">图片上传中…</Tag>}
        </div>

        {/* MIDDLE zone — legacy-HTML re-decode toggles (conditional, wraps OK) */}
        {legacyAttachmentUrl && (
          <div className="jz-html-toolbar-legacy">
            <Tooltip title="按 UTF-8 重新读取原 HTML">
              <Button
                size="small"
                icon={<ReloadOutlined />}
                disabled={hydrating}
                onClick={() => reloadWithEncoding('utf-8')}
              >
                UTF-8
              </Button>
            </Tooltip>
            <Tooltip title="按 GBK 重新读取原 HTML（中文老文件常见）">
              <Button
                size="small"
                icon={<ReloadOutlined />}
                disabled={hydrating}
                onClick={() => reloadWithEncoding('gbk')}
              >
                GBK
              </Button>
            </Tooltip>
          </div>
        )}

        {/* RIGHT zone — actions (layout toggle + save) — pushed to the right */}
        <div className="jz-html-toolbar-actions">
          {showPreviewPane && (
            <Segmented
              size="small"
              value={layoutMode}
              onChange={(v) => setLayoutMode(v as 'edit' | 'preview' | 'split')}
              options={[
                { value: 'edit', icon: <EditOutlined />, label: '编辑' },
                { value: 'split', icon: <SplitCellsOutlined />, label: '分屏' },
                { value: 'preview', icon: <EyeOutlined />, label: '预览' },
              ]}
            />
          )}
          {status === 'error' && onAutoSave && !readOnly && (
            <Button size="small" className="jz-toolbar-save-btn" onClick={() => void saveNow()}>
              重试
            </Button>
          )}
          <Tooltip title="立即保存 (Ctrl/⌘+S)">
            <Button
              size="small"
              className="jz-toolbar-save-btn"
              type="primary"
              icon={<SaveOutlined />}
              loading={status === 'saving'}
              disabled={readOnly || !onAutoSave || (status === 'saved' && value === lastSavedRef.current)}
              onClick={() => void saveNow()}
            >
              保存
            </Button>
          </Tooltip>
        </div>
      </div>

      {hydrating && (
        <Alert
          type="info"
          showIcon
          message="正在读取原 HTML 文件…"
          style={{ marginBottom: 8, flexShrink: 0 }}
        />
      )}

      <div className={htmlEditorPanesClass(showPreviewPane, layoutMode)}>
        {(!showPreviewPane || layoutMode === 'edit' || layoutMode === 'split') && (
          <div className="jz-html-editor-source">
            <TextArea
              ref={(el) => {
                const ta = el?.resizableTextArea?.textArea ?? null;
                textareaRef.current = ta;
                onTextareaReady?.(ta);
              }}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onPaste={handlePaste}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              readOnly={readOnly}
              autoSize={false}
              className="jz-html-editor-textarea"
              placeholder="<!DOCTYPE html>&#10;<html>&#10;<head><meta charset='utf-8'></head>&#10;<body>&#10;  ...&#10;</body>&#10;</html>"
              spellCheck={false}
            />
          </div>
        )}
        {showPreviewPane && (layoutMode === 'preview' || layoutMode === 'split') && (
          <div className="jz-html-editor-preview">
            <iframe
              title="HTML 预览"
              srcDoc={previewSrcdoc}
              sandbox="allow-scripts allow-popups allow-forms"
            />
          </div>
        )}
      </div>
    </div>
  );
}
