import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dropdown, Input, Segmented, Tag, Tooltip, Typography } from 'antd';
import {
  BgColorsOutlined,
  CommentOutlined,
  SaveOutlined,
  UnderlineOutlined,
} from '@ant-design/icons';
import MarkdownQuickInsertButton from './toolbar/MarkdownQuickInsertButton';
import { renderMarkdown, wordCount } from '@/utils/markdown';
import MentionPicker from './MentionPicker';
import CodeBlockEnhancer from '@/components/common/CodeBlockEnhancer';
import { CALLOUT_TEMPLATES, TEXT_COLOR_PRESETS } from './callouts';
import type { MentionSuggestion } from '@/api/linking';
import { uploadFile } from '@/api/attachments';
import { message } from '@/utils/notify';
import { paperClassName } from '@/utils/paper';
import { flushOnUnmount, type EditorSaveHandle } from './editorSaveLifecycle';
import MarkdownSlashMenu, { useMarkdownSlashDisplayItems } from './MarkdownSlashMenu';
import {
  applyMarkdownSlashCommand,
  findSlashTrigger,
  getMarkdownInsertForCommand,
} from './markdownSlashActions';
import { trackRecentSlashCommand } from './slashCommandRegistry';
import type { SlashCommandItem } from './slashCommandRegistry';

const { TextArea } = Input;
const { Text } = Typography;

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Called when content has been stable for `autosaveMs` and differs from last saved. */
  onAutoSave?: (next: string) => Promise<void> | void;
  autosaveMs?: number;
  readOnly?: boolean;
  /** Document this editor is editing — used to attach pasted images. */
  documentId?: number;
  /** Lift the textarea element up so the outline panel can scroll/seek it. */
  onTextareaReady?: (el: HTMLTextAreaElement | null) => void;
  /** Paper-style preset key applied to the preview pane. */
  paperStyle?: string;
  /** Register saveNow for parent flush-before-publish / mode switch. */
  onSaveReady?: (handle: EditorSaveHandle | null) => void;
  /** When true, hide internal preview/split controls (page-level LivePreviewPane). */
  hideInternalPreview?: boolean;
}

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
type MdLayoutMode = 'split' | 'edit' | 'preview';
const MD_LAYOUT_KEY = 'jz-md-layout';

