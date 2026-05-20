import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, ReactNodeViewRenderer, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { ResizableImage } from './ResizableImage';
import { ImageUpload } from './imageUpload';
import { Underline } from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Superscript } from '@tiptap/extension-superscript';
import { Subscript } from '@tiptap/extension-subscript';
import { FontFamily } from '@tiptap/extension-font-family';
import { FontSize, FONT_SIZE_PRESETS, FONT_FAMILY_PRESETS } from './FontSize';
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
import { Tabs, TabPanel } from './Tabs';
import { DocCardEmbed } from './DocCardEmbed';
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
  FormatPainterOutlined,
  HighlightOutlined,
  ExpandOutlined,
  CompressOutlined,
  ItalicOutlined,
  LineOutlined,
  LinkOutlined,
  OrderedListOutlined,
  PictureOutlined,
  RedoOutlined,
  SaveOutlined,
  StrikethroughOutlined,
  TableOutlined,
  UnderlineOutlined,
  UndoOutlined,
  UnorderedListOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { SlashCommand } from './slashCommand';
import { FindReplace } from './findReplace';
import MentionPicker from './MentionPicker';
import type { MentionSuggestion } from '@/api/linking';
import { wordCount } from '@/utils/markdown';
import { uploadFile } from '@/api/attachments';
import { message } from '@/utils/notify';
import { useDocLinkHoverCards, DocHoverCard } from '@/components/common/DocHoverCard';
import { BlockHoverMenu } from './BlockHoverMenu';
import { AIAssistantMenu } from './AIAssistant';
import { paperClassName } from '@/utils/paper';
import DocumentOutline from './DocumentOutline';
import { CloseOutlined } from '@ant-design/icons';

const { Text } = Typography;

const lowlight = createLowlight(common);

/** Text-colour palette is shared with MarkdownEditor via ``callouts.ts``.
 *  Prepend a "reset" option so the Tiptap user can clear the colour mark. */
import { TEXT_COLOR_PRESETS as BASE_COLOR_PRESETS } from './callouts';
const TEXT_COLOR_PRESETS = [
  { label: '默认 / 取消', value: 'reset' },
  ...BASE_COLOR_PRESETS,
];

