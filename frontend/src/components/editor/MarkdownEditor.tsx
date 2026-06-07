import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dropdown, Segmented, Tag, Tooltip, Typography } from 'antd';
import {
  BgColorsOutlined,
  CommentOutlined,
  SaveOutlined,
  UnderlineOutlined,
} from '@ant-design/icons';
import type { EditorView } from '@codemirror/view';
import MarkdownQuickInsertButton from './toolbar/MarkdownQuickInsertButton';
import { renderMarkdownForEditor, wordCount } from '@/utils/markdown';
import MentionPicker from './MentionPicker';
import LivePreviewPane from './LivePreviewPane';
import CodeMirrorMarkdown from './codemirror/CodeMirrorMarkdown';
import { getLineMap } from './codemirror/pure/lineMap';
import { syncEditorToPreview, syncPreviewToEditor } from './codemirror/scrollSync';
import type { EditorSurfaceHandle } from './surface/EditorSurface';
import { CALLOUT_TEMPLATES, TEXT_COLOR_PRESETS } from './callouts';
import type { MentionSuggestion } from '@/api/linking';
import { uploadFile } from '@/api/attachments';
import { message } from '@/utils/notify';
import { flushOnUnmount, type EditorSaveHandle } from './editorSaveLifecycle';
import MarkdownSlashMenu, { useMarkdownSlashDisplayItems } from './MarkdownSlashMenu';
import { findSlashTrigger, getMarkdownInsertForCommand } from './markdownSlashActions';
import { trackRecentSlashCommand } from './slashCommandRegistry';
import type { SlashCommandItem } from './slashCommandRegistry';

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
  /** Lift the editor surface up so the outline / find-replace can seek it. */
  onSurfaceReady?: (handle: EditorSurfaceHandle | null) => void;
  /** Paper-style preset key applied to the preview pane. */
  paperStyle?: string;
  /** Register saveNow for parent flush-before-publish / mode switch. */
  onSaveReady?: (handle: EditorSaveHandle | null) => void;
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
  onSurfaceReady,
  paperStyle,
  onSaveReady,
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
  const surfaceRef = useRef<EditorSurfaceHandle | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const previewElRef = useRef<HTMLDivElement | null>(null);
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
  // editor isn't focused (e.g. the user clicked into the preview pane).
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

  const count = useMemo(() => wordCount(value), [value]);

  // Debounced source for the line-map (matches LivePreviewPane's own 200ms
  // debounce so the preview HTML and the map describe the same snapshot).
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedValue(value), 200);
    return () => window.clearTimeout(t);
  }, [value]);
  const lineMap = useMemo(() => {
    // renderMarkdownForEditor is LRU-cached — LivePreviewPane renders the
    // same debounced source, so this is an O(1) cache hit, not a re-render.
    const { preprocessed } = renderMarkdownForEditor(debouncedValue);
    return getLineMap(debouncedValue, preprocessed);
  }, [debouncedValue]);
  const lineMapRef = useRef(lineMap);
  useEffect(() => {
    lineMapRef.current = lineMap;
  }, [lineMap]);

  /* ----------------------------- 斜杠菜单 ----------------------------- */

  const updateSlashFromView = useCallback(
    (view: EditorView) => {
      if (readOnly) return;
      const cursor = view.state.selection.main.head;
      const source = view.state.doc.toString();
      const trig = findSlashTrigger(source, cursor);
      if (trig) {
        slashTriggerRef.current = { from: trig.from, to: trig.to };
        setSlashQuery(trig.query);
        setSlashOpen(true);
        setSlashSelectedIndex(0);
        const c = view.coordsAtPos(cursor);
        if (c) setSlashAnchor(new DOMRect(c.left, c.bottom + 4, 280, 0));
      } else {
        setSlashOpen(false);
        slashTriggerRef.current = null;
      }
    },
    [readOnly],
  );

  function selectSlashItem(item: SlashCommandItem) {
    const surface = surfaceRef.current;
    if (item.richTextOnly || !slashTriggerRef.current || !surface) return;
    const insert = getMarkdownInsertForCommand(item);
    if (insert !== null) {
      trackRecentSlashCommand(item.title);
      surface.insertAt(slashTriggerRef.current.from, slashTriggerRef.current.to, insert);
    }
    setSlashOpen(false);
    slashTriggerRef.current = null;
  }

  function openMentionAtCursor() {
    const pos = surfaceRef.current?.getSelection().from ?? value.length;
    triggerRangeRef.current = { from: pos, to: pos };
    setMentionOpen(true);
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
    const surface = surfaceRef.current;
    if (!surface) return;
    const { from, to } = surface.getSelection();
    trackRecentSlashCommand(item.title);
    surface.insertAt(from, to, insert);
  }

  /* --------------------------- 键盘路由（CM keydown） --------------------------- */

  // Latest-state refs for the CM keydown handler (registered once inside CM).
  const slashStateRef = useRef({ open: slashOpen, items: slashDisplayItems, index: slashSelectedIndex });
  slashStateRef.current = { open: slashOpen, items: slashDisplayItems, index: slashSelectedIndex };

  const handleCmKeyDown = useCallback(
    (e: KeyboardEvent, view: EditorView): boolean => {
      if (readOnly) return false;
      const slash = slashStateRef.current;
      if (slash.open && slash.items.length > 0) {
        const n = slash.items.length;
        if (e.key === 'Escape') {
          setSlashOpen(false);
          return true;
        }
        if (e.key === 'ArrowDown') {
          setSlashSelectedIndex((i) => (i + 1) % n);
          return true;
        }
        if (e.key === 'ArrowUp') {
          setSlashSelectedIndex((i) => (i + n - 1) % n);
          return true;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          const item = slash.items[slash.index];
          if (item && !item.richTextOnly) {
            selectSlashItem(item);
            return true;
          }
          return false;
        }
      }

      // Open mention picker on standalone "@" keystroke and consume it.
      if (e.key === '@' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const pos = view.state.selection.main.head;
        triggerRangeRef.current = { from: pos, to: pos };
        setMentionOpen(true);
        return true;
      }
      // Ctrl/⌘+U — wrap selection with <u>…</u>.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'u' || e.key === 'U')) {
        surfaceRef.current?.wrapSelection('<u>', '</u>');
        return true;
      }
      return false;
    },
    // selectSlashItem reads refs/surface — safe to omit; readOnly is the only real dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readOnly],
  );

  /* ----------------------------- 图片上传 ----------------------------- */

  /** Escape characters that would break the Markdown image syntax `![…](…)`. */
  function escapeMdAlt(s: string): string {
    return s.replace(/[\\[\]\n)]/g, (c) => (c === '\n' ? ' ' : '\\' + c));
  }

  /** Upload multiple files in order, inserting each as it completes. All
   *  writes go through surface.insertAt → CM dispatch → onChange, so undo
   *  history and the save chain stay consistent with typing. */
  async function uploadAndInsertSequential(files: File[]) {
    const surface = surfaceRef.current;
    if (!surface) return;
    let { from: start, to: end } = surface.getSelection();
    for (const file of files) {
      try {
        const att = await uploadFile(file, documentId);
        const base = surface.getValue();
        start = Math.min(start, base.length);
        end = Math.min(end, base.length);
        const prevCharNeedsNl = start > 0 && base[start - 1] !== '\n';
        const altText = escapeMdAlt(att.original_filename || file.name);
        const insertion = (prevCharNeedsNl ? '\n' : '') + `![${altText}](${att.url})\n`;
        surface.insertAt(start, end, insertion);
        start += insertion.length;
        end = start;
      } catch (err) {
        message.error(err instanceof Error ? err.message : '图片上传失败');
      }
    }
  }

  function handleMentionSelect(s: MentionSuggestion) {
    const surface = surfaceRef.current;
    const range = triggerRangeRef.current ?? { from: value.length, to: value.length };
    const insertion = `@[${s.title}](doc:${s.id})`;
    surface?.insertAt(range.from, range.to, insertion);
    setMentionOpen(false);
  }

  /** Wrap the current selection (or insert a placeholder) with an inline HTML
   * snippet. Used by the colour / underline buttons. */
  function wrapSelection(before: string, after: string, placeholder = '内容') {
    if (readOnly) return;
    surfaceRef.current?.wrapSelection(before, after, placeholder);
  }

  /** Insert a fenced ``:::${slug}`` block at the current cursor; if there's a
   * non-empty selection, wrap it instead of replacing with placeholder text. */
  function insertCallout(slug: string) {
    if (readOnly) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    const base = surface.getValue();
    const { from: start, to: end } = surface.getSelection();
    // Make sure we're on a fresh line — Yuque-style callouts don't behave
    // well when squashed inline with prose.
    const prevCharNeedsNl = start > 0 && base[start - 1] !== '\n';
    const nextCharNeedsNl = end < base.length && base[end] !== '\n';
    const head = (prevCharNeedsNl ? '\n' : '') + `:::${slug}\n`;
    const tail = `\n:::` + (nextCharNeedsNl ? '\n' : '');
    surface.wrapSelection(head, tail, '在此输入内容…');
  }

  /* ----------------------------- 行级滚动同步 ----------------------------- */

  const handleCmScroll = useCallback((view: EditorView) => {
    if (syncScrollLockRef.current) return;
    const preview = previewElRef.current;
    if (!preview) return;
    syncScrollLockRef.current = true;
    syncEditorToPreview(view, preview, lineMapRef.current);
    requestAnimationFrame(() => {
      syncScrollLockRef.current = false;
    });
  }, []);

  const handlePreviewScroll = useCallback((el: HTMLDivElement) => {
    if (syncScrollLockRef.current) return;
    const view = viewRef.current;
    if (!view) return;
    syncScrollLockRef.current = true;
    syncPreviewToEditor(el, view, lineMapRef.current);
    requestAnimationFrame(() => {
      syncScrollLockRef.current = false;
    });
  }, []);

  const handlePreviewContainerReady = useCallback((el: HTMLDivElement | null) => {
    previewElRef.current = el;
  }, []);

  const handleSurfaceReady = useCallback(
    (handle: EditorSurfaceHandle | null) => {
      surfaceRef.current = handle;
      onSurfaceReady?.(handle);
    },
    [onSurfaceReady],
  );

  const handleViewReady = useCallback((view: EditorView | null) => {
    viewRef.current = view;
  }, []);

  const handleCmUpdate = useCallback(
    (info: { docChanged: boolean; selectionSet: boolean; view: EditorView }) => {
      updateSlashFromView(info.view);
    },
    [updateSlashFromView],
  );

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
        </div>
      </div>
      <div
        className="jz-md-editor-split jz-editor-content-area"
        style={{
          display: 'grid',
          gridTemplateColumns:
            layoutMode === 'split' ? 'minmax(280px, 1fr) minmax(0, 1fr)' : '1fr',
          gap: 12,
          minHeight: 0,
        }}
      >
        <div style={{ display: layoutMode === 'preview' ? 'none' : 'block', minHeight: 0, minWidth: 0 }}>
          <CodeMirrorMarkdown
            value={value}
            onChange={onChange}
            readOnly={readOnly}
            placeholder="使用 Markdown 书写；键入 / 唤起插入菜单，@ 引用其他文档"
            onUpdate={handleCmUpdate}
            onScroll={layoutMode === 'split' ? handleCmScroll : undefined}
            onKeyDown={handleCmKeyDown}
            onPasteFiles={readOnly ? undefined : (files) => void uploadAndInsertSequential(files)}
            onDropFiles={readOnly ? undefined : (files) => void uploadAndInsertSequential(files)}
            onSurfaceReady={handleSurfaceReady}
            onViewReady={handleViewReady}
          />
        </div>
        {layoutMode !== 'edit' && (
          <LivePreviewPane
            source={value}
            kind="markdown"
            paperStyle={paperStyle}
            showToc={layoutMode === 'preview'}
            sourceMap
            className="jz-md-editor-preview"
            onScrollContainerReady={handlePreviewContainerReady}
            onScroll={layoutMode === 'split' ? handlePreviewScroll : undefined}
          />
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
