import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, ReactNodeViewRenderer, useEditor, useEditorState } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { TableRow } from '@tiptap/extension-table';
import { ColorTable } from './TableMarkdown';
import { ColorTableCell, ColorTableHeader, CELL_BG_PRESETS } from './TableCellColor';
import { TableInteractions, currentColIndex, currentRowIndex } from './tableInteractions';
import { TableMaxRows } from './TableMaxRows';
import TableOverlay from './TableOverlay';
import { ResizableImage } from './ResizableImage';
import { ImageUpload } from './imageUpload';
import { Underline } from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Superscript } from '@tiptap/extension-superscript';
import { Subscript } from '@tiptap/extension-subscript';
import Highlight from '@tiptap/extension-highlight';
import { FontFamily } from '@tiptap/extension-font-family';
import { FontSize, FONT_FAMILY_PRESETS } from './FontSize';
import { Indent } from './Indent';
import TextAlign from '@tiptap/extension-text-align';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { Markdown } from 'tiptap-markdown';
import GlobalDragHandle from 'tiptap-extension-global-drag-handle';
import CodeBlockView from './CodeBlockView';
import CalloutExtension from './CalloutExtension';
import { AnnotationMark } from './AnnotationMark';
import { VideoEmbed } from './VideoEmbed';
import { InlineToc } from './InlineToc';
import { DetailsBlock } from './DetailsBlock';
import { Columns, Column } from './Columns';
import { DragToColumns } from './DragToColumns';
import { EmojiSuggestion } from './EmojiSuggestion';
import { HeadingFold } from './HeadingFold';
import { HeadingNumber } from './HeadingNumber';
import { Tabs, TabPanel } from './Tabs';
import { DocCardEmbed } from './DocCardEmbed';
import { LinkCardEmbed } from './LinkCardEmbed';
import { Footnote } from './Footnote';
import { MathInline, MathBlock } from './MathNode';
import { CALLOUT_TEMPLATES } from './callouts';
import { Button, Checkbox, Dropdown, Input, Modal, Popover, Space, Tag, Tooltip, Typography } from 'antd';
import {
  AlignCenterOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
  BgColorsOutlined,
  BoldOutlined,
  CheckSquareOutlined,
  CodeOutlined,
  CommentOutlined,
  ClearOutlined,
  FormatPainterOutlined,
  ItalicOutlined,
  LinkOutlined,
  OrderedListOutlined,
  RedoOutlined,
  SaveOutlined,
  StrikethroughOutlined,
  UnderlineOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { SlashCommand } from './slashCommand';
import { FindReplace } from './findReplace';
import MentionPicker from './MentionPicker';
import LinkBubbleMenu from './LinkBubbleMenu';
import { LinkPasteAutoTitle, applyAutoTitle } from './linkAutoTitle';
import { canonicalHref, classifyHref } from '@/utils/linkModes';
import type { Editor } from '@tiptap/core';
import type { MentionSuggestion } from '@/api/linking';
import { wordCount, preprocessMarkdown } from '@/utils/markdown';
import { flushOnUnmount } from './editorSaveLifecycle';
import { draftBackupKey } from '@/utils/localDraftBackup';
import { escapeFenceAttr, parseCodeFenceInfo, serializeCodeFenceInfo } from '@/utils/codeFenceMeta';
import { uploadFile } from '@/api/attachments';
import { message } from '@/utils/notify';
import { useDocLinkHoverCards, DocHoverCard } from '@/components/common/DocHoverCard';
import { BlockHoverMenu } from './BlockHoverMenu';
import { AIAssistantMenu, triggerAIGenerateFromEditor } from './AIAssistant';
import AIPromptInline from './ai/AIPromptInline';
import { setInsertMenuActions, type InsertMenuActions } from './insertMenuActions';
import QuickInsertButton from './toolbar/QuickInsertButton';
import { paperClassName } from '@/utils/paper';
import DocumentOutline from './DocumentOutline';
import { CloseOutlined } from '@ant-design/icons';
import HeadingBlockDropdown from './toolbar/HeadingBlockDropdown';
import MoreMarksDropdown from './toolbar/MoreMarksDropdown';
import FontSizeDropdown from './toolbar/FontSizeDropdown';
import HighlightColorDropdown from './toolbar/HighlightColorDropdown';
import { applyHeadingBlock, type HeadingLevel } from './toolbar/headingBlock';
import JzIcon from '@/components/common/JzIcon';

const { Text } = Typography;

const lowlight = createLowlight(common);

/** Text-colour palette is shared with MarkdownEditor via ``callouts.ts``.
 *  Prepend a "reset" option so the Tiptap user can clear the colour mark. */
import { TEXT_COLOR_PRESETS as BASE_COLOR_PRESETS } from './callouts';
const TEXT_COLOR_PRESETS = [
  { label: '默认 / 取消', value: 'reset' },
  ...BASE_COLOR_PRESETS,
];

/** Tiptap Color only parses ``<span style>`` by default — add ``<font>`` fallback. */
const ExtendedColor = Color.extend({
  parseHTML() {
    return [
      {
        tag: 'span',
        getAttrs: (element: HTMLElement) => {
          const color = element.style?.color;
          return color ? { color } : false;
        },
      },
      {
        tag: 'font',
        getAttrs: (element: HTMLElement) => {
          const color = element.style?.color || element.getAttribute('color');
          return color ? { color } : false;
        },
      },
    ];
  },
});

/** Preprocess Yuque/legacy MD on paste before ProseMirror ingests plain text. */
const MarkdownPreprocessPaste = Extension.create({
  name: 'markdownPreprocessPaste',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          transformPastedText(text) {
            return preprocessMarkdown(text);
          },
        },
      }),
    ];
  },
});

