import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dropdown, Segmented, Tag, Tooltip, Typography } from 'antd';
import {
  BgColorsOutlined,
  BoldOutlined,
  CodeOutlined,
  CommentOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  ItalicOutlined,
  OrderedListOutlined,
  QuestionCircleOutlined,
  SaveOutlined,
  StrikethroughOutlined,
  UnderlineOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import type { EditorView } from '@codemirror/view';
import { Compartment } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { useNavigate } from 'react-router-dom';
import MarkdownQuickInsertButton from './toolbar/MarkdownQuickInsertButton';
import { renderMarkdownForEditor, wordCount } from '@/utils/markdown';
import MentionPicker from './MentionPicker';
import LivePreviewPane from './LivePreviewPane';
import CodeMirrorMarkdown from './codemirror/CodeMirrorMarkdown';
import FloatingFormatToolbar, { type FloatCommand } from './codemirror/FloatingFormatToolbar';
import MathEditorModal from './MathEditorModal';
import ShortcutCheatSheet from './ShortcutCheatSheet';
import { listKeymap } from './codemirror/extensions/listKeymap';
import { inlineFormatKeymap } from './codemirror/extensions/inlineFormatKeymap';
import { tableAssistKeymap } from './codemirror/extensions/tableAssist';
import { livePreview } from './codemirror/extensions/livePreview';
import { headingNumber } from './codemirror/extensions/headingNumber';
import {
  addColumnAfter,
  addRowAfter,
  cellIndexAt,
  deleteColumn,
  deleteRow,
  findTableRange,
  formatTable,
  isTableLine,
} from './codemirror/pure/tableFormat';
import TableFloatingBar from './codemirror/TableFloatingBar';
import LinkFloatingMenu, { type LinkMenuCommand } from './codemirror/LinkFloatingMenu';
import { findLinkAt, linkToCard, linkToPlain, linkToTitle } from './codemirror/pure/linkAt';
import { browseHref, classifyHref, fetchTitleForHref, isBareUrlText } from '@/utils/linkModes';
import {
  clearInlineFormat,
  makeLink,
  toggleLinePrefix,
  toggleWrap,
  type EditInstruction,
} from './codemirror/pure/inlineFormat';
import { getLineMap } from './codemirror/pure/lineMap';
import { syncEditorToPreview, syncPreviewToEditor } from './codemirror/scrollSync';
import type { EditorSurfaceHandle } from './surface/EditorSurface';
import { CALLOUT_TEMPLATES, TEXT_COLOR_PRESETS } from './callouts';
import type { MentionSuggestion } from '@/api/linking';
import { uploadFile } from '@/api/attachments';
import { message } from '@/utils/notify';
import { flushOnUnmount, type EditorSaveHandle } from './editorSaveLifecycle';
import { draftBackupKey } from '@/utils/localDraftBackup';
import MarkdownSlashMenu, { useMarkdownSlashDisplayItems } from './MarkdownSlashMenu';
import {
  findSlashTrigger,
  getMarkdownInsertForCommand,
  isMarkdownCapable,
  markdownInteractiveKind,
} from './markdownSlashActions';
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
  /** Yuque-style hierarchical heading numbering (display-only). */
  headingNumbering?: boolean;
  /** Register saveNow for parent flush-before-publish / mode switch. */
  onSaveReady?: (handle: EditorSaveHandle | null) => void;
}

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
type MdLayoutMode = 'split' | 'edit' | 'preview';
const MD_LAYOUT_KEY = 'jz-md-layout';

const CALLOUT_LAST_KEY = 'jz-callout-last';
const LIVE_PREVIEW_KEY = 'jz-md-livepreview';

function loadLivePreviewOn(): boolean {
  try {
    return localStorage.getItem(LIVE_PREVIEW_KEY) !== 'false'; // 默认开
  } catch {
    return true;
  }
}