interface Props {
  /** Markdown source — authoritative storage. */
  value: string;
  /** Called with the editor's serialized Markdown after each change. */
  onChange: (next: string) => void;
  /** Debounced autosave; called only when changes stabilize. */
  onAutoSave?: (next: string) => Promise<void> | void;
  autosaveMs?: number;
  /** Document this editor is editing. Used to attach pasted/dropped images
   *  to the right document on upload. */
  documentId?: number;
  /** Lift the Tiptap editor instance up so siblings (outline, find-replace)
   *  can read state and dispatch commands. Called with ``null`` on unmount. */
  onEditorReady?: (editor: import('@tiptap/core').Editor | null) => void;
  /** Paper-background preset key (see utils/paper.ts). Applied to the editor
   *  shell so the writer sees what the reader will see. */
  paperStyle?: string;
}

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export default function RichTextEditor({
  value,
  onChange,
  onAutoSave,
  autosaveMs = 5000,
  documentId,
  onEditorReady,
  paperStyle,
}: Props) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const lastSavedRef = useRef(value);
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
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: [
      // Link / Underline are bundled into StarterKit ≥ 3.x — disable the
      // bundled versions so our standalone Link/Underline imports don't
      // collide ("Duplicate extension names" warning).
      StarterKit.configure({ codeBlock: false, link: false, underline: false }),
      CodeBlockLowlight.extend({
        // Wrap each code block in a React NodeView that provides a language
        // selector + font-size / wrap / copy toolbar. The underlying schema is
        // unchanged so Markdown serialisation keeps emitting ``` fences.
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockView);
        },
      }).configure({ lowlight, defaultLanguage: 'plaintext' }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: '键入 / 选择块类型；键入 @ 引用其他文档' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
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
      Color,
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
      Tabs,
      TabPanel,
      DocCardEmbed,
      MathInline,
      MathBlock,
      Markdown.configure({
        // html: true so markdown-it lets <font color> / <u> / inline HTML
        // round-trip through the editor; the public renderer separately runs
        // DOMPurify, so the editor surface is the only place trusted HTML
        // survives.
        html: true,
        tightLists: true,
        linkify: true,
        breaks: true,
      }),
      SlashCommand,
      FindReplace,
      GlobalDragHandle,
    ],
    // tiptap-markdown registers a parser that recognizes Markdown when `content` is a string.
    content: value || '',
    onUpdate: ({ editor }) => {
      if (onChangeTimerRef.current) window.clearTimeout(onChangeTimerRef.current);
      onChangeTimerRef.current = window.setTimeout(() => {
        const md: string = editor.storage.markdown?.getMarkdown?.() ?? '';
        onChangeRef.current(md);
      }, 200);
    },
  });

  useEffect(() => {
    return () => {
      if (onChangeTimerRef.current) window.clearTimeout(onChangeTimerRef.current);
    };
  }, []);

  // 把 editor 实例提升给宿主，便于大纲 / 查找替换等侧栏组件使用
  useEffect(() => {
    if (!onEditorReady) return;
    onEditorReady(editor ?? null);
    return () => onEditorReady(null);
  }, [editor, onEditorReady]);

  // Autosave (mirrors MarkdownEditor logic)
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
    if (md !== value) onChangeRef.current(md);
    if (md === lastSavedRef.current && status === 'saved') return;
    setStatus('saving');
    try {
      await onAutoSave(md);
      lastSavedRef.current = md;
      setStatus('saved');
    } catch {
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
    setUploading(true);
    try {
      const att = await uploadFile(file, documentId);
      // setImage is provided by the Image extension; ResizableImage inherits it
      editor.chain().focus().setImage({ src: att.url, alt: att.original_filename }).run();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '图片上传失败');
    } finally {
      setUploading(false);
    }
  }
  function handleImageInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void handleImageFile(file);
  }

  // ── 行内批注 ──────────────────────────────────────────────────────
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

  // ── 视频嵌入 ──────────────────────────────────────────────────────
  function insertVideoEmbed() {
    if (!editor) return;
    editor.chain().focus().insertContent({
      type: 'videoEmbed',
      attrs: { src: '', platform: 'other', videoId: '', title: '' },
    }).run();
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

  const statusLabel: Record<SaveStatus, { text: string; color?: string }> = {
    idle: { text: '已同步' },
    pending: { text: '待保存…', color: 'orange' },
    saving: { text: '保存中…', color: 'blue' },
    saved: { text: '已保存', color: 'green' },
    error: { text: '保存失败', color: 'red' },
  };

  if (!editor) return null;

  return (
    <div
      className={fullscreen ? 'jz-fullscreen-shell' : undefined}
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
        {/* status + word count + manual save */}
        <Tag color={statusLabel[status].color} style={{ margin: 0 }}>
          {statusLabel[status].text}
        </Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>{count} 字</Text>
        <Tooltip title="立即保存 (Ctrl/⌘+S)">
          <Button
            size="small"
            type="primary"
            icon={<SaveOutlined />}
            loading={status === 'saving'}
            disabled={!onAutoSave || (status === 'saved' && value === lastSavedRef.current)}
            onClick={() => void saveNow()}
          >
            保存
          </Button>
        </Tooltip>
        <span className="jz-editor-toolbar-divider" aria-hidden />

        {/* History */}
        <Space.Compact>
          <Tooltip title="撤销 (Ctrl+Z)">
            <Button size="small" icon={<UndoOutlined />} onClick={() => editor.chain().focus().undo().run()} />
          </Tooltip>
          <Tooltip title="重做 (Ctrl+Shift+Z)">
            <Button size="small" icon={<RedoOutlined />} onClick={() => editor.chain().focus().redo().run()} />
          </Tooltip>
        </Space.Compact>
        <span className="jz-editor-toolbar-divider" aria-hidden />

        {/* Heading levels */}
        <Space.Compact>
          {([1, 2, 3] as const).map((level) => (
            <Tooltip key={level} title={`${level} 级标题`}>
              <Button
                size="small"
                type={editor.isActive('heading', { level }) ? 'primary' : 'default'}
                onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
              >
                H{level}
              </Button>
            </Tooltip>
          ))}
        </Space.Compact>
        <span className="jz-editor-toolbar-divider" aria-hidden />

        {/* Inline marks */}
        <Space.Compact>
          <ToolbarBtn editor={editor} mark="bold" icon={<BoldOutlined />} title="加粗 (Ctrl+B)" />
          <ToolbarBtn editor={editor} mark="italic" icon={<ItalicOutlined />} title="斜体 (Ctrl+I)" />
          <ToolbarBtn editor={editor} mark="underline" icon={<UnderlineOutlined />} title="下划线 (Ctrl+U)" />
          <ToolbarBtn editor={editor} mark="strike" icon={<StrikethroughOutlined />} title="删除线" />
          <ToolbarBtn editor={editor} mark="code" icon={<CodeOutlined />} title="行内代码" />
          <Tooltip title="上标 (Ctrl+.)">
            <Button
              size="small"
              type={editor.isActive('superscript') ? 'primary' : 'default'}
              onClick={() => editor.chain().focus().toggleSuperscript().run()}
            >
              X²
            </Button>
          </Tooltip>
          <Tooltip title="下标 (Ctrl+,)">
            <Button
              size="small"
              type={editor.isActive('subscript') ? 'primary' : 'default'}
              onClick={() => editor.chain().focus().toggleSubscript().run()}
            >
              X₂
            </Button>
          </Tooltip>
        </Space.Compact>

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
            <Button size="small" icon={<BgColorsOutlined />} />
          </Tooltip>
        </Dropdown>
        <span className="jz-editor-toolbar-divider" aria-hidden />

        {/* Lists + quote */}
        <Space.Compact>
          <ToolbarBtn
            editor={editor}
            node="bulletList"
            icon={<UnorderedListOutlined />}
            title="无序列表"
            toggle={() => editor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarBtn
            editor={editor}
            node="orderedList"
            icon={<OrderedListOutlined />}
            title="有序列表"
            toggle={() => editor.chain().focus().toggleOrderedList().run()}
          />
          <ToolbarBtn
            editor={editor}
            node="taskList"
            icon={<CheckSquareOutlined />}
            title="任务列表"
            toggle={() => editor.chain().focus().toggleTaskList().run()}
          />
          <Tooltip title="引用">
            <Button
              size="small"
              type={editor.isActive('blockquote') ? 'primary' : 'default'}
              icon={<span style={{ fontSize: 13 }}>❝</span>}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            />
          </Tooltip>
        </Space.Compact>
        <span className="jz-editor-toolbar-divider" aria-hidden />


        {/* Insert group */}
        <Popover
          open={linkPopoverOpen}
          onOpenChange={(v) => { if (!v) setLinkPopoverOpen(false); }}
          title="插入链接"
          placement="bottomLeft"
          destroyTooltipOnHide
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
                {editor.isActive('link') && (
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
          <Tooltip title="链接 (Ctrl+K)">
            <Button
              size="small"
              icon={<LinkOutlined />}
              type={editor.isActive('link') ? 'primary' : 'default'}
              onClick={openLinkPopover}
            />
          </Tooltip>
        </Popover>
        <Tooltip title="代码块">
          <Button
            size="small"
            type={editor.isActive('codeBlock') ? 'primary' : 'default'}
            icon={<CodeOutlined />}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          />
        </Tooltip>
        <Tooltip title="表格 3×3">
          <Button
            size="small"
            icon={<TableOutlined />}
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          />
        </Tooltip>
        <Tooltip title="分割线（梅花纹）">
          <Button
            size="small"
            icon={<LineOutlined />}
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          />
        </Tooltip>
        <Dropdown
          menu={{
            items: CALLOUT_TEMPLATES.map((c) => ({
              key: c.slug,
              label: (
                <span>
                  <span style={{ display: 'inline-block', minWidth: 100 }}>{c.label}</span>
                  <span style={{ fontSize: 12, opacity: 0.55, marginLeft: 8 }}>{c.hint}</span>
                </span>
              ),
              onClick: () => editor.chain().focus().setCallout({ kind: c.slug }).run(),
            })),
          }}
        >
          <Tooltip title="插入色块">
            <Button size="small" icon={<CommentOutlined />}>
              色块 ▾
            </Button>
          </Tooltip>
        </Dropdown>
        <Tooltip title="插入文档引用 (键入 @ 也可触发)">
          <Button size="small" icon={<LinkOutlined />} onClick={() => setMentionOpen(true)}>
            @ 引用
          </Button>
        </Tooltip>

        {/* 图片：点击选文件；也可直接 Ctrl+V 粘贴 / 拖入 */}
        <Tooltip title="插入图片（也可直接粘贴 / 拖拽）">
          <Button
            size="small"
            icon={<PictureOutlined />}
            loading={uploading}
            onClick={() => imageFileInputRef.current?.click()}
          >
            图片
          </Button>
        </Tooltip>
        <input
          ref={imageFileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImageInputChange}
        />
        <Tooltip title="嵌入视频（Bilibili / YouTube）">
          <Button size="small" icon={<VideoCameraOutlined />} onClick={insertVideoEmbed}>
            视频
          </Button>
        </Tooltip>

        <span style={{ marginLeft: 'auto' }} />
        <AIAssistantMenu editor={editor} fallbackContent={() => value} />
        <Tooltip title={fullscreen ? '退出全屏 (Esc)' : '全屏 / 沉浸模式'}>
          <Button
            size="small"
            icon={fullscreen ? <CompressOutlined /> : <ExpandOutlined />}
            onClick={() => setFullscreen((v) => !v)}
          />
        </Tooltip>
        <Popover
          placement="bottomRight"
          trigger="click"
          content={
            <div style={{ minWidth: 200 }}>
              <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 12, color: 'var(--jz-text-muted)' }}>字号</div>
              <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {FONT_SIZE_PRESETS.map((s) => (
                  <Button
                    key={s.value}
                    size="small"
                    type={editor.isActive('textStyle', { fontSize: s.value }) ? 'primary' : 'default'}
                    onClick={() => editor.chain().focus().setFontSize(s.value).run()}
                  >
                    {s.label}
                  </Button>
                ))}
                <Button size="small" onClick={() => editor.chain().focus().unsetFontSize().run()}>
                  默认
                </Button>
              </div>
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
                    type={editor.isActive({ textAlign: 'left' }) ? 'primary' : 'default'}
                    icon={<AlignLeftOutlined />}
                    onClick={() => editor.chain().focus().setTextAlign('left').run()}
                  />
                </Tooltip>
                <Tooltip title="居中 (Ctrl+Shift+E)">
                  <Button
                    size="small"
                    type={editor.isActive({ textAlign: 'center' }) ? 'primary' : 'default'}
                    icon={<AlignCenterOutlined />}
                    onClick={() => editor.chain().focus().setTextAlign('center').run()}
                  />
                </Tooltip>
                <Tooltip title="右对齐 (Ctrl+Shift+R)">
                  <Button
                    size="small"
                    type={editor.isActive({ textAlign: 'right' }) ? 'primary' : 'default'}
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
              <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 12, color: 'var(--jz-text-muted)' }}>格式刷</div>
              <div style={{ marginBottom: 12 }}>
                <Tooltip title={painterPersist ? '持续模式（点击取消）' : painterArmed ? '已就绪：双击进入持续模式；再次点击取消' : '单击一次性套用；双击持续套用'}>
                  <Button
                    size="small"
                    type={painterArmed ? 'primary' : 'default'}
                    style={painterPersist ? { background: '#d46b08', borderColor: '#d46b08', color: '#fff' } : undefined}
                    icon={<FormatPainterOutlined />}
                    onClick={togglePainter}
                    aria-pressed={painterArmed}
                  >
                    格式刷
                  </Button>
                </Tooltip>
              </div>
              <div style={{ borderTop: '1px solid var(--jz-border)', paddingTop: 8 }}>
                <MarkdownShortcutsHelp />
              </div>
            </div>
          }
        >
          <Button size="small">更多 ▾</Button>
        </Popover>
      </div>
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
        {/* Table-aware bubble menu — appears whenever caret is inside a table */}
        <BubbleMenu
          editor={editor}
          options={{ placement: 'top' }}
          shouldShow={({ editor }) => editor.isEditable && editor.isActive('table')}
        >
          <div className="jz-bubble-menu" role="toolbar" aria-label="表格工具栏">
            <button
              type="button"
              className="jz-bubble-btn"
              onClick={() => editor.chain().focus().addRowBefore().run()}
              title="上方插入行"
            >
              ⬆️行
            </button>
            <button
              type="button"
              className="jz-bubble-btn"
              onClick={() => editor.chain().focus().addRowAfter().run()}
              title="下方插入行"
            >
              ⬇️行
            </button>
            <button
              type="button"
              className="jz-bubble-btn"
              onClick={() => editor.chain().focus().addColumnBefore().run()}
              title="左侧插入列"
            >
              ⬅️列
            </button>
            <button
              type="button"
              className="jz-bubble-btn"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
              title="右侧插入列"
            >
              列➡️
            </button>
            <span className="jz-bubble-divider" aria-hidden />
            <button
              type="button"
              className="jz-bubble-btn"
              onClick={() => editor.chain().focus().mergeCells().run()}
              title="合并选中单元格"
            >
              ⊞合并
            </button>
            <button
              type="button"
              className="jz-bubble-btn"
              onClick={() => editor.chain().focus().splitCell().run()}
              title="拆分单元格"
            >
              ⊟拆分
            </button>
            <button
              type="button"
              className="jz-bubble-btn"
              onClick={() => editor.chain().focus().toggleHeaderRow().run()}
              title="切换表头行"
            >
              表头
            </button>
            <span className="jz-bubble-divider" aria-hidden />
            <button
              type="button"
              className="jz-bubble-btn"
              onClick={() => editor.chain().focus().deleteRow().run()}
              title="删除当前行"
              style={{ color: '#cf1322' }}
            >
              删行
            </button>
            <button
              type="button"
              className="jz-bubble-btn"
              onClick={() => editor.chain().focus().deleteColumn().run()}
              title="删除当前列"
              style={{ color: '#cf1322' }}
            >
              删列
            </button>
            <button
              type="button"
              className="jz-bubble-btn"
              onClick={() => editor.chain().focus().deleteTable().run()}
              title="删除整个表格"
              style={{ color: '#cf1322' }}
            >
              删表
            </button>
          </div>
        </BubbleMenu>

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
            return true;
          }}
        >
          <div className="jz-bubble-menu" role="toolbar" aria-label="格式工具栏">
            <button
              type="button"
              className={'jz-bubble-btn' + (editor.isActive('bold') ? ' is-active' : '')}
              onClick={() => editor.chain().focus().toggleBold().run()}
              title="加粗 (Ctrl+B)"
              aria-label="加粗"
            >
              <BoldOutlined />
            </button>
            <button
              type="button"
              className={'jz-bubble-btn' + (editor.isActive('italic') ? ' is-active' : '')}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              title="斜体 (Ctrl+I)"
              aria-label="斜体"
            >
              <ItalicOutlined />
            </button>
            <button
              type="button"
              className={'jz-bubble-btn' + (editor.isActive('strike') ? ' is-active' : '')}
              onClick={() => editor.chain().focus().toggleStrike().run()}
              title="删除线"
              aria-label="删除线"
            >
              <StrikethroughOutlined />
            </button>
            <button
              type="button"
              className={'jz-bubble-btn' + (editor.isActive('underline') ? ' is-active' : '')}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              title="下划线 (Ctrl+U)"
              aria-label="下划线"
            >
              <UnderlineOutlined />
            </button>
            <button
              type="button"
              className={'jz-bubble-btn' + (editor.isActive('code') ? ' is-active' : '')}
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
              className={'jz-bubble-btn' + (editor.isActive('link') ? ' is-active' : '')}
              onClick={openLinkPopover}
              title="链接"
              aria-label="链接"
            >
              <LinkOutlined />
            </button>
            <button
              type="button"
              className={'jz-bubble-btn' + (editor.isActive('heading', { level: 2 }) ? ' is-active' : '')}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              title="二级标题"
              aria-label="二级标题"
            >
              H2
            </button>
            <button
              type="button"
              className={'jz-bubble-btn' + (editor.isActive('heading', { level: 3 }) ? ' is-active' : '')}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              title="三级标题"
              aria-label="三级标题"
            >
              H3
            </button>
            <button
              type="button"
              className={'jz-bubble-btn' + (editor.isActive('blockquote') ? ' is-active' : '')}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              title="引用"
              aria-label="引用"
            >
              ❝
            </button>
            <button
              type="button"
              className={'jz-bubble-btn' + (editor.isActive('annotation') ? ' is-active' : '')}
              onClick={openAnnotationModal}
              title={editor.isActive('annotation') ? '编辑批注' : '添加批注'}
              aria-label="批注"
            >
              <HighlightOutlined />
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
      {tableCtxMenu && (
        <Dropdown
          open={true}
          onOpenChange={(v) => { if (!v) setTableCtxMenu(null); }}
          menu={{
            items: [
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
  node,
  icon,
  title,
  toggle,
}: {
  editor: ReturnType<typeof useEditor>;
  mark?: 'bold' | 'italic' | 'strike' | 'code' | 'underline';
  node?: string;
  icon: React.ReactNode;
  title: string;
  toggle?: () => void;
}) {
  if (!editor) return null;
  const active = mark ? editor.isActive(mark) : node ? editor.isActive(node) : false;
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
      <Button size="small" type={active ? 'primary' : 'default'} icon={icon} onClick={onClick} />
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
        ['/', '唤起 slash 菜单'],
        ['@', '引用其他文档'],
        ['Ctrl/⌘ + S', '立即保存'],
        ['Ctrl/⌘ + K', '插入 / 编辑链接'],
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
