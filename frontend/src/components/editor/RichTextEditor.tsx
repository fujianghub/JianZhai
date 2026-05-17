import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { Markdown } from 'tiptap-markdown';
import GlobalDragHandle from 'tiptap-extension-global-drag-handle';
import { Button, Space, Tag, Tooltip, Typography } from 'antd';
import {
  BoldOutlined,
  CodeOutlined,
  ItalicOutlined,
  LinkOutlined,
  OrderedListOutlined,
  RedoOutlined,
  StrikethroughOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { SlashCommand } from './slashCommand';
import MentionPicker from './MentionPicker';
import type { MentionSuggestion } from '@/api/linking';
import { wordCount } from '@/utils/markdown';

const { Text } = Typography;

const lowlight = createLowlight(common);

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
      CodeBlockLowlight.configure({ lowlight }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: '键入 / 选择块类型；键入 @ 引用其他文档' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image,
      Markdown.configure({
        html: false,
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
      <Space wrap style={{ marginBottom: 8 }}>
        <Tag color={statusLabel[status].color}>{statusLabel[status].text}</Tag>
        <Text type="secondary">{count} 字</Text>
        <Space.Compact>
          <Tooltip title="撤销">
            <Button size="small" icon={<UndoOutlined />} onClick={() => editor.chain().focus().undo().run()} />
          </Tooltip>
          <Tooltip title="重做">
            <Button size="small" icon={<RedoOutlined />} onClick={() => editor.chain().focus().redo().run()} />
          </Tooltip>
        </Space.Compact>
        <Space.Compact>
          <ToolbarBtn editor={editor} mark="bold" icon={<BoldOutlined />} title="加粗" />
          <ToolbarBtn editor={editor} mark="italic" icon={<ItalicOutlined />} title="斜体" />
          <ToolbarBtn editor={editor} mark="strike" icon={<StrikethroughOutlined />} title="删除线" />
          <ToolbarBtn editor={editor} mark="code" icon={<CodeOutlined />} title="行内代码" />
        </Space.Compact>
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
        </Space.Compact>
        <Tooltip title="链接">
          <Button size="small" icon={<LinkOutlined />} onClick={setLink} />
        </Tooltip>
        <Tooltip title="插入文档引用">
          <Button size="small" icon={<LinkOutlined />} onClick={() => setMentionOpen(true)}>
            @ 引用
          </Button>
        </Tooltip>
      </Space>
      <div
        className="tiptap-shell"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          border: '1px solid #e8e8e8',
          borderRadius: 6,
          padding: '12px 16px',
          background: '#fff',
        }}
      >
        <EditorContent editor={editor} />
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
  mark?: 'bold' | 'italic' | 'strike' | 'code';
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
    });
  return (
    <Tooltip title={title}>
      <Button size="small" type={active ? 'primary' : 'default'} icon={icon} onClick={onClick} />
    </Tooltip>
  );
}