export default function MarkdownEditor({
  value,
  onChange: onChangeProp,
  onAutoSave,
  autosaveMs = 5000,
  readOnly = false,
  documentId,
  onTextareaReady,
  paperStyle,
  onSaveReady,
  hideInternalPreview = false,
}: Props) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [layoutMode, setLayoutMode] = useState<MdLayoutMode>(() => {
    try {
      const v = localStorage.getItem(MD_LAYOUT_KEY);
      if (v === 'edit' || v === 'preview' || v === 'split') return v;
    } catch {
      /* noop */
    }
    return 'split';
  });
  useEffect(() => {
    try {
      localStorage.setItem(MD_LAYOUT_KEY, layoutMode);
    } catch {
      /* noop */
    }
  }, [layoutMode]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashAnchor, setSlashAnchor] = useState<DOMRect | null>(null);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const slashTriggerRef = useRef<{ from: number; to: number } | null>(null);
  const slashDisplayItems = useMarkdownSlashDisplayItems(slashQuery);
  /** Cursor offset captured when @ trigger or button fired; insertion replaces text from here. */
  const triggerRangeRef = useRef<{ from: number; to: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const syncScrollLockRef = useRef(false);
  const lastSavedRef = useRef(value);
  /** Last value emitted via local onChange — used to tell server echoes from
   *  external updates (409 reload, version restore). */
  const lastLocalRef = useRef(value);
  /** Monotonic save seq so old async completions don't overwrite newer state. */
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

  // Wrap onChange so we can record local edits and distinguish them from
  // external updates (409 reload, version restore).
  const onChange = useCallback(
    (next: string) => {
      lastLocalRef.current = next;
      onChangeProp(next);
    },
    [onChangeProp],
  );

  useEffect(() => {
    lastSavedRef.current = value;
    lastLocalRef.current = value;
    setStatus('idle');
  }, []); // sync on mount; switching docs handled by parent <MarkdownEditor key={doc.id}>

  // External value sync (409 reload, version restore). Distinguish from a
  // server echo of our own save (value === lastSavedRef) and from local
  // typing (value === lastLocalRef).
  useEffect(() => {
    if (value === lastLocalRef.current) return;
    // External update: reset bookkeeping so status indicator clears.
    lastSavedRef.current = value;
    lastLocalRef.current = value;
    setStatus('idle');
  }, [value]);

  useEffect(() => {
    if (!onAutoSave) return;
    // value === lastSavedRef means we're echoing back the saved value — leave
    // the existing status (typically 'saved' after a write) alone.
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

  /** Force-save right now, skipping the autosave debounce. Used by the
   *  toolbar's 保存 button and the Ctrl/Cmd+S keyboard shortcut. */
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

  // Ctrl/⌘+S — manual save. Bound to the document so it fires even when the
  // textarea isn't focused (e.g. the user clicked into the preview pane).
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

  // Debounce the preview render so each keystroke doesn't reparse Markdown
  // + run DOMPurify on long documents (10k+ chars chokes on every char).
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedValue(value), 200);
    return () => window.clearTimeout(t);
  }, [value]);
  const html = useMemo(() => renderMarkdown(debouncedValue), [debouncedValue]);
  const count = useMemo(() => wordCount(value), [value]);

  function openMentionAtCursor() {
    const ta = textareaRef.current;
    const pos = ta?.selectionStart ?? value.length;
    triggerRangeRef.current = { from: pos, to: pos };
    setMentionOpen(true);
  }

  function updateSlashMenuFromCursor(ta: HTMLTextAreaElement, source: string) {
    const cursor = ta.selectionStart ?? 0;
    const trig = findSlashTrigger(source, cursor);
    if (trig) {
      slashTriggerRef.current = { from: trig.from, to: trig.to };
      setSlashQuery(trig.query);
      setSlashOpen(true);
      setSlashSelectedIndex(0);
      const rect = ta.getBoundingClientRect();
      setSlashAnchor(new DOMRect(rect.left + 12, rect.top + 28, 280, 0));
    } else {
      setSlashOpen(false);
      slashTriggerRef.current = null;
    }
  }

  function selectSlashItem(item: SlashCommandItem) {
    if (item.richTextOnly || !slashTriggerRef.current) return;
    const next = applyMarkdownSlashCommand(
      value,
      slashTriggerRef.current.from,
      slashTriggerRef.current.to,
      item,
    );
    if (next !== null) {
      trackRecentSlashCommand(item.title);
      onChange(next);
    }
    setSlashOpen(false);
    slashTriggerRef.current = null;
  }

  function insertFromQuickMenu(item: SlashCommandItem) {
    if (readOnly) return;
    const insert = getMarkdownInsertForCommand(item);
    if (insert === null) {
      if (item.id === 'mention') {
        openMentionAtCursor();
        return;
      }
      message.info('该块请切换到富文本编辑器');
      return;
    }
    const ta = textareaRef.current;
    const start = ta?.selectionStart ?? value.length;
    const end = ta?.selectionEnd ?? start;
    const next = value.slice(0, start) + insert + value.slice(end);
    trackRecentSlashCommand(item.title);
    onChange(next);
    const caret = start + insert.length;
    queueMicrotask(() => {
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (slashOpen && slashDisplayItems.length > 0) {
      const n = slashDisplayItems.length;
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashOpen(false);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashSelectedIndex((i) => (i + 1) % n);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashSelectedIndex((i) => (i + n - 1) % n);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const item = slashDisplayItems[slashSelectedIndex];
        if (item && !item.richTextOnly) {
          e.preventDefault();
          selectSlashItem(item);
        }
        return;
      }
    }

    // Open mention picker on standalone "@" keystroke and consume the keystroke.
    if (e.key === '@' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const ta = e.currentTarget;
      const pos = ta.selectionStart;
      triggerRangeRef.current = { from: pos, to: pos };
      setMentionOpen(true);
      return;
    }
    // Ctrl/⌘+U — wrap selection with <u>…</u>. The browser's default for
    // Ctrl+U inside a textarea is a noop, so we don't need to preventDefault
    // for compat, but doing so suppresses Firefox's "view source" shortcut
    // for completeness.
    if (
      (e.metaKey || e.ctrlKey) &&
      !e.shiftKey &&
      !e.altKey &&
      (e.key === 'u' || e.key === 'U')
    ) {
      e.preventDefault();
      wrapSelection('<u>', '</u>');
    }
  }

  /** Escape characters that would break the Markdown image syntax `![…](…)`. */
  function escapeMdAlt(s: string): string {
    return s.replace(/[\\[\]\n)]/g, (c) => (c === '\n' ? ' ' : '\\' + c));
  }

  /** Upload multiple files in order, building one big insertion. Re-reads live
   *  textarea content before each insertion so concurrent typing is preserved. */
  async function uploadAndInsertSequential(files: File[]) {
    const ta = textareaRef.current;
    let start = ta?.selectionStart ?? lastLocalRef.current.length;
    let end = ta?.selectionEnd ?? start;
    let caret = end;
    let any = false;
    for (const file of files) {
      const base = ta?.value ?? lastLocalRef.current;
      start = Math.min(start, base.length);
      end = Math.min(end, base.length);
      try {
        const att = await uploadFile(file, documentId);
        const next = ta?.value ?? lastLocalRef.current;
        const prevCharNeedsNl = start > 0 && next[start - 1] !== '\n';
        const altText = escapeMdAlt(att.original_filename || file.name);
        const insertion =
          (prevCharNeedsNl ? '\n' : '') + `![${altText}](${att.url})\n`;
        const merged = next.slice(0, start) + insertion + next.slice(end);
        lastLocalRef.current = merged;
        start += insertion.length;
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
  }

  /** Clipboard paste handler — intercept image-bearing paste and upload. */
  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (readOnly) return;
    const items = Array.from(e.clipboardData?.items ?? []);
    const images = items
      .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .filter((f): f is File => !!f);
    if (images.length === 0) return;
    e.preventDefault();
    await uploadAndInsertSequential(images);
  }

  /** Drop handler — same as paste but for dragged files. */
  async function handleDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    if (readOnly) return;
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
      f.type.startsWith('image/'),
    );
    if (files.length === 0) return;
    e.preventDefault();
    await uploadAndInsertSequential(files);
  }

  /** Without an explicit dragover preventDefault, browsers refuse the drop —
   *  the file is forwarded to the OS / new tab instead of our handler. */
  function handleDragOver(e: React.DragEvent<HTMLTextAreaElement>) {
    if (readOnly) return;
    const items = Array.from(e.dataTransfer?.items ?? []);
    if (items.some((i) => i.kind === 'file')) e.preventDefault();
  }

  function handleMentionSelect(s: MentionSuggestion) {
    const range = triggerRangeRef.current ?? { from: value.length, to: value.length };
    const insertion = `@[${s.title}](doc:${s.id})`;
    const next = value.slice(0, range.from) + insertion + value.slice(range.to);
    onChange(next);
    setMentionOpen(false);
    // Restore cursor after the inserted mention
    const newPos = range.from + insertion.length;
    queueMicrotask(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(newPos, newPos);
      }
    });
  }

  /** Wrap the current selection (or insert a placeholder) with an inline HTML
   * snippet. Used by the colour / underline / horizontal-rule buttons. */
  function wrapSelection(before: string, after: string, placeholder = '内容') {
    if (readOnly) return;
    const ta = textareaRef.current;
    const start = ta?.selectionStart ?? value.length;
    const end = ta?.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || placeholder;
    const insertion = before + selected + after;
    const next = value.slice(0, start) + insertion + value.slice(end);
    onChange(next);
    const cursorStart = start + before.length;
    const cursorEnd = cursorStart + selected.length;
    queueMicrotask(() => {
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(cursorStart, cursorEnd);
    });
  }

  /** Insert a fenced ``:::${slug}`` block at the current cursor; if there's a
   * non-empty selection, wrap it instead of replacing with placeholder text. */
  function insertCallout(slug: string) {
    if (readOnly) return;
    const ta = textareaRef.current;
    const start = ta?.selectionStart ?? value.length;
    const end = ta?.selectionEnd ?? value.length;
    const selected = value.slice(start, end);
    const body = selected.trim() || '在此输入内容…';
    // Make sure we're on a fresh line — Yuque-style callouts don't behave
    // well when squashed inline with prose.
    const prevCharNeedsNl = start > 0 && value[start - 1] !== '\n';
    const nextCharNeedsNl = end < value.length && value[end] !== '\n';
    const head = (prevCharNeedsNl ? '\n' : '') + `:::${slug}\n`;
    const tail = `\n:::` + (nextCharNeedsNl ? '\n' : '');
    const insertion = head + body + tail;
    const next = value.slice(0, start) + insertion + value.slice(end);
    onChange(next);
    // Drop the cursor inside the block so the user can start typing right away.
    const cursorAt = start + head.length + body.length;
    queueMicrotask(() => {
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(start + head.length, cursorAt);
    });
  }

  function onTextareaScroll(e: React.UIEvent<HTMLTextAreaElement>) {
    if (syncScrollLockRef.current) return;
    const ta = e.currentTarget;
    const preview = previewRef.current;
    if (!preview) return;
    const ratio = ta.scrollTop / Math.max(1, ta.scrollHeight - ta.clientHeight);
    syncScrollLockRef.current = true;
    preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight);
    requestAnimationFrame(() => { syncScrollLockRef.current = false; });
  }

  function onPreviewScroll(e: React.UIEvent<HTMLDivElement>) {
    if (syncScrollLockRef.current) return;
    const preview = e.currentTarget;
    const ta = textareaRef.current;
    if (!ta) return;
    const ratio = preview.scrollTop / Math.max(1, preview.scrollHeight - preview.clientHeight);
    syncScrollLockRef.current = true;
    ta.scrollTop = ratio * (ta.scrollHeight - ta.clientHeight);
    requestAnimationFrame(() => { syncScrollLockRef.current = false; });
  }

  const statusLabel: Record<SaveStatus, { text: string; color?: string }> = {
    idle: { text: '已同步' },
    pending: { text: '待保存…', color: 'orange' },
    saving: { text: '保存中…', color: 'blue' },
    saved: { text: '已保存', color: 'green' },
    error: { text: '保存失败', color: 'red' },
  };

  return (
    <div className="jz-editor-surface jz-md-editor-root">
      <div className="jz-editor-toolbar jz-editor-toolbar--compact" role="toolbar" aria-label="Markdown 工具栏">
        <div className="jz-editor-toolbar-meta">
          <Tag color={statusLabel[status].color} style={{ margin: 0 }}>
            {statusLabel[status].text}
          </Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>{count} 字</Text>
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
          {status === 'error' && onAutoSave && !readOnly && (
            <Button size="small" className="jz-toolbar-save-btn" onClick={() => void saveNow()}>
              重试
            </Button>
          )}
        </div>
        <div className="jz-editor-toolbar-main">
        <MarkdownQuickInsertButton onInsert={insertFromQuickMenu} disabled={readOnly} />
        <span className="jz-editor-toolbar-divider" aria-hidden />
        <Tooltip title="下划线 (Ctrl+U)">
          <Button
            size="small"
            icon={<UnderlineOutlined />}
            disabled={readOnly}
            onClick={() => wrapSelection('<u>', '</u>')}
          />
        </Tooltip>
        <Dropdown
          disabled={readOnly}
          menu={{
            items: TEXT_COLOR_PRESETS.map((c) => ({
              key: c.value,
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: c.value,
                      border: '1px solid var(--jz-border)',
                    }}
                  />
                  {c.label}
                </span>
              ),
              onClick: () => wrapSelection(`<span style="color:${c.value};">`, '</span>'),
            })),
          }}
        >
          <Tooltip title="文字颜色">
            <Button size="small" icon={<BgColorsOutlined />} disabled={readOnly} />
          </Tooltip>
        </Dropdown>
        <Dropdown
          disabled={readOnly}
          menu={{
            items: CALLOUT_TEMPLATES.map((t) => ({
              key: t.slug,
              label: (
                <span>
                  <span style={{ display: 'inline-block', minWidth: 90 }}>{t.label}</span>
                  <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                    {t.hint}
                  </Typography.Text>
                </span>
              ),
              onClick: () => insertCallout(t.slug),
            })),
          }}
        >
          <Tooltip title="插入色块 (callout)">
            <Button size="small" icon={<CommentOutlined />} disabled={readOnly}>
              色块 ▾
            </Button>
          </Tooltip>
        </Dropdown>
        {!hideInternalPreview && (
          <Segmented
            size="small"
            value={layoutMode}
            onChange={(v) => setLayoutMode(v as MdLayoutMode)}
            options={[
              { label: '编辑', value: 'edit' },
              { label: '预览', value: 'preview' },
              { label: '并排', value: 'split' },
            ]}
          />
        )}
        </div>
      </div>
      <div
        className="jz-md-editor-split jz-editor-content-area"
        style={{
          display: 'grid',
          gridTemplateColumns:
            hideInternalPreview || layoutMode === 'edit'
              ? '1fr'
              : layoutMode === 'preview'
                ? '1fr'
                : 'minmax(220px, 30%) minmax(0, 70%)',
          gap: 12,
          flex: 1,
          minHeight: 0,
        }}
      >
        {(hideInternalPreview || layoutMode !== 'preview') && (
        <TextArea
          ref={(el) => {
            const ta = el?.resizableTextArea?.textArea ?? null;
            textareaRef.current = ta;
            onTextareaReady?.(ta);
          }}
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            onChange(next);
            if (!readOnly) updateSlashMenuFromCursor(e.target, next);
          }}
          onKeyDown={handleKeyDown}
          onClick={(e) => updateSlashMenuFromCursor(e.currentTarget, value)}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onScroll={hideInternalPreview ? undefined : onTextareaScroll}
          readOnly={readOnly}
          autoSize={false}
          style={{
            height: '100%',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 14,
            resize: 'none',
          }}
          placeholder="使用 Markdown 书写；键入 @ 引用其他文档"
        />
        )}
        {!hideInternalPreview && layoutMode !== 'edit' && (
        <div
          ref={previewRef}
          className={`markdown-preview jz-md-editor-preview paper ${paperClassName(paperStyle)}`}
          style={{
            overflow: 'auto',
            padding: '24px 28px',
            border: '1px solid var(--glass-border, var(--jz-border))',
            borderRadius: 10,
            minHeight: layoutMode === 'preview' ? 'min(72vh, 900px)' : 0,
          }}
          onScroll={onPreviewScroll}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        )}
        {!hideInternalPreview && (
          <CodeBlockEnhancer selector=".jz-md-editor-preview" bindKey={html} />
        )}
      </div>
      <MentionPicker
        open={mentionOpen}
        onCancel={() => setMentionOpen(false)}
        onSelect={handleMentionSelect}
      />
      <MarkdownSlashMenu
        open={slashOpen}
        query={slashQuery}
        anchorRect={slashAnchor}
        selectedIndex={slashSelectedIndex}
        onSelect={selectSlashItem}
        onHoverIndex={setSlashSelectedIndex}
      />
    </div>
  );
}