interface Props {
  /** Markdown source — authoritative storage. */
  value: string;
  /** Called with the editor's serialized Markdown after each change. */
  onChange: (next: string) => void;
  /** Debounced autosave; called only when changes stabilize. */
  onAutoSave?: (next: string) => Promise<void> | void;
  autosaveMs?: number;
  readOnly?: boolean;
  /** Document this editor is editing. Used to attach pasted/dropped images
   *  to the right document on upload. */
  documentId?: number;
  /** Lift the Tiptap editor instance up so siblings (outline, find-replace)
   *  can read state and dispatch commands. Called with ``null`` on unmount. */
  onEditorReady?: (editor: import('@tiptap/core').Editor | null) => void;
  /** Paper-background preset key (see utils/paper.ts). Applied to the editor
   *  shell so the writer sees what the reader will see. */
  paperStyle?: string;
  /** Yuque-style hierarchical heading numbering (display-only). */
  headingNumbering?: boolean;
  /** Bump to force external value sync (e.g. 409 conflict) even when focused. */
  forceSyncRevision?: number;
  onSaveReady?: (handle: import('./editorSaveLifecycle').EditorSaveHandle | null) => void;
}

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export default function RichTextEditor({
  value,
  onChange,
  onAutoSave,
  autosaveMs = 5000,
  readOnly = false,
  documentId,
  onEditorReady,
  paperStyle,
  headingNumbering = false,
  forceSyncRevision = 0,
  onSaveReady,
}: Props) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  /** Read at editor-creation time for the initial HeadingNumber config; the
   *  effect below keeps it live afterwards without re-creating the editor. */
  const headingNumberingRef = useRef(headingNumbering);
  headingNumberingRef.current = headingNumbering;
  const [mentionOpen, setMentionOpen] = useState(false);
  const setMentionOpenRef = useRef(setMentionOpen);
  useEffect(() => {
    setMentionOpenRef.current = setMentionOpen;
  }, []);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentFileInputRef = useRef<HTMLInputElement | null>(null);
  const [, setUploading] = useState(false);
  const lastSavedRef = useRef(value);
  /** Last markdown emitted via onChange (live editor view). Used to detect
   *  whether prop `value` is a server echo or an out-of-band external update. */
  const lastEmittedRef = useRef(value);
  /** Monotonic save sequence so old completions don't clobber newer state. */
  const saveSeqRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  // Link popover
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkInput, setLinkInput] = useState('https://');
  const [linkNewTab, setLinkNewTab] = useState(true);

  // onUpdate fires on every keystroke. Serializing the whole doc to Markdown
  // (getMarkdown) and lifting state to the parent each time causes noticeable
  // typing lag in long documents — debounce so we only do it after the user
  // pauses for ~200ms. saveNow reads fresh markdown straight from the editor,
  // so manual save isn't blocked by the debounce.
  const onChangeTimerRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  const onAutoSaveRef = useRef(onAutoSave);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    onAutoSaveRef.current = onAutoSave;
  }, [onAutoSave]);

  const editorInstanceRef = useRef<Editor | null>(null);
  /** flush effect 的 deps 为 []，闭包里的 documentId 会过期 —— 经 ref 读最新值。 */
  const documentIdRef = useRef(documentId);
  documentIdRef.current = documentId;

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      // Link / Underline are bundled into StarterKit ≥ 3.x — disable the
      // bundled versions so our standalone Link/Underline imports don't
      // collide ("Duplicate extension names" warning).
      StarterKit.configure({
        codeBlock: false,
        link: false,
        underline: false,
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      CodeBlockLowlight.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            title: {
              default: '',
              parseHTML: (el) => el.getAttribute('data-title') ?? '',
              renderHTML: (attrs) => (attrs.title ? { 'data-title': attrs.title } : {}),
            },
            collapsed: {
              default: false,
              parseHTML: (el) => el.getAttribute('data-collapsed') === 'true',
              renderHTML: (attrs) => (attrs.collapsed ? { 'data-collapsed': 'true' } : {}),
            },
            // Per-block source-highlighting theme. '' = inherit the global
            // default (jz-code-theme). An explicit value here overrides it and
            // is isolated to this block — changing one block no longer recolours
            // every other code block in the document.
            theme: {
              default: '',
              parseHTML: (el) =>
                el.getAttribute('data-code-theme-explicit') === 'true'
                  ? el.getAttribute('data-code-theme') ?? ''
                  : '',
              renderHTML: (attrs) =>
                attrs.theme
                  ? { 'data-code-theme': attrs.theme, 'data-code-theme-explicit': 'true' }
                  : {},
            },
            // Per-diagram Mermaid graphic palette. '' = follow the document
            // theme. Isolated to this block, so pinning one diagram's colours
            // never touches the others.
            mermaidTheme: {
              default: '',
              parseHTML: (el) => el.getAttribute('data-mermaid-theme') ?? '',
              renderHTML: (attrs) =>
                attrs.mermaidTheme ? { 'data-mermaid-theme': attrs.mermaidTheme } : {},
            },
          };
        },
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockView);
        },
        addStorage() {
          return {
            markdown: {
              // tiptap-markdown serializer state — loosely typed upstream.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              serialize(state: any, node: any) {
                const info = serializeCodeFenceInfo(
                  (node.attrs.language as string) || '',
                  (node.attrs.title as string) || '',
                  Boolean(node.attrs.collapsed),
                  (node.attrs.theme as string) || '',
                  (node.attrs.mermaidTheme as string) || ''
                );
                state.write('```' + info + '\n');
                state.text(node.textContent, false);
                state.ensureNewLine();
                state.write('```');
                state.closeBlock(node);
              },
              parse: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setup(markdownit: any) {
                  markdownit.set({ langPrefix: 'language-' });
                  const defaultFence = markdownit.renderer.rules.fence;
                  if (!defaultFence) return;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  markdownit.renderer.rules.fence = (tokens: any, idx: any, options: any, env: any, self: any) => {
                    const token = tokens[idx];
                    const meta = parseCodeFenceInfo((token.info || '').trim());
                    let html = defaultFence(tokens, idx, options, env, self);
                    if (meta.title || meta.collapsed || meta.theme || meta.mermaidTheme) {
                      const attrs: string[] = [];
                      if (meta.title) attrs.push(`data-title="${escapeFenceAttr(meta.title)}"`);
                      if (meta.collapsed) attrs.push('data-collapsed="true"');
                      if (meta.theme) {
                        attrs.push(`data-code-theme="${escapeFenceAttr(meta.theme)}"`);
                        attrs.push('data-code-theme-explicit="true"');
                      }
                      if (meta.mermaidTheme) {
                        attrs.push(`data-mermaid-theme="${escapeFenceAttr(meta.mermaidTheme)}"`);
                      }
                      html = html.replace(/^<pre>/, `<pre ${attrs.join(' ')}>`);
                    }
                    return html;
                  };
                },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                updateDOM(element: any) {
                  element.innerHTML = element.innerHTML.replace(
                    /\n<\/code><\/pre>/g,
                    '</code></pre>'
                  );
                },
              },
            },
          };
        },
      }).configure({ lowlight, defaultLanguage: 'plaintext' }),
      // protocols 必须放行内部 doc: 协议 —— Tiptap v3 Link 的 isAllowedUri
      // 白名单（http/https/mailto…）默认拒收 doc:，markdown 重载时
      // `[标题](doc:ID)` mention 的 link mark 会被静默剥成纯文本。
      Link.configure({ openOnClick: false, autolink: true, protocols: ['doc'] }),
      Placeholder.configure({ placeholder: '键入 / 选择块类型；键入 @ 引用其他文档' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      ColorTable.configure({ resizable: true }),
      TableRow,
      ColorTableHeader,
      ColorTableCell,
      TableInteractions,
      TableMaxRows,
      ResizableImage.configure({
        // Make images selectable and HTML-export friendly. The default schema
        // is already a block-level node so TextAlign can layout it.
        inline: false,
        allowBase64: false,
        // Propagate so the NodeView's crop modal can attach the cropped upload
        // to the right document.
        documentId,
      }),
      ImageUpload.configure({
        documentId,
        onError: (msg) => {
          // eslint-disable-next-line no-console
          console.warn('图片上传失败:', msg);
        },
        onUploading: setUploading,
      }),
      Underline,
      TextStyle,
      ExtendedColor,
      Highlight.configure({ multicolor: true }),
      Superscript,
      Subscript,
      FontFamily.configure({ types: ['textStyle'] }),
      FontSize,
      Indent,
      // 文字 / 图片 / 标题 / 引用都支持 ←/↔/→ 对齐。defaultAlignment 'left' 不
      // 落到 attrs 上，避免无意义的 style="text-align:left" 占满 markdown 输出。
      TextAlign.configure({
        types: ['heading', 'paragraph', 'blockquote', 'image'],
        alignments: ['left', 'center', 'right'],
        defaultAlignment: 'left',
      }),
      CalloutExtension,
      AnnotationMark,
      VideoEmbed,
      InlineToc,
      DetailsBlock,
      Columns,
      Column,
      DragToColumns,
      Tabs,
      TabPanel,
      DocCardEmbed,
      LinkCardEmbed,
      Footnote,
      MathInline,
      MathBlock,
      Markdown.configure({
        html: true,
        tightLists: true,
        linkify: true,
        breaks: true,
        transformPastedText: true,
      }),
      MarkdownPreprocessPaste,
      LinkPasteAutoTitle,
      SlashCommand,
      EmojiSuggestion,
      HeadingFold,
      HeadingNumber.configure({ enabled: headingNumberingRef.current }),
      FindReplace,
      GlobalDragHandle.configure({
        dragHandleSelector: '.jz-block-drag-handle',
        dragHandleWidth: 20,
      }),
    ],
    editorProps: {
      handleKeyDown: (_view, event) => {
        // IME 组合期间（isComposing / keyCode 229）交还输入法处理，
        // 否则中文选词回车 / 组合中的 @ 会被下面的拦截劫持。
        if (event.isComposing || event.keyCode === 229) return false;
        if (event.key === '@' && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          setMentionOpenRef.current(true);
          return true;
        }
        const ed = editorInstanceRef.current;
        if (!ed) return false;
        const mod = event.metaKey || event.ctrlKey;
        if (mod && !event.shiftKey && (event.key === 'e' || event.key === 'E')) {
          event.preventDefault();
          ed.chain().focus().toggleCode().run();
          return true;
        }
        if (mod && !event.shiftKey && event.key === '/') {
          event.preventDefault();
          ed.chain().focus().insertContent('/').run();
          return true;
        }
        const alt = event.altKey;
        if (alt && mod) {
          const digit = event.key;
          if (digit >= '0' && digit <= '6') {
            event.preventDefault();
            if (digit === '0') applyHeadingBlock(ed, 'paragraph');
            else applyHeadingBlock(ed, Number(digit) as HeadingLevel);
            return true;
          }
        }
        return false;
      },
    },
    // tiptap-markdown registers a parser that recognizes Markdown when `content` is a string.
    content: preprocessMarkdown(value || ''),
    onCreate: ({ editor: ed }) => {
      editorInstanceRef.current = ed;
    },
    onUpdate: ({ editor }) => {
      editorInstanceRef.current = editor;
      if (onChangeTimerRef.current) window.clearTimeout(onChangeTimerRef.current);
      onChangeTimerRef.current = window.setTimeout(() => {
        const md: string = editor.storage.markdown?.getMarkdown?.() ?? '';
        lastEmittedRef.current = md;
        onChangeRef.current(md);
      }, 200);
    },
  });

  // Mirror the editor instance into a ref so cleanup can flush even after
  // React has cleared the closure-captured `editor` from useEditor.
  const editorRef = useRef<typeof editor>(editor);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Flush pending onChange debounce + fire-and-forget autosave on unmount.
  useEffect(() => {
    return () => {
      if (onChangeTimerRef.current) {
        window.clearTimeout(onChangeTimerRef.current);
        onChangeTimerRef.current = null;
      }
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      flushOnUnmount({
        getLiveContent: () => {
          const e = editorRef.current;
          return e?.storage.markdown?.getMarkdown?.() ?? lastEmittedRef.current;
        },
        lastSaved: lastSavedRef.current,
        lastEmitted: lastEmittedRef.current,
        onChange: (md) => {
          lastEmittedRef.current = md;
          onChangeRef.current(md);
        },
        onAutoSave: onAutoSaveRef.current,
        saveSeqRef,
        lastSavedRef,
        lastEmittedRef,
        backupKey: documentIdRef.current
          ? draftBackupKey(documentIdRef.current, 'flush')
          : undefined,
      });
    };
  }, []);

  // 把 editor 实例提升给宿主，便于大纲 / 查找替换等侧栏组件使用
  useEffect(() => {
    if (!onEditorReady) return;
    onEditorReady(editor ?? null);
    return () => onEditorReady(null);
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  // Keep the display-only heading numbering in sync with the doc toggle without
  // re-creating the editor (setHeadingNumbering flips the decoration plugin).
  useEffect(() => {
    if (!editor) return;
    editor.commands.setHeadingNumbering(headingNumbering);
  }, [editor, headingNumbering]);

  // Sync external value (409 conflict reload, version restore). Guarded so
  // we never overwrite local edits that are still inside the 200ms debounce.
  useEffect(() => {
    if (!editor) return;
    const current = editor.storage.markdown?.getMarkdown?.() ?? '';
    if (value === current) {
      // Server echo: refresh save bookkeeping so the status indicator clears.
      lastSavedRef.current = value;
      lastEmittedRef.current = value;
      return;
    }
    if (forceSyncRevision === 0) {
      if (editor.isFocused) return;
      if (onChangeTimerRef.current) return;
      if (current !== lastEmittedRef.current) return;
    } else if (onChangeTimerRef.current) {
      window.clearTimeout(onChangeTimerRef.current);
      onChangeTimerRef.current = null;
    }
    editor.commands.setContent(preprocessMarkdown(value), { emitUpdate: false });
    lastSavedRef.current = value;
    lastEmittedRef.current = value;
    setStatus('idle');
  }, [editor, value, forceSyncRevision]);

  // Autosave — read LIVE markdown from the editor so saves don't lag the
  // 200ms onChange debounce.
  useEffect(() => {
    if (!onAutoSave) return;
    if (value === lastSavedRef.current) return;
    setStatus('pending');
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const mySeq = ++saveSeqRef.current;
    timerRef.current = window.setTimeout(async () => {
      setStatus('saving');
      const ed = editorRef.current;
      const liveMd: string = ed?.storage.markdown?.getMarkdown?.() ?? value;
      try {
        await onAutoSave(liveMd);
        if (mySeq !== saveSeqRef.current) return; // a newer save superseded us
        lastSavedRef.current = liveMd;
        lastEmittedRef.current = liveMd;
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

  /** Force-save now, skipping the autosave debounce. Triggered from the
   *  toolbar 保存 button and the Ctrl/Cmd+S keyboard shortcut. */
  const saveNow = useCallback(async () => {
    if (!onAutoSave) return;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Bypass the 200ms onChange debounce: read the current Markdown straight
    // from the editor so Ctrl+S never loses the most recent keystrokes.
    if (onChangeTimerRef.current) {
      window.clearTimeout(onChangeTimerRef.current);
      onChangeTimerRef.current = null;
    }
    const md: string = editor?.storage.markdown?.getMarkdown?.() ?? value;
    if (md !== lastEmittedRef.current) {
      lastEmittedRef.current = md;
      onChangeRef.current(md);
    }
    if (md === lastSavedRef.current && status === 'saved') return;
    const mySeq = ++saveSeqRef.current;
    setStatus('saving');
    try {
      await onAutoSave(md);
      if (mySeq !== saveSeqRef.current) return;
      lastSavedRef.current = md;
      setStatus('saved');
    } catch {
      if (mySeq !== saveSeqRef.current) return;
      setStatus('error');
    }
  }, [editor, onAutoSave, value, status]);

  useEffect(() => {
    if (!onAutoSave) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        void saveNow();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveNow, onAutoSave]);

  useEffect(() => {
    onSaveReady?.({ saveNow });
    return () => onSaveReady?.(null);
  }, [saveNow, onSaveReady]);

  const openLinkPopover = useCallback(() => {
    if (!editor) return;
    const attrs = editor.getAttributes('link');
    setLinkInput((attrs.href as string | undefined) ?? 'https://');
    setLinkNewTab((attrs.target as string | undefined) === '_blank');
    setLinkPopoverOpen(true);
  }, [editor]);

  function confirmLink() {
    if (!editor) return;
    const url = linkInput.trim();
    if (!url || url === 'https://') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else if (editor.state.selection.empty && !editor.isActive('link')) {
      // 光标处无选区也无既有链接：直接插入链接文本并异步转标题（默认标题）
      const href = canonicalHref(classifyHref(url));
      editor
        .chain()
        .focus()
        .insertContent([
          {
            type: 'text',
            text: href,
            marks: [{ type: 'link', attrs: { href, target: linkNewTab ? '_blank' : null } }],
          },
        ])
        .run();
      void applyAutoTitle(editor, href);
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({
        href: url,
        target: linkNewTab ? '_blank' : null,
      }).run();
    }
    setLinkPopoverOpen(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        openLinkPopover();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openLinkPopover]);

  // ── 图片上传按钮 ──────────────────────────────────────────────────
  async function handleImageFile(file: File) {
    if (!editor) return;
    try {
      const att = await uploadFile(file, documentId);
      // setImage is provided by the Image extension; ResizableImage inherits it
      editor.chain().focus().setImage({ src: att.url, alt: att.original_filename }).run();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '图片上传失败');
    }
  }
  function handleImageInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void handleImageFile(file);
  }

  async function handleAttachmentFile(file: File) {
    if (!editor) return;
    try {
      const att = await uploadFile(file, documentId);
      const label = att.original_filename || '附件';
      editor
        .chain()
        .focus()
        .insertContent(`[${label}](${att.url})`)
        .run();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '附件上传失败');
    }
  }

  function handleAttachmentInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void handleAttachmentFile(file);
  }

  const insertMenuActions: InsertMenuActions = useMemo(
    () => ({
      pickImage: () => imageFileInputRef.current?.click(),
      pickAttachment: () => attachmentFileInputRef.current?.click(),
      openMention: () => setMentionOpen(true),
      openEmoji: () => {
        editor?.chain().focus().insertContent(':').run();
      },
      openAI: () => setAiPromptOpen(true),
      openLink: () => openLinkPopover(),
    }),
    // `value` is intentionally omitted — none of these actions read it, so
    // keeping it here re-built the memo (and re-ran setInsertMenuActions) on
    // every keystroke.
    [editor, openLinkPopover]
  );

  useEffect(() => {
    setInsertMenuActions(insertMenuActions);
    return () => setInsertMenuActions(null);
  }, [insertMenuActions]);

  // ── 行内批注 ──────────────────────────────────────────────────────
  const [aiPromptOpen, setAiPromptOpen] = useState(false);

  const [annotationModalOpen, setAnnotationModalOpen] = useState(false);
  const [annotationInput, setAnnotationInput] = useState('');
  const [annotationEditMode, setAnnotationEditMode] = useState(false);
  // Hover tooltip for existing annotations
  const [annotationHover, setAnnotationHover] = useState<{
    text: string;
    x: number;
    y: number;
    transform: string;
  } | null>(null);

  // Table right-click context menu
  const [tableCtxMenu, setTableCtxMenu] = useState<{ x: number; y: number } | null>(null);

  function openAnnotationModal() {
    if (!editor) return;
    const isEditing = editor.isActive('annotation');
    setAnnotationInput(isEditing ? (editor.getAttributes('annotation').text as string ?? '') : '');
    setAnnotationEditMode(isEditing);
    setAnnotationModalOpen(true);
  }

  function confirmAnnotation() {
    if (!editor) return;
    if (annotationInput.trim()) {
      editor.chain().focus().setMark('annotation', { text: annotationInput.trim() }).run();
    } else {
      editor.chain().focus().unsetMark('annotation').run();
    }
    setAnnotationModalOpen(false);
  }

  function removeAnnotation() {
    if (!editor) return;
    editor.chain().focus().unsetMark('annotation').run();
    setAnnotationModalOpen(false);
  }

  // ── 格式刷 ────────────────────────────────────────────────────────
  // Captures the inline marks at the user's current cursor / selection and
  // applies them to the next non-empty selection on mouseup. One-shot.
  const [painterArmed, setPainterArmed] = useState(false);
  const [painterPersist, setPainterPersist] = useState(false);
  const painterMarksRef = useRef<Array<{ name: string; attrs: Record<string, unknown> }>>([]);
  const painterLastClickRef = useRef<number>(0);

  function togglePainter() {
    if (!editor) return;
    const now = Date.now();
    const isDoubleClick = painterArmed && (now - painterLastClickRef.current < 200);
    painterLastClickRef.current = now;

    if (painterArmed) {
      if (isDoubleClick && !painterPersist) {
        setPainterPersist(true);
        return;
      }
      setPainterArmed(false);
      setPainterPersist(false);
      painterMarksRef.current = [];
      return;
    }

    const { state } = editor;
    const { from, to } = state.selection;
    const collected: Array<{ name: string; attrs: Record<string, unknown> }> = [];
    const seen = new Set<string>();
    function take(name: string, attrs: Record<string, unknown>) {
      const key = name + JSON.stringify(attrs ?? {});
      if (seen.has(key)) return;
      seen.add(key);
      collected.push({ name, attrs });
    }
    if (from !== to) {
      state.doc.nodesBetween(from, to, (n) => {
        for (const m of n.marks) take(m.type.name, m.attrs as Record<string, unknown>);
      });
    } else {
      const $pos = state.doc.resolve(from);
      for (const m of $pos.marks()) take(m.type.name, m.attrs as Record<string, unknown>);
    }
    if (collected.length === 0) {
      message.info('当前位置无可复制的格式');
      return;
    }
    painterMarksRef.current = collected;
    setPainterArmed(true);
  }

  useEffect(() => {
    if (!editor || !painterArmed) return;
    function applyOnMouseUp() {
      if (!editor || !painterArmed) return;
      const { from, to, empty } = editor.state.selection;
      if (empty) return;
      const chain = editor.chain().focus();
      for (const { name, attrs } of painterMarksRef.current) {
        chain.setMark(name, attrs);
      }
      chain.setTextSelection({ from, to }).run();
      if (!painterPersist) {
        setPainterArmed(false);
        painterMarksRef.current = [];
      }
    }
    document.addEventListener('mouseup', applyOnMouseUp);
    return () => document.removeEventListener('mouseup', applyOnMouseUp);
  }, [editor, painterArmed, painterPersist]);

  useEffect(() => {
    if (!tableCtxMenu) return;
    const close = () => setTableCtxMenu(null);
    document.addEventListener('click', close);
    document.addEventListener('contextmenu', close);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('contextmenu', close);
    };
  }, [tableCtxMenu]);

  function handleMentionSelect(s: MentionSuggestion) {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContent([
        { type: 'text', text: '@' },
        {
          type: 'text',
          text: s.title,
          marks: [{ type: 'link', attrs: { href: `doc:${s.id}` } }],
        },
        { type: 'text', text: ' ' },
      ])
      .run();
    setMentionOpen(false);
  }

  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const { hover, setHover } = useDocLinkHoverCards(editorShellRef);

  // Fullscreen / immersive mode
  const [fullscreen, setFullscreen] = useState(false);
  const [fsOutlineOpen, setFsOutlineOpen] = useState(true);
  useEffect(() => {
    if (!fullscreen) {
      document.body.classList.remove('jz-fullscreen-active');
      return;
    }
    // 让外层 CSS 隐藏 AdminLayout 的 sider / header
    document.body.classList.add('jz-fullscreen-active');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('jz-fullscreen-active');
    };
  }, [fullscreen]);

  const count = useMemo(() => wordCount(value), [value]);
  /** Live markdown for toolbar dirty-state (save button). Serializing the whole
   *  doc (getMarkdown) on *every* keystroke + re-rendering the toolbar is a
   *  primary source of typing lag in long docs — debounce so it runs only
   *  after the user pauses. The save button being briefly stale (~250ms) is
   *  harmless; Ctrl/⌘+S (saveNow) always reads fresh markdown. */
  const [liveMd, setLiveMd] = useState(value);
  useEffect(() => {
    if (!editor) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sync = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setLiveMd(editor.storage.markdown?.getMarkdown?.() ?? '');
      }, 250);
    };
    // Prime once immediately so the initial dirty state is correct.
    setLiveMd(editor.storage.markdown?.getMarkdown?.() ?? '');
    editor.on('update', sync);
    return () => {
      if (timer) clearTimeout(timer);
      editor.off('update', sync);
    };
  }, [editor]);
  useEffect(() => {
    setLiveMd(value);
  }, [value]);

  const statusLabel: Record<SaveStatus, { text: string; color?: string }> = {
    idle: { text: '已同步' },
    pending: { text: '待保存…', color: 'orange' },
    saving: { text: '保存中…', color: 'blue' },
    saved: { text: '已保存', color: 'green' },
    error: { text: '保存失败', color: 'red' },
  };

  // Tiptap v3 的 useEditor 不随 transaction 重渲 —— 工具栏 / 气泡菜单在
  // render 里直接 editor.isActive() 只能拿到陈旧快照（光标移动后高亮不
  // 更新）。所有激活态统一经 useEditorState 订阅（与 LinkBubbleMenu 同构）。
  const ui = useEditorState({
    editor,
    selector: ({ editor: ed }) =>
      ed
        ? {
            bold: ed.isActive('bold'),
            italic: ed.isActive('italic'),
            underline: ed.isActive('underline'),
            strike: ed.isActive('strike'),
            code: ed.isActive('code'),
            link: ed.isActive('link'),
            blockquote: ed.isActive('blockquote'),
            annotation: ed.isActive('annotation'),
            bulletList: ed.isActive('bulletList'),
            orderedList: ed.isActive('orderedList'),
            taskList: ed.isActive('taskList'),
            alignLeft: ed.isActive({ textAlign: 'left' }),
            alignCenter: ed.isActive({ textAlign: 'center' }),
            alignRight: ed.isActive({ textAlign: 'right' }),
          }
        : null,
  });

  if (!editor) return null;

  return (
    <div
      className={fullscreen ? 'jz-fullscreen-shell' : 'jz-editor-surface'}
      style={
        fullscreen
          ? undefined
          : { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }
      }
    >
      {fullscreen && (
        <>
          {/* 大纲切换浮按钮 */}
          <button
            type="button"
            className="jz-fullscreen-outline-toggle"
            onClick={() => setFsOutlineOpen((v) => !v)}
            title={fsOutlineOpen ? '关闭大纲' : '显示大纲'}
            aria-label="大纲"
          >
            <UnorderedListOutlined />
          </button>
          {/* 退出全屏浮按钮 — 顶部右上角，独立于工具栏 */}
          <button
            type="button"
            className="jz-fullscreen-exit"
            onClick={() => setFullscreen(false)}
            title="退出全屏 (Esc)"
            aria-label="退出全屏"
          >
            <CloseOutlined />
            <span className="jz-fullscreen-exit-label">退出全屏 · Esc</span>
          </button>
          {/* 右侧大纲抽屉 */}
          {fsOutlineOpen && (
            <aside className="jz-fullscreen-outline" aria-label="大纲">
              <div className="jz-fullscreen-outline-title">大纲</div>
              <div className="jz-fullscreen-outline-body">
                <DocumentOutline editor={editor} />
              </div>
            </aside>
          )}
        </>
      )}
      <div className="jz-editor-toolbar" role="toolbar" aria-label="编辑器工具栏">
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
              disabled={
                readOnly ||
                !onAutoSave ||
                (status === 'saved' && liveMd === lastSavedRef.current)
              }
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
        <QuickInsertButton editor={editor} actions={insertMenuActions} disabled={readOnly} />
        <Popover
          open={linkPopoverOpen}
          onOpenChange={(v) => { if (!v) setLinkPopoverOpen(false); }}
          title="插入链接"
          placement="bottomLeft"
          destroyOnHidden
          content={
            <div style={{ width: 280 }}>
              <Input
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                placeholder="https://..."
                onPressEnter={confirmLink}
                autoFocus
                style={{ marginBottom: 8 }}
              />
              <div style={{ marginBottom: 8 }}>
                <Checkbox checked={linkNewTab} onChange={(e) => setLinkNewTab(e.target.checked)}>
                  在新标签页打开
                </Checkbox>
              </div>
              <Space>
                <Button size="small" type="primary" onClick={confirmLink}>确定</Button>
                {(ui?.link ?? false) && (
                  <Button size="small" danger onClick={() => {
                    editor.chain().focus().extendMarkRange('link').unsetLink().run();
                    setLinkPopoverOpen(false);
                  }}>移除</Button>
                )}
                <Button size="small" onClick={() => setLinkPopoverOpen(false)}>取消</Button>
              </Space>
            </div>
          }
        >
          <span className="jz-link-popover-anchor" aria-hidden />
        </Popover>
        <span className="jz-editor-toolbar-divider" aria-hidden />

        <span className="jz-toolbar-group">
        <Space.Compact>
          <Tooltip title="撤销 (Ctrl+Z)">
            <Button size="small" className="jz-toolbar-icon-btn" icon={<UndoOutlined />} onClick={() => editor.chain().focus().undo().run()} />
          </Tooltip>
          <Tooltip title="重做 (Ctrl+Shift+Z)">
            <Button size="small" className="jz-toolbar-icon-btn" icon={<RedoOutlined />} onClick={() => editor.chain().focus().redo().run()} />
          </Tooltip>
          <Tooltip
            title={
              painterPersist
                ? '持续模式（点击取消）'
                : painterArmed
                  ? '已就绪：双击进入持续模式；再次点击取消'
                  : '单击一次性套用；双击持续套用'
            }
          >
            <Button
              size="small"
              className="jz-toolbar-icon-btn"
              type={painterArmed ? 'primary' : 'default'}
              style={
                painterPersist
                  ? { background: '#d46b08', borderColor: '#d46b08', color: '#fff' }
                  : undefined
              }
              icon={<FormatPainterOutlined />}
              onClick={togglePainter}
              aria-pressed={painterArmed}
            />
          </Tooltip>
          <Tooltip title="清除格式">
            <Button
              size="small"
              className="jz-toolbar-icon-btn"
              icon={<ClearOutlined />}
              onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
            />
          </Tooltip>
        </Space.Compact>
        </span>
        <AIAssistantMenu
          editor={editor}
          fallbackContent={() => editor?.storage.markdown?.getMarkdown?.() ?? value}
        />
        <span className="jz-editor-toolbar-divider" aria-hidden />

        <HeadingBlockDropdown editor={editor} />
        <FontSizeDropdown editor={editor} />
        <span className="jz-editor-toolbar-divider" aria-hidden />

        <span className="jz-toolbar-group">
        <Space.Compact>
          <ToolbarBtn editor={editor} mark="bold" icon={<BoldOutlined />} title="加粗 (Ctrl+B)" active={ui?.bold ?? false} />
          <ToolbarBtn editor={editor} mark="italic" icon={<ItalicOutlined />} title="斜体 (Ctrl+I)" active={ui?.italic ?? false} />
          <ToolbarBtn editor={editor} mark="underline" icon={<UnderlineOutlined />} title="下划线 (Ctrl+U)" active={ui?.underline ?? false} />
          <ToolbarBtn editor={editor} mark="strike" icon={<StrikethroughOutlined />} title="删除线" active={ui?.strike ?? false} />
        </Space.Compact>
        </span>
        <MoreMarksDropdown editor={editor} />
        <span className="jz-editor-toolbar-divider" aria-hidden />

        {/* Text colour picker */}
        <Dropdown
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
                      background: c.value === 'reset' ? 'transparent' : c.value,
                      border: '1px solid var(--jz-border)',
                    }}
                  />
                  {c.label}
                </span>
              ),
              onClick: () => {
                if (c.value === 'reset') editor.chain().focus().unsetColor().run();
                else editor.chain().focus().setColor(c.value).run();
              },
            })),
          }}
        >
          <Tooltip title="文字颜色">
            <Button size="small" className="jz-toolbar-icon-btn" icon={<BgColorsOutlined />} />
          </Tooltip>
        </Dropdown>
        <HighlightColorDropdown editor={editor} />
        <span className="jz-editor-toolbar-divider" aria-hidden />

        <span className="jz-toolbar-group">
        <Space.Compact>
          <ToolbarBtn
            editor={editor}
            icon={<UnorderedListOutlined />}
            title="无序列表"
            toggle={() => editor.chain().focus().toggleBulletList().run()}
            active={ui?.bulletList ?? false}
          />
          <ToolbarBtn
            editor={editor}
            icon={<OrderedListOutlined />}
            title="有序列表"
            toggle={() => editor.chain().focus().toggleOrderedList().run()}
            active={ui?.orderedList ?? false}
          />
          <ToolbarBtn
            editor={editor}
            icon={<CheckSquareOutlined />}
            title="任务列表"
            toggle={() => editor.chain().focus().toggleTaskList().run()}
            active={ui?.taskList ?? false}
          />
        </Space.Compact>
        </span>

        <input
          ref={imageFileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImageInputChange}
        />
        <input
          ref={attachmentFileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleAttachmentInputChange}
        />

        <span className="jz-editor-toolbar-divider" aria-hidden />
        <Tooltip title={fullscreen ? '退出全屏 (Esc)' : '全屏 / 沉浸模式'}>
          <Button
            size="small"
            className="jz-toolbar-icon-btn"
            icon={<JzIcon name={fullscreen ? 'compress' : 'fullscreen'} />}
            onClick={() => setFullscreen((v) => !v)}
          />
        </Tooltip>
        <Popover
          placement="bottomRight"
          trigger="click"
          content={
            <div style={{ minWidth: 200 }}>
              <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 12, color: 'var(--jz-text-muted)' }}>字体</div>
              <div style={{ marginBottom: 12 }}>
                <Dropdown
                  menu={{
                    items: FONT_FAMILY_PRESETS.map((f) => ({
                      key: f.value || '__default__',
                      label: <span style={{ fontFamily: f.value || undefined }}>{f.label}</span>,
                      onClick: () => {
                        if (!f.value) editor.chain().focus().unsetFontFamily().run();
                        else editor.chain().focus().setFontFamily(f.value).run();
                      },
                    })),
                  }}
                >
                  <Button size="small">选择字体 ▾</Button>
                </Dropdown>
              </div>
              <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 12, color: 'var(--jz-text-muted)' }}>对齐</div>
              <Space.Compact style={{ marginBottom: 12 }}>
                <Tooltip title="左对齐 (Ctrl+Shift+L)">
                  <Button
                    size="small"
                    type={ui?.alignLeft ? 'primary' : 'default'}
                    icon={<AlignLeftOutlined />}
                    onClick={() => editor.chain().focus().setTextAlign('left').run()}
                  />
                </Tooltip>
                <Tooltip title="居中 (Ctrl+Shift+E)">
                  <Button
                    size="small"
                    type={ui?.alignCenter ? 'primary' : 'default'}
                    icon={<AlignCenterOutlined />}
                    onClick={() => editor.chain().focus().setTextAlign('center').run()}
                  />
                </Tooltip>
                <Tooltip title="右对齐 (Ctrl+Shift+R)">
                  <Button
                    size="small"
                    type={ui?.alignRight ? 'primary' : 'default'}
                    icon={<AlignRightOutlined />}
                    onClick={() => editor.chain().focus().setTextAlign('right').run()}
                  />
                </Tooltip>
              </Space.Compact>
              <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 12, color: 'var(--jz-text-muted)' }}>缩进</div>
              <Space.Compact style={{ marginBottom: 12 }}>
                <Tooltip title="减少缩进 (Shift+Tab)">
                  <Button size="small" onClick={() => editor.commands.outdent()}>← 减少</Button>
                </Tooltip>
                <Tooltip title="增加缩进 (Tab)">
                  <Button size="small" onClick={() => editor.commands.indent()}>增加 →</Button>
                </Tooltip>
              </Space.Compact>
              <div style={{ borderTop: '1px solid var(--jz-border)', paddingTop: 8 }}>
                <MarkdownShortcutsHelp />
              </div>
            </div>
          }
        >
          <Button size="small" className="jz-toolbar-dropdown-btn">更多 ▾</Button>
        </Popover>
        </div>
      </div>

      {aiPromptOpen && editor && (
        <div className="jz-ai-panel-overlay" onClick={() => setAiPromptOpen(false)}>
          <div className="jz-ai-panel" style={{ width: 'min(400px, 100%)' }} onClick={(e) => e.stopPropagation()}>
            <div className="jz-ai-panel-header">
              <span className="jz-ai-panel-title">AI 生成段落</span>
              <button type="button" className="jz-ai-panel-close" onClick={() => setAiPromptOpen(false)}>
                ×
              </button>
            </div>
            <div style={{ padding: 16 }}>
              <AIPromptInline
                open
                onClose={() => setAiPromptOpen(false)}
                onSubmit={(p) => {
                  void triggerAIGenerateFromEditor(editor, p);
                  setAiPromptOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}
      <div
        ref={editorShellRef}
        className={`tiptap-shell paper ${paperClassName(paperStyle)}`}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          border: '1px solid var(--jz-border)',
          borderRadius: 6,
          padding: '12px 16px',
          position: 'relative',
        }}
        onContextMenu={(e: React.MouseEvent) => {
          if (!editor.isEditable || !editor.isActive('table')) return;
          e.preventDefault();
          setTableCtxMenu({ x: e.clientX, y: e.clientY });
        }}
        onMouseOver={(e: React.MouseEvent) => {
          const el = (e.target as HTMLElement).closest('.jz-annotation') as HTMLElement | null;
          if (!el) return;
          const text = el.getAttribute('data-annotation') ?? '';
          if (!text) return;
          const rect = el.getBoundingClientRect();
          const TOOLTIP_W = 280;
          const centerX = rect.left + rect.width / 2;
          const vw = window.innerWidth;
          let x = centerX;
          let transform = 'translateX(-50%)';
          if (centerX - TOOLTIP_W / 2 < 8) {
            x = Math.max(8, rect.left);
            transform = 'none';
          } else if (centerX + TOOLTIP_W / 2 > vw - 8) {
            x = Math.min(vw - TOOLTIP_W - 8, centerX - TOOLTIP_W / 2);
            transform = 'none';
          }
          setAnnotationHover({ text, x, y: rect.bottom + 8, transform });
        }}
        onMouseOut={(e: React.MouseEvent) => {
          const related = e.relatedTarget as HTMLElement | null;
          if (related?.closest?.('.jz-annotation')) return;
          setAnnotationHover(null);
        }}
      >
        <EditorContent editor={editor} />
        {annotationHover && (
          <div
            className="jz-annotation-hover"
            style={{ left: annotationHover.x, top: annotationHover.y, transform: annotationHover.transform }}
          >
            💬 {annotationHover.text}
          </div>
        )}
        {/* Floating selection menu — appears when the user highlights inline
            text. We hide it on read-only documents and inside code blocks
            (where bolding/italic doesn't apply). */}
        <BubbleMenu
          editor={editor}
          options={{ placement: 'top' }}
          shouldShow={({ editor, from, to }) => {
            if (!editor.isEditable) return false;
            if (from === to) return false;
            if (editor.isActive('codeBlock')) return false;
            if (editor.isActive('table')) return false;
            // 链接上让位给 LinkBubbleMenu（语雀式链接菜单），避免双条叠放
            if (editor.isActive('link')) return false;
            return true;
          }}
        >
          <div className="jz-bubble-menu" role="toolbar" aria-label="格式工具栏">
            <button
              type="button"
              className={'jz-bubble-btn' + (ui?.bold ? ' is-active' : '')}
              onClick={() => editor.chain().focus().toggleBold().run()}
              title="加粗 (Ctrl+B)"
              aria-label="加粗"
            >
              <BoldOutlined />
            </button>
            <button
              type="button"
              className={'jz-bubble-btn' + (ui?.italic ? ' is-active' : '')}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              title="斜体 (Ctrl+I)"
              aria-label="斜体"
            >
              <ItalicOutlined />
            </button>
            <button
              type="button"
              className={'jz-bubble-btn' + (ui?.strike ? ' is-active' : '')}
              onClick={() => editor.chain().focus().toggleStrike().run()}
              title="删除线"
              aria-label="删除线"
            >
              <StrikethroughOutlined />
            </button>
            <button
              type="button"
              className={'jz-bubble-btn' + (ui?.underline ? ' is-active' : '')}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              title="下划线 (Ctrl+U)"
              aria-label="下划线"
            >
              <UnderlineOutlined />
            </button>
            <button
              type="button"
              className={'jz-bubble-btn' + (ui?.code ? ' is-active' : '')}
              onClick={() => editor.chain().focus().toggleCode().run()}
              title="行内代码"
              aria-label="行内代码"
            >
              <CodeOutlined />
            </button>
            <Dropdown
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
                          background: c.value === 'reset' ? 'transparent' : c.value,
                          border: '1px solid var(--jz-border)',
                        }}
                      />
                      {c.label}
                    </span>
                  ),
                  onClick: () => {
                    if (c.value === 'reset') editor.chain().focus().unsetColor().run();
                    else editor.chain().focus().setColor(c.value).run();
                  },
                })),
              }}
            >
              <button type="button" className="jz-bubble-btn" title="文字颜色">
                <BgColorsOutlined />
              </button>
            </Dropdown>
            <span className="jz-bubble-divider" aria-hidden />
            <button
              type="button"
              className={'jz-bubble-btn' + (ui?.link ? ' is-active' : '')}
              onClick={openLinkPopover}
              title="链接"
              aria-label="链接"
            >
              <LinkOutlined />
            </button>
            <span className="jz-bubble-heading-wrap">
              <HeadingBlockDropdown editor={editor} compact />
            </span>
            <button
              type="button"
              className={'jz-bubble-btn' + (ui?.blockquote ? ' is-active' : '')}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              title="引用"
              aria-label="引用"
            >
              ❝
            </button>
            <button
              type="button"
              className={'jz-bubble-btn' + (ui?.annotation ? ' is-active' : '')}
              onClick={openAnnotationModal}
              title={ui?.annotation ? '编辑批注' : '添加批注'}
              aria-label="批注"
            >
              <CommentOutlined />
            </button>
            <span className="jz-bubble-divider" aria-hidden />
            <Dropdown
              menu={{
                items: CALLOUT_TEMPLATES.map((c) => ({
                  key: c.slug,
                  label: c.label,
                  onClick: () => editor.chain().focus().setCallout({ kind: c.slug }).run(),
                })),
              }}
            >
              <button type="button" className="jz-bubble-btn" title="包裹为色块">
                <CommentOutlined />
              </button>
            </Dropdown>
          </div>
        </BubbleMenu>
        <LinkBubbleMenu editor={editor} onEditLink={openLinkPopover} />
      </div>
      <BlockHoverMenu editor={editor} shellRef={editorShellRef} />
      {hover && <DocHoverCard state={hover} onClose={() => setHover(null)} />}
      <MentionPicker
        open={mentionOpen}
        onCancel={() => setMentionOpen(false)}
        onSelect={handleMentionSelect}
      />
      <Modal
        open={annotationModalOpen}
        title={annotationEditMode ? '编辑批注' : '添加批注'}
        onOk={confirmAnnotation}
        onCancel={() => setAnnotationModalOpen(false)}
        okText="确定"
        cancelText="取消"
        width={360}
        footer={[
          annotationEditMode && (
            <Button key="remove" danger size="small" onClick={removeAnnotation} style={{ float: 'left' }}>
              删除批注
            </Button>
          ),
          <Button key="cancel" onClick={() => setAnnotationModalOpen(false)}>取消</Button>,
          <Button key="ok" type="primary" onClick={confirmAnnotation}>确定</Button>,
        ]}
      >
        <Input.TextArea
          value={annotationInput}
          onChange={(e) => setAnnotationInput(e.target.value)}
          placeholder="输入批注内容…"
          rows={3}
          autoFocus
          onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); confirmAnnotation(); } }}
        />
      </Modal>
      <TableOverlay editor={editor} />
      {tableCtxMenu && (
        <Dropdown
          open={true}
          onOpenChange={(v) => { if (!v) setTableCtxMenu(null); }}
          menu={{
            items: [
              { key: 'selectAll', label: '全选整表', onClick: () => { editor.chain().focus().selectTableAll().run(); setTableCtxMenu(null); } },
              { key: 'selectRow', label: '选中整行', onClick: () => { editor.chain().focus().selectTableRow(currentRowIndex(editor)).run(); setTableCtxMenu(null); } },
              { key: 'selectCol', label: '选中整列', onClick: () => { editor.chain().focus().selectTableColumn(currentColIndex(editor)).run(); setTableCtxMenu(null); } },
              {
                key: 'density', label: '密度', children: [
                  { key: 'd-compact', label: '紧凑', onClick: () => { editor.commands.setTableDensity('compact'); setTableCtxMenu(null); } },
                  { key: 'd-normal', label: '标准', onClick: () => { editor.commands.setTableDensity('normal'); setTableCtxMenu(null); } },
                  { key: 'd-loose', label: '宽松', onClick: () => { editor.commands.setTableDensity('loose'); setTableCtxMenu(null); } },
                ],
              },
              {
                key: 'maxrows', label: '最多显示行数', children: [
                  { key: 'r-0', label: '不限', onClick: () => { editor.commands.setTableMaxRows(null); setTableCtxMenu(null); } },
                  { key: 'r-10', label: '10 行', onClick: () => { editor.commands.setTableMaxRows(10); setTableCtxMenu(null); } },
                  { key: 'r-20', label: '20 行', onClick: () => { editor.commands.setTableMaxRows(20); setTableCtxMenu(null); } },
                  { key: 'r-30', label: '30 行', onClick: () => { editor.commands.setTableMaxRows(30); setTableCtxMenu(null); } },
                ],
              },
              { type: 'divider' as const },
              { key: 'addRowBefore', label: '在上方插入行', onClick: () => { editor.chain().focus().addRowBefore().run(); setTableCtxMenu(null); } },
              { key: 'addRowAfter', label: '在下方插入行', onClick: () => { editor.chain().focus().addRowAfter().run(); setTableCtxMenu(null); } },
              { key: 'deleteRow', label: '删除当前行', danger: true, onClick: () => { editor.chain().focus().deleteRow().run(); setTableCtxMenu(null); } },
              { type: 'divider' as const },
              { key: 'addColBefore', label: '在左侧插入列', onClick: () => { editor.chain().focus().addColumnBefore().run(); setTableCtxMenu(null); } },
              { key: 'addColAfter', label: '在右侧插入列', onClick: () => { editor.chain().focus().addColumnAfter().run(); setTableCtxMenu(null); } },
              { key: 'deleteCol', label: '删除当前列', danger: true, onClick: () => { editor.chain().focus().deleteColumn().run(); setTableCtxMenu(null); } },
              { type: 'divider' as const },
              { key: 'mergeCells', label: '合并选中单元格', onClick: () => { editor.chain().focus().mergeCells().run(); setTableCtxMenu(null); } },
              { key: 'splitCell', label: '拆分单元格', onClick: () => { editor.chain().focus().splitCell().run(); setTableCtxMenu(null); } },
              { type: 'divider' as const },
              {
                key: 'cell-bg',
                label: '单元格底色',
                children: [
                  ...CELL_BG_PRESETS.map((c) => ({
                    key: `bg-${c.value}`,
                    label: c.label,
                    onClick: () => { editor.chain().focus().setCellAttribute('bgColor', c.value).run(); setTableCtxMenu(null); },
                  })),
                  { key: 'bg-clear', label: '清除底色', onClick: () => { editor.chain().focus().setCellAttribute('bgColor', null).run(); setTableCtxMenu(null); } },
                ],
              },
              {
                key: 'cell-text',
                label: '单元格文字色',
                children: [
                  ...TEXT_COLOR_PRESETS.map((c) => ({
                    key: `tc-${c.value}`,
                    label: c.label,
                    onClick: () => { editor.chain().focus().setCellAttribute('textColor', c.value).run(); setTableCtxMenu(null); },
                  })),
                  { key: 'tc-clear', label: '清除文字色', onClick: () => { editor.chain().focus().setCellAttribute('textColor', null).run(); setTableCtxMenu(null); } },
                ],
              },
              { type: 'divider' as const },
              { key: 'deleteTable', label: '删除表格', danger: true, onClick: () => { editor.chain().focus().deleteTable().run(); setTableCtxMenu(null); } },
            ],
          }}
          getPopupContainer={() => document.body}
        >
          <span style={{ position: 'fixed', left: tableCtxMenu.x, top: tableCtxMenu.y, width: 0, height: 0, display: 'block' }} />
        </Dropdown>
      )}
    </div>
  );
}

