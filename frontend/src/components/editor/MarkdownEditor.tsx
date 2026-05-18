import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dropdown, Input, Space, Tag, Tooltip, Typography } from 'antd';
import {
  BgColorsOutlined,
  CommentOutlined,
  LineOutlined,
  LinkOutlined,
  SaveOutlined,
  UnderlineOutlined,
} from '@ant-design/icons';
import { renderMarkdown, wordCount } from '@/utils/markdown';
import MentionPicker from './MentionPicker';
import CodeBlockEnhancer from '@/components/common/CodeBlockEnhancer';
import { CALLOUT_TEMPLATES, TEXT_COLOR_PRESETS } from './callouts';
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

  /** Force-save right now, skipping the autosave debounce. Used by the
   *  toolbar's 保存 button and the Ctrl/Cmd+S keyboard shortcut. */
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
              onClick: () => wrapSelection(`<font style="color:${c.value};">`, '</font>'),
            })),
          }}
        >
          <Tooltip title="文字颜色">
            <Button size="small" icon={<BgColorsOutlined />} disabled={readOnly} />
          </Tooltip>
        </Dropdown>
        <Tooltip title="分割线（梅花纹）">
          <Button
            size="small"
            icon={<LineOutlined />}
            disabled={readOnly}
            onClick={() => wrapSelection('\n\n---\n\n', '', '')}
          />
        </Tooltip>
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
          className="markdown-preview jz-md-editor-preview"
          style={{
            overflow: 'auto',
            padding: '12px 16px',
            border: '1px solid var(--jz-border)',
            borderRadius: 6,
            background: 'var(--jz-surface-2)',
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <CodeBlockEnhancer selector=".jz-md-editor-preview" bindKey={html} />
      </div>
      <MentionPicker
        open={mentionOpen}
        onCancel={() => setMentionOpen(false)}
        onSelect={handleMentionSelect}
      />
    </div>
  );
}
