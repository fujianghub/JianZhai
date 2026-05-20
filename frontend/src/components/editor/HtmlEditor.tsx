import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Input, Space, Tag, Tooltip, Typography } from 'antd';
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { message } from '@/utils/notify';
import { uploadFile } from '@/api/attachments';

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
}

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

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
  const repCount = (utf8.match(/�/g) || []).length;
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
  onChange,
  onAutoSave,
  autosaveMs = 5000,
  readOnly = false,
  documentId,
  legacyAttachmentUrl,
}: Props) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [encoding, setEncoding] = useState<'utf-8' | 'gbk' | null>(null);
  const [hydrating, setHydrating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastSavedRef = useRef(value);
  const timerRef = useRef<number | null>(null);

  // ── 兜底加载：若 raw_content 为空但有历史 HTML 附件，把附件内容解码进编辑器
  const hydrationKey = `${documentId ?? 'no'}::${legacyAttachmentUrl ?? ''}`;
  const triedHydrationRef = useRef<string | null>(null);
  useEffect(() => {
    if (triedHydrationRef.current === hydrationKey) return;
    triedHydrationRef.current = hydrationKey;
    if (value || !legacyAttachmentUrl) return;
    setHydrating(true);
    fetch(legacyAttachmentUrl)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        const { text, encoding: enc } = decodeHtml(buf);
        setEncoding(enc);
        onChange(text);
      })
      .catch(() => {
        message.error('无法读取历史 HTML 附件');
      })
      .finally(() => setHydrating(false));
    // intentionally narrow deps so we only run once per (doc, url) pair —
    // onChange identity changes on every render and would loop us.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrationKey]);

  useEffect(() => {
    lastSavedRef.current = value;
    setStatus('idle');
  }, []); // sync on mount

  useEffect(() => {
    if (!onAutoSave) return;
    if (value === lastSavedRef.current) return;
    setStatus('pending');
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      setStatus('saving');
      try {
        await onAutoSave(value);
        lastSavedRef.current = value;
        setStatus('saved');
      } catch {
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
    setStatus('saving');
    try {
      await onAutoSave(value);
      lastSavedRef.current = value;
      setStatus('saved');
    } catch {
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

  /** Paste image → upload → insert <img src="..." /> at cursor. */
  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (readOnly) return;
    const images = Array.from(e.clipboardData?.items ?? [])
      .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .filter((f): f is File => !!f);
    if (images.length === 0) return;
    e.preventDefault();
    setUploading(true);
    try {
      for (const f of images) {
        const att = await uploadFile(f, documentId);
        const ta = textareaRef.current;
        const start = ta?.selectionStart ?? value.length;
        const end = ta?.selectionEnd ?? value.length;
        const tag = `<img src="${att.url}" alt="${att.original_filename || f.name}" />`;
        onChange(value.slice(0, start) + tag + value.slice(end));
        const caret = start + tag.length;
        queueMicrotask(() => {
          if (ta) {
            ta.focus();
            ta.setSelectionRange(caret, caret);
          }
        });
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '图片上传失败');
    } finally {
      setUploading(false);
    }
  }

  // ``srcdoc`` is rebuilt on every value change; the iframe ditches its old
  // document and reparses. For long HTML this could cost a few ms, fine for
  // human typing speed. Sandboxed so scripts in the user's HTML can't read our
  // cookies or top-level DOM.
  const previewSrcdoc = useMemo(() => value, [value]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Space style={{ marginBottom: 8 }} wrap>
        <Tag color={STATUS_LABEL[status].color}>{STATUS_LABEL[status].text}</Tag>
        <Text type="secondary">{value.length.toLocaleString()} 字符</Text>
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
        <Tooltip title="立即保存 (Ctrl/⌘+S)">
          <Button
            size="small"
            type="primary"
            icon={<SaveOutlined />}
            loading={status === 'saving'}
            disabled={readOnly || !onAutoSave || (status === 'saved' && value === lastSavedRef.current)}
            onClick={() => void saveNow()}
          >
            保存
          </Button>
        </Tooltip>
        {legacyAttachmentUrl && (
          <>
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
          </>
        )}
        {uploading && <Tag color="blue">图片上传中…</Tag>}
      </Space>

      {hydrating && (
        <Alert
          type="info"
          showIcon
          message="正在读取原 HTML 文件…"
          style={{ marginBottom: 8 }}
        />
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          flex: 1,
          minHeight: 0,
        }}
      >
        <TextArea
          ref={(el) => {
            textareaRef.current = el?.resizableTextArea?.textArea ?? null;
          }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          readOnly={readOnly}
          autoSize={false}
          style={{
            height: '100%',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 13,
            resize: 'none',
            tabSize: 2,
          }}
          placeholder="<!DOCTYPE html>&#10;<html>&#10;<head><meta charset='utf-8'></head>&#10;<body>&#10;  ...&#10;</body>&#10;</html>"
          spellCheck={false}
        />
        {/* sandbox=allow-scripts lets the iframe's own <script> run for true
            preview fidelity; we deliberately omit allow-same-origin so scripts
            can't touch our cookie/DOM. allow-popups + allow-forms preserve
            common interactive HTML behavior. */}
        <iframe
          title="HTML 预览"
          srcDoc={previewSrcdoc}
          sandbox="allow-scripts allow-popups allow-forms"
          style={{
            width: '100%',
            height: '100%',
            border: '1px solid var(--jz-border)',
            borderRadius: 6,
            background: '#fff',
          }}
        />
      </div>
    </div>
  );
}