export default function MarkdownEditor({
  value,
  onChange: onChangeProp,
  onAutoSave,
  autosaveMs = 5000,
  readOnly = false,
  documentId,
  onSurfaceReady,
  paperStyle,
  headingNumbering = false,
  onSaveReady,
}: Props) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  /** flush effect 的 deps 为 []，闭包里的 documentId 会过期 —— 经 ref 读最新值。 */
  const documentIdRef = useRef(documentId);
  documentIdRef.current = documentId;
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
  /** @ 选择器的插入形态：普通提及链接 or 文档卡片。 */
  const mentionKindRef = useRef<'mention' | 'doc-card'>('mention');
  /** 数学可视化 Modal：打开时记录待替换范围与块级/行内形态。 */
  const [mathModal, setMathModal] = useState<{
    open: boolean;
    displayMode: boolean;
    range: { from: number; to: number };
  }>({ open: false, displayMode: true, range: { from: 0, to: 0 } });
  const [cheatOpen, setCheatOpen] = useState(false);
  /** Live Preview（就地渲染）开关 + 实例级 Compartment（挂载时装配进 CM）。 */
  const [lpOn, setLpOn] = useState<boolean>(loadLivePreviewOn);
  const lpCompartmentRef = useRef(new Compartment());
  /** 章节自动编号（显示层）——实例级 Compartment，挂载时按 prop 装配，切换时 reconfigure。 */
  const hnCompartmentRef = useRef(new Compartment());
  const headingNumberingRef = useRef(headingNumbering);
  headingNumberingRef.current = headingNumbering;
  const cmExtraExtensions = useMemo(
    () => [
      tableAssistKeymap,
      listKeymap,
      inlineFormatKeymap,
      lpCompartmentRef.current.of(loadLivePreviewOn() ? livePreview() : []),
      hnCompartmentRef.current.of(headingNumberingRef.current ? headingNumber() : []),
    ],
    [],
  );
  const toggleLivePreview = useCallback(() => {
    setLpOn((on) => {
      const next = !on;
      try {
        localStorage.setItem(LIVE_PREVIEW_KEY, String(next));
      } catch {
        /* noop */
      }
      viewRef.current?.dispatch({
        effects: lpCompartmentRef.current.reconfigure(next ? livePreview() : []),
      });
      return next;
    });
  }, []);
  // Reconfigure the heading-numbering compartment when the doc toggle flips.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: hnCompartmentRef.current.reconfigure(headingNumbering ? headingNumber() : []),
    });
  }, [headingNumbering]);
  /** callout 记住上次颜色（语雀同款）。 */
  const [lastCallout, setLastCallout] = useState<string>(() => {
    try {
      return localStorage.getItem(CALLOUT_LAST_KEY) || 'tips';
    } catch {
      return 'tips';
    }
  });
  /** 选区浮动格式条锚点（视口坐标）。 */
  const [floatAnchor, setFloatAnchor] = useState<{ left: number; top: number } | null>(null);
  const floatTimerRef = useRef<number | null>(null);
  /** 表格浮动操作条锚点（光标进表格时显示）。 */
  const [tableBarAnchor, setTableBarAnchor] = useState<{ left: number; top: number } | null>(null);
  /** 语雀式链接菜单：光标落在 [text](url) 上时显示（锚点 + 当前链接信息）。 */
  const [linkMenu, setLinkMenu] = useState<{
    anchor: { left: number; top: number };
    href: string;
    text: string;
  } | null>(null);
  const [linkTitleLoading, setLinkTitleLoading] = useState(false);
  const navigate = useNavigate();
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
        backupKey: documentIdRef.current
          ? draftBackupKey(documentIdRef.current, 'flush')
          : undefined,
      });
    };
  }, []);

  useEffect(() => {
    return () => {
      if (floatTimerRef.current) window.clearTimeout(floatTimerRef.current);
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
    // numbering 必须与 LivePreviewPane 的调用一致：缓存 key 含 'N|' 前缀，
    // 键不齐会 cache MISS 白跑一次完整渲染。
    const { preprocessed } = renderMarkdownForEditor(debouncedValue, {
      numbering: headingNumbering,
    });
    return getLineMap(debouncedValue, preprocessed);
  }, [debouncedValue, headingNumbering]);
  const lineMapRef = useRef(lineMap);
  useEffect(() => {
    lineMapRef.current = lineMap;
  }, [lineMap]);

  /* ----------------------------- 斜杠菜单 ----------------------------- */

  const updateSlashFromView = useCallback(
    (view: EditorView) => {
      if (readOnly) return;
      const cursor = view.state.selection.main.head;
      // 只取光标行：findSlashTrigger 语义本就行内（query 含换行即 null），
      // 全文 doc.toString() 每次光标移动物化整个 rope，大文档下是热点。
      const line = view.state.doc.lineAt(cursor);
      const local = findSlashTrigger(line.text, cursor - line.from);
      const trig = local
        ? { from: local.from + line.from, to: local.to + line.from, query: local.query }
        : null;
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

  /** MD 专属交互命令（@提及 / 文档卡 / 数学 Modal），range = 待替换区间。 */
  function runInteractive(
    kind: 'mention' | 'doc-card' | 'math-block' | 'math-inline',
    range: { from: number; to: number },
  ) {
    if (kind === 'mention' || kind === 'doc-card') {
      mentionKindRef.current = kind;
      triggerRangeRef.current = range;
      setMentionOpen(true);
      return;
    }
    setMathModal({ open: true, displayMode: kind === 'math-block', range });
  }

  function selectSlashItem(item: SlashCommandItem) {
    const surface = surfaceRef.current;
    const trigger = slashTriggerRef.current;
    if (!isMarkdownCapable(item) || !trigger || !surface) return;
    setSlashOpen(false);
    slashTriggerRef.current = null;
    trackRecentSlashCommand(item.title);
    const interactive = markdownInteractiveKind(item);
    if (interactive) {
      // 先吃掉 /query 触发文本，再弹交互层
      surface.insertAt(trigger.from, trigger.to, '');
      runInteractive(interactive, { from: trigger.from, to: trigger.from });
      return;
    }
    const insert = getMarkdownInsertForCommand(item);
    if (insert !== null) {
      surface.insertAt(trigger.from, trigger.to, insert);
    }
  }

  function insertFromQuickMenu(item: SlashCommandItem) {
    if (readOnly) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    const interactive = markdownInteractiveKind(item);
    if (interactive) {
      trackRecentSlashCommand(item.title);
      const { from } = surface.getSelection();
      runInteractive(interactive, { from, to: from });
      return;
    }
    const insert = getMarkdownInsertForCommand(item);
    if (insert === null) {
      message.info('该块请切换到富文本编辑器');
      return;
    }
    const { from, to } = surface.getSelection();
    trackRecentSlashCommand(item.title);
    surface.insertAt(from, to, insert);
  }

  /** 数学 Modal 确认：按形态写入 $$..$$ / $..$。 */
  function handleMathSubmit(latex: string) {
    const surface = surfaceRef.current;
    const { displayMode, range } = mathModal;
    setMathModal((m) => ({ ...m, open: false }));
    if (!surface || !latex.trim()) return;
    const insert = displayMode ? `$$\n${latex.trim()}\n$$\n` : `$${latex.trim()}$`;
    surface.insertAt(range.from, range.to, insert);
  }

  /* --------------------------- 键盘路由（CM keydown） --------------------------- */

  // Latest-state refs for the CM keydown handler (registered once inside CM).
  // IME 守卫（isComposing / keyCode 229）在 CodeMirrorMarkdown 的
  // domEventHandlers 层统一拦截，组字期间本路由不会被调用。
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
          if (item && isMarkdownCapable(item)) {
            selectSlashItem(item);
            return true;
          }
          return false;
        }
      }

      // "@" — 打开提及选择器，但不吞键：字面 @ 先落入文档，选中文档时
      // 连同 @ 一起替换；取消则保留字面 @（邮箱 / @media 等场景的转义出口）。
      if (e.key === '@' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const pos = view.state.selection.main.head;
        triggerRangeRef.current = { from: pos, to: pos + 1 };
        window.setTimeout(() => setMentionOpen(true), 0);
        return false;
      }
      // Ctrl/⌘+U — wrap selection with <u>…</u>.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'u' || e.key === 'U')) {
        surfaceRef.current?.wrapSelection('<u>', '</u>');
        return true;
      }
      // Ctrl/⌘+/ — 快捷键速查
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        setCheatOpen(true);
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
    const insertion =
      mentionKindRef.current === 'doc-card'
        ? `\n[[doc-card:${s.id}]]\n`
        : `@[${s.title}](doc:${s.id})`;
    surface?.insertAt(range.from, range.to, insertion);
    setMentionOpen(false);
    mentionKindRef.current = 'mention';
  }

  /** Wrap the current selection (or insert a placeholder) with an inline HTML
   * snippet. Used by the colour / underline buttons. */
  function wrapSelection(before: string, after: string, placeholder = '内容') {
    if (readOnly) return;
    surfaceRef.current?.wrapSelection(before, after, placeholder);
  }

  /* --------------------------- 格式命令（工具栏 + 浮动条共用） --------------------------- */

  function applyEdit(ins: EditInstruction) {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      changes: { from: ins.from, to: ins.to, insert: ins.insert },
      selection: { anchor: ins.selFrom, head: ins.selTo },
      scrollIntoView: true,
      userEvent: 'input.format',
    });
    view.focus();
  }

  function runFormat(cmd: FloatCommand, arg?: string) {
    const view = viewRef.current;
    if (!view || readOnly) return;
    const sel = view.state.selection.main;
    const doc = view.state.doc.toString();
    switch (cmd) {
      case 'color':
        if (arg) wrapSelection(`<span style="color:${arg};">`, '</span>');
        break;
      case 'bold':
        applyEdit(toggleWrap(doc, sel.from, sel.to, '**', '加粗文本'));
        break;
      case 'italic':
        applyEdit(toggleWrap(doc, sel.from, sel.to, '*', '斜体文本'));
        break;
      case 'strike':
        applyEdit(toggleWrap(doc, sel.from, sel.to, '~~', '删除线'));
        break;
      case 'code':
        applyEdit(toggleWrap(doc, sel.from, sel.to, '`', '代码'));
        break;
      case 'underline':
        wrapSelection('<u>', '</u>');
        break;
      case 'link':
        applyEdit(makeLink(doc, sel.from, sel.to));
        break;
      case 'clear':
        applyEdit(clearInlineFormat(doc, sel.from, sel.to));
        break;
    }
    // 不主动收起浮动条：操作后选区仍在（语雀同款），可连续叠加格式
  }

  /** 光标是否位于 fence / 行内代码（链接菜单在代码里不打扰）。 */
  function inCodeContext(view: EditorView, pos: number): boolean {
    let node: { name: string; parent: unknown } | null = syntaxTree(view.state).resolveInner(
      pos,
      -1,
    );
    while (node) {
      if (/FencedCode|CodeBlock|InlineCode|CodeText/.test(node.name)) return true;
      node = node.parent as { name: string; parent: unknown } | null;
    }
    return false;
  }

  /** 语雀式链接菜单命令：三形态切换 + 打开动作。派发前重新定位光标处
   * 链接（异步取标题期间用户可能已编辑），href 变了就放弃，绝不误改。 */
  async function runLinkCommand(cmd: LinkMenuCommand) {
    const view = viewRef.current;
    if (!view || readOnly) return;
    const doc = view.state.doc.toString();
    const link = findLinkAt(doc, view.state.selection.main.head);
    if (!link) return;
    const cls = classifyHref(link.href);
    switch (cmd) {
      case 'plain':
        if (!isBareUrlText(link.text)) applyEdit(linkToPlain(link));
        break;
      case 'title': {
        if (linkTitleLoading) return;
        setLinkTitleLoading(true);
        try {
          const title = await fetchTitleForHref(link.href);
          if (!title) {
            message.info('未能获取标题');
            return;
          }
          const view2 = viewRef.current;
          if (!view2) return;
          const link2 = findLinkAt(view2.state.doc.toString(), view2.state.selection.main.head);
          if (!link2 || link2.href !== link.href || link2.text === title) return;
          applyEdit(linkToTitle(link2, title));
        } finally {
          setLinkTitleLoading(false);
        }
        break;
      }
      case 'card': {
        if (cls.kind === 'other') return;
        const placeholder =
          cls.kind === 'doc' ? `[[doc-card:${cls.id}]]` : `[[link-card:${cls.url}]]`;
        applyEdit(linkToCard(doc, link, placeholder));
        break;
      }
      case 'open-doc':
        if (cls.kind === 'doc') navigate(browseHref(cls));
        break;
      case 'browse':
        window.open(browseHref(cls), '_blank', 'noopener');
        break;
    }
  }

  /** 行级命令：标题 / 列表 / 引用，作用于选区覆盖的整行。 */
  function runLineCommand(
    cmd: 'heading-1' | 'heading-2' | 'heading-3' | 'bullet' | 'ordered' | 'quote',
  ) {
    const view = viewRef.current;
    if (!view || readOnly) return;
    const sel = view.state.selection.main;
    const fromLine = view.state.doc.lineAt(sel.from);
    const toLine = view.state.doc.lineAt(sel.to);
    const block = view.state.sliceDoc(fromLine.from, toLine.to);
    const next = toggleLinePrefix(block, cmd);
    view.dispatch({
      changes: { from: fromLine.from, to: toLine.to, insert: next },
      scrollIntoView: true,
      userEvent: 'input.format',
    });
    view.focus();
  }

  /** Insert a fenced ``:::${slug}`` block at the current cursor; if there's a
   * non-empty selection, wrap it instead of replacing with placeholder text. */
  function insertCallout(slug: string) {
    if (readOnly) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    // 记住上次颜色（语雀同款）：下次直接点主按钮即用
    setLastCallout(slug);
    try {
      localStorage.setItem(CALLOUT_LAST_KEY, slug);
    } catch {
      /* noop */
    }
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

  /* ----------------------------- 表格命令 ----------------------------- */

  function runTableCommand(kind: 'format' | 'row' | 'col' | 'del-row' | 'del-col') {
    const view = viewRef.current;
    if (!view || readOnly) return;
    const sel = view.state.selection.main;
    const cursorLine = view.state.doc.lineAt(sel.head);
    const allLines = view.state.doc.toString().split('\n');
    const range = findTableRange(allLines, cursorLine.number - 1);
    if (!range) {
      message.info('请把光标放在表格内');
      return;
    }
    const startLine = view.state.doc.line(range.start + 1);
    const endLine = view.state.doc.line(range.end + 1);
    const block = view.state.sliceDoc(startLine.from, endLine.to);
    const rowIdx = cursorLine.number - 1 - range.start;
    const colIdx = cellIndexAt(cursorLine.text, sel.head - cursorLine.from) ?? 0;
    let next: string | null = null;
    switch (kind) {
      case 'format':
        next = formatTable(block);
        break;
      case 'row':
        next = addRowAfter(block, rowIdx);
        break;
      case 'col':
        next = addColumnAfter(block, colIdx);
        break;
      case 'del-row':
        next = deleteRow(block, rowIdx);
        if (next === null) message.info('表头与分隔行不可删（或表格只剩一行）');
        break;
      case 'del-col':
        next = deleteColumn(block, colIdx);
        if (next === null) message.info('表格只剩一列，不可再删');
        break;
    }
    if (next === null || next === block) return;
    view.dispatch({
      changes: { from: startLine.from, to: endLine.to, insert: next },
      scrollIntoView: true,
      userEvent: 'input.format',
    });
    view.focus();
  }

  /* ----------------------------- 行级滚动同步 ----------------------------- */

  const handleCmScroll = useCallback((view: EditorView) => {
    setFloatAnchor(null); // 视口坐标随滚动失效，先收起
    setTableBarAnchor(null);
    setLinkMenu(null);
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
      const sel = info.view.state.selection.main;
      // 表格浮动操作条：光标（空选区）在表格内 → 锚到表格首行上方
      if (sel.empty && !readOnly) {
        const line = info.view.state.doc.lineAt(sel.head);
        if (isTableLine(line.text)) {
          const allLines = info.view.state.doc.toString().split('\n');
          const range = findTableRange(allLines, line.number - 1);
          if (range) {
            const headLine = info.view.state.doc.line(range.start + 1);
            const c = info.view.coordsAtPos(headLine.from);
            if (c) setTableBarAnchor({ left: c.left, top: c.top });
          }
          setLinkMenu(null); // 表格条优先，避免双浮层叠放
        } else {
          setTableBarAnchor(null);
          // 语雀式链接菜单：光标落在 [text](url) 上（fence/行内代码除外）。
          // findLinkAt 只扫光标行 —— 传行文本 + 局部偏移，免去每次光标
          // 移动的全文 doc.toString()（大文档热点），结果平移回绝对偏移。
          const local = findLinkAt(line.text, sel.head - line.from);
          const link = local
            ? {
                ...local,
                from: local.from + line.from,
                to: local.to + line.from,
                atFrom: local.atFrom + line.from,
              }
            : null;
          if (link && !inCodeContext(info.view, sel.head)) {
            const c = info.view.coordsAtPos(link.from);
            if (c) {
              setLinkMenu({
                anchor: { left: c.left, top: c.bottom + 6 },
                href: link.href,
                text: link.text,
              });
            } else {
              setLinkMenu(null);
            }
          } else {
            setLinkMenu(null);
          }
        }
      } else {
        setTableBarAnchor(null);
        setLinkMenu(null);
      }
      // 选区浮动格式条：选区稳定 200ms 后在选区起点上方弹出
      if (floatTimerRef.current) {
        window.clearTimeout(floatTimerRef.current);
        floatTimerRef.current = null;
      }
      if (sel.empty || readOnly) {
        setFloatAnchor(null);
        return;
      }
      floatTimerRef.current = window.setTimeout(() => {
        const view = viewRef.current;
        if (!view) return;
        const s = view.state.selection.main;
        if (s.empty) return;
        const c = view.coordsAtPos(Math.min(s.from, s.to));
        if (c) setFloatAnchor({ left: c.left, top: c.top });
      }, 200);
    },
    [updateSlashFromView, readOnly],
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
        <Dropdown
          disabled={readOnly}
          menu={{
            items: [
              { key: 'heading-1', label: 'H1 一级标题', onClick: () => runLineCommand('heading-1') },
              { key: 'heading-2', label: 'H2 二级标题', onClick: () => runLineCommand('heading-2') },
              { key: 'heading-3', label: 'H3 三级标题', onClick: () => runLineCommand('heading-3') },
              { type: 'divider' as const },
              { key: 'quote', label: '> 引用', onClick: () => runLineCommand('quote') },
            ],
          }}
        >
          <Tooltip title="标题 / 引用">
            <Button size="small" className="jz-toolbar-dropdown-btn" disabled={readOnly}>
              H ▾
            </Button>
          </Tooltip>
        </Dropdown>
        <Tooltip title="加粗 (Ctrl+B)">
          <Button
            size="small"
            className="jz-toolbar-icon-btn"
            icon={<BoldOutlined />}
            disabled={readOnly}
            onClick={() => runFormat('bold')}
          />
        </Tooltip>
        <Tooltip title="斜体 (Ctrl+I)">
          <Button
            size="small"
            className="jz-toolbar-icon-btn"
            icon={<ItalicOutlined />}
            disabled={readOnly}
            onClick={() => runFormat('italic')}
          />
        </Tooltip>
        <Tooltip title="删除线 (Ctrl+Shift+X)">
          <Button
            size="small"
            className="jz-toolbar-icon-btn"
            icon={<StrikethroughOutlined />}
            disabled={readOnly}
            onClick={() => runFormat('strike')}
          />
        </Tooltip>
        <Tooltip title="行内代码 (Ctrl+E)">
          <Button
            size="small"
            className="jz-toolbar-icon-btn"
            icon={<CodeOutlined />}
            disabled={readOnly}
            onClick={() => runFormat('code')}
          />
        </Tooltip>
        <Tooltip title="下划线 (Ctrl+U)">
          <Button
            size="small"
            className="jz-toolbar-icon-btn"
            icon={<UnderlineOutlined />}
            disabled={readOnly}
            onClick={() => wrapSelection('<u>', '</u>')}
          />
        </Tooltip>
        <span className="jz-editor-toolbar-divider" aria-hidden />
        <Tooltip title="无序列表">
          <Button
            size="small"
            className="jz-toolbar-icon-btn"
            icon={<UnorderedListOutlined />}
            disabled={readOnly}
            onClick={() => runLineCommand('bullet')}
          />
        </Tooltip>
        <Tooltip title="有序列表">
          <Button
            size="small"
            className="jz-toolbar-icon-btn"
            icon={<OrderedListOutlined />}
            disabled={readOnly}
            onClick={() => runLineCommand('ordered')}
          />
        </Tooltip>
        <span className="jz-editor-toolbar-divider" aria-hidden />
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
        <Dropdown.Button
          size="small"
          disabled={readOnly}
          className="jz-callout-dropdown-btn"
          onClick={() => insertCallout(lastCallout)}
          menu={{
            selectedKeys: [lastCallout],
            items: CALLOUT_TEMPLATES.map((t) => ({
              key: t.slug,
              label: (
                <span>
                  <span style={{ display: 'inline-block', minWidth: 90 }}>
                    {t.label}
                    {t.slug === lastCallout ? ' ✓' : ''}
                  </span>
                  <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                    {t.hint}
                  </Typography.Text>
                </span>
              ),
              onClick: () => insertCallout(t.slug),
            })),
          }}
        >
          <Tooltip
            title={`插入色块（上次：${CALLOUT_TEMPLATES.find((t) => t.slug === lastCallout)?.label ?? lastCallout}）`}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <CommentOutlined /> 色块
            </span>
          </Tooltip>
        </Dropdown.Button>
        <Dropdown
          disabled={readOnly}
          menu={{
            items: [
              { key: 'format', label: '一键对齐格式化', onClick: () => runTableCommand('format') },
              { type: 'divider' as const },
              { key: 'row', label: '下方插入行', onClick: () => runTableCommand('row') },
              { key: 'col', label: '右侧插入列', onClick: () => runTableCommand('col') },
              { type: 'divider' as const },
              { key: 'del-row', label: '删除当前行', danger: true, onClick: () => runTableCommand('del-row') },
              { key: 'del-col', label: '删除当前列', danger: true, onClick: () => runTableCommand('del-col') },
            ],
          }}
        >
          <Tooltip title="表格操作（光标需在表格内；Tab 跳格 / 回车加行）">
            <Button size="small" className="jz-toolbar-dropdown-btn" disabled={readOnly}>
              表格 ▾
            </Button>
          </Tooltip>
        </Dropdown>
        <span style={{ marginLeft: 'auto' }} />
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
        <Tooltip title={lpOn ? '就地渲染：开（点击切纯源码）' : '就地渲染：关（点击开启）'}>
          <Button
            size="small"
            className={`jz-toolbar-icon-btn${lpOn ? ' is-active' : ''}`}
            icon={lpOn ? <EyeOutlined /> : <EyeInvisibleOutlined />}
            onClick={toggleLivePreview}
          />
        </Tooltip>
        <Tooltip title="键盘快捷键 (Ctrl+/)">
          <Button
            size="small"
            className="jz-toolbar-icon-btn"
            icon={<QuestionCircleOutlined />}
            onClick={() => setCheatOpen(true)}
          />
        </Tooltip>
        </div>
      </div>
      <div className={`jz-md-editor-split jz-editor-content-area is-${layoutMode}`}>
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
            extraExtensions={cmExtraExtensions}
          />
        </div>
        {layoutMode !== 'edit' && (
          <LivePreviewPane
            source={value}
            kind="markdown"
            paperStyle={paperStyle}
            numbering={headingNumbering}
            showToc={layoutMode === 'preview'}
            sourceMap
            className="jz-md-editor-preview"
            onScrollContainerReady={handlePreviewContainerReady}
            onScroll={layoutMode === 'split' ? handlePreviewScroll : undefined}
          />
        )}
      </div>
      <FloatingFormatToolbar anchor={readOnly ? null : floatAnchor} onCommand={runFormat} />
      <TableFloatingBar anchor={readOnly ? null : tableBarAnchor} onCommand={runTableCommand} />
      <LinkFloatingMenu
        anchor={readOnly ? null : (linkMenu?.anchor ?? null)}
        isDoc={linkMenu ? classifyHref(linkMenu.href).kind === 'doc' : false}
        canCard={linkMenu ? classifyHref(linkMenu.href).kind !== 'other' : false}
        plainActive={linkMenu ? isBareUrlText(linkMenu.text) : false}
        titleLoading={linkTitleLoading}
        onCommand={(cmd) => void runLinkCommand(cmd)}
      />
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
      <MathEditorModal
        open={mathModal.open}
        initial=""
        displayMode={mathModal.displayMode}
        onCancel={() => setMathModal((m) => ({ ...m, open: false }))}
        onSubmit={handleMathSubmit}
      />
      <ShortcutCheatSheet open={cheatOpen} onClose={() => setCheatOpen(false)} />
    </div>
  );
}
