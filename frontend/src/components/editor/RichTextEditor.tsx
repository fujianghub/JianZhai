import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, ReactNodeViewRenderer, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import { Underline } from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { Markdown } from 'tiptap-markdown';
import GlobalDragHandle from 'tiptap-extension-global-drag-handle';
import CodeBlockView from './CodeBlockView';
import CalloutExtension from './CalloutExtension';
import { CALLOUT_TEMPLATES } from './callouts';
import { Button, Dropdown, Space, Tag, Tooltip, Typography } from 'antd';
import {
  BgColorsOutlined,
  BoldOutlined,
  CheckSquareOutlined,
  CodeOutlined,
  CommentOutlined,
  ItalicOutlined,
  LineOutlined,
  LinkOutlined,
  OrderedListOutlined,
  RedoOutlined,
  SaveOutlined,
  StrikethroughOutlined,
  TableOutlined,
  UnderlineOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { SlashCommand } from './slashCommand';
import MentionPicker from './MentionPicker';
import type { MentionSuggestion } from '@/api/linking';
import { wordCount } from '@/utils/markdown';

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
}

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export default function RichTextEditor({ value, onChange, onAutoSave, autosaveMs = 5000 }: Props) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [mentionOpen, setMentionOpen] = useState(false);
  const lastSavedRef = useRef(value);
  const timerRef = useRef<number | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
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
      Image,
      Underline,
      TextStyle,
      Color,
      CalloutExtension,
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
      GlobalDragHandle,
    ],
    // tiptap-markdown registers a parser that recognizes Markdown when `content` is a string.
    content: value || '',
    onUpdate: ({ editor }) => {
      const md: string = editor.storage.markdown?.getMarkdown?.() ?? '';
      onChange(md);
    },
  });

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

  function setLink() {
    if (!editor) return;
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('链接地址', previous ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
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
        <Tooltip title="链接 (Ctrl+K)">
          <Button size="small" icon={<LinkOutlined />} onClick={setLink} />
        </Tooltip>
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
      </div>
      <div
        className="tiptap-shell"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          border: '1px solid var(--jz-border)',
          borderRadius: 6,
          padding: '12px 16px',
          background: 'var(--jz-surface)',
        }}
      >
        <EditorContent editor={editor} />
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
              onClick={setLink}
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
      <MentionPicker
        open={mentionOpen}
        onCancel={() => setMentionOpen(false)}
        onSelect={handleMentionSelect}
      />
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
