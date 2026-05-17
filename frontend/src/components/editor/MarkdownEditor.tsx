import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Space, Tag, Tooltip, Typography } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import { renderMarkdown, wordCount } from '@/utils/markdown';
import MentionPicker from './MentionPicker';
import type { MentionSuggestion } from '@/api/linking';

const { TextArea } = Input;
const { Text } = Typography;

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Called when content has been stable for `autosaveMs` and differs from last saved. */
  onAutoSave?: (next: string) => Promise<void> | void;
  autosaveMs?: number;
  readOnly?: boolean;
}

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export default function MarkdownEditor({
  value,
  onChange,
  onAutoSave,
  autosaveMs = 5000,
  readOnly = false,
}: Props) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [mentionOpen, setMentionOpen] = useState(false);
  /** Cursor offset captured when @ trigger or button fired; insertion replaces text from here. */
  const triggerRangeRef = useRef<{ from: number; to: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastSavedRef = useRef(value);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    lastSavedRef.current = value;
    setStatus('idle');
  }, []); // sync on mount; switching docs handled by parent <MarkdownEditor key={doc.id}>

  useEffect(() => {
    if (!onAutoSave) return;
    // value === lastSavedRef means we're echoing back the saved value — leave
    // the existing status (typically 'saved' after a write) alone.
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

  const html = useMemo(() => renderMarkdown(value), [value]);
  const count = useMemo(() => wordCount(value), [value]);

  function openMentionAtCursor() {
    const ta = textareaRef.current;
    const pos = ta?.selectionStart ?? value.length;
    triggerRangeRef.current = { from: pos, to: pos };
    setMentionOpen(true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Open mention picker on standalone "@" keystroke and consume the keystroke.
    if (e.key === '@' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const ta = e.currentTarget;
      const pos = ta.selectionStart;
      triggerRangeRef.current = { from: pos, to: pos };
      setMentionOpen(true);
    }
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

  const statusLabel: Record<SaveStatus, { text: string; color?: string }> = {
    idle: { text: '已同步' },
    pending: { text: '待保存…', color: 'orange' },
    saving: { text: '保存中…', color: 'blue' },
    saved: { text: '已保存', color: 'green' },
    error: { text: '保存失败', color: 'red' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Space style={{ marginBottom: 8 }}>
        <Tag color={statusLabel[status].color}>{statusLabel[status].text}</Tag>
        <Text type="secondary">{count} 字</Text>
        <Tooltip title="插入文档引用（也可直接键入 @ 触发）">
          <Button
            size="small"
            icon={<LinkOutlined />}
            onClick={openMentionAtCursor}
            disabled={readOnly}
          >
            引用
          </Button>
        </Tooltip>
      </Space>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flex: 1, minHeight: 0 }}>
        <TextArea
          ref={(el) => {
            textareaRef.current = el?.resizableTextArea?.textArea ?? null;
          }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
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
        <div
          className="markdown-preview"
          style={{
            overflow: 'auto',
            padding: '12px 16px',
            border: '1px solid #e8e8e8',
            borderRadius: 6,
            background: '#fafafa',
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
      <MentionPicker
        open={mentionOpen}
        onCancel={() => setMentionOpen(false)}
        onSelect={handleMentionSelect}
      />
    </div>
  );
}