function ToolbarBtn({
  editor,
  mark,
  icon,
  title,
  toggle,
  active,
}: {
  editor: ReturnType<typeof useEditor>;
  mark?: 'bold' | 'italic' | 'strike' | 'code' | 'underline';
  icon: React.ReactNode;
  title: string;
  toggle?: () => void;
  /** 由父组件经 useEditorState 订阅后传入 —— 在此组件内直接读
   *  editor.isActive() 会拿到不随光标移动刷新的陈旧快照。 */
  active: boolean;
}) {
  if (!editor) return null;
  const onClick =
    toggle ??
    (() => {
      if (!mark) return;
      const chain = editor.chain().focus();
      if (mark === 'bold') chain.toggleBold().run();
      else if (mark === 'italic') chain.toggleItalic().run();
      else if (mark === 'strike') chain.toggleStrike().run();
      else if (mark === 'code') chain.toggleCode().run();
      else if (mark === 'underline') chain.toggleUnderline().run();
    });
  return (
    <Tooltip title={title}>
      <Button
        size="small"
        className={'jz-toolbar-icon-btn' + (active ? ' is-active' : '')}
        icon={icon}
        onClick={onClick}
      />
    </Tooltip>
  );
}

/**
 * Markdown 快捷输入速查表。
 *
 * 这些规则全部来自 Tiptap StarterKit / TaskList / 自定义扩展的 InputRules，输入
 * 触发字符（通常是空格或回车）后即时变形。表里列的是仍在 v3.23 走通的快捷输入。
 */
function MarkdownShortcutsHelp() {
  const groups: Array<{ title: string; rows: Array<[string, string]> }> = [
    {
      title: '段落 / 标题',
      rows: [
        ['# 空格', '一级标题'],
        ['## 空格', '二级标题'],
        ['### 空格', '三级标题'],
        ['#### 空格', '四级标题'],
        ['##### 空格', '五级标题'],
        ['###### 空格', '六级标题'],
        ['Alt+Ctrl+0', '正文'],
        ['Alt+Ctrl+1 … 6', '标题1–6'],
        ['> 空格', '引用块'],
        ['--- 回车', '分割线'],
      ],
    },
    {
      title: '行内格式',
      rows: [
        ['**粗体**', '粗体'],
        ['*斜体* 或 _斜体_', '斜体'],
        ['~~删除线~~', '删除线'],
        ['`行内代码`', '行内代码'],
        ['==高亮==', '字体背景色'],
      ],
    },
    {
      title: '列表 / 任务',
      rows: [
        ['- 空格 或 * 空格', '无序列表'],
        ['1. 空格', '有序列表'],
        ['[ ] 空格', '任务列表'],
      ],
    },
    {
      title: '代码块 / 表格',
      rows: [
        ['``` 回车', '代码块（可指定语言）'],
        ['``` mermaid', 'Mermaid 图表'],
      ],
    },
    {
      title: '块级菜单',
      rows: [
        ['/', '唤起 slash 菜单（dmk、yy、glk、mermaid 等拼音）'],
        ['Ctrl/⌘ + /', '任意位置唤起 slash 菜单'],
        ['@', '引用其他文档'],
        ['Ctrl/⌘ + S', '立即保存'],
        ['Ctrl/⌘ + E', '行内代码'],
        ['Ctrl/⌘ + K', '插入 / 编辑链接'],
        ['Ctrl + Shift + P', 'Mermaid 块：切换 图表/源码/分栏'],
        ['Ctrl + Shift + L/E/R', '左/中/右 对齐'],
      ],
    },
  ];

  return (
    <div style={{ maxWidth: 420, fontSize: 12 }}>
      <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 8 }}>
        快捷输入
      </Typography.Title>
      {groups.map((g) => (
        <div key={g.title} style={{ marginBottom: 10 }}>
          <div
            style={{
              fontWeight: 600,
              color: 'var(--jz-text-muted)',
              fontSize: 11,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            {g.title}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {g.rows.map(([key, desc]) => (
                <tr key={key}>
                  <td
                    style={{
                      padding: '2px 8px 2px 0',
                      whiteSpace: 'nowrap',
                      color: 'var(--jz-text)',
                    }}
                  >
                    <code
                      style={{
                        background: 'var(--jz-surface-2)',
                        border: '1px solid var(--jz-border)',
                        padding: '1px 6px',
                        borderRadius: 3,
                        fontSize: 11,
                      }}
                    >
                      {key}
                    </code>
                  </td>
                  <td style={{ color: 'var(--jz-text-muted)' }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
