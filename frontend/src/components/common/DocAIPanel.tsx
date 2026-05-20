import { useEffect, useRef, useState } from 'react';
import { Button, Drawer, Input, Spin, Tag, Tooltip } from 'antd';
import { RobotOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { streamAI, getCapabilities, type AIOperation } from '@/api/ai';

interface Props {
  /** The whole document content (Markdown) — AI sees this as context. */
  content: string;
  /** Document title — for nicer prompt framing. */
  title?: string;
  /** Auto-fetch the configured AI model on mount. */
  modelOverride?: string;
}

const PRESETS: Array<{ key: AIOperation; label: string; hint: string }> = [
  { key: 'summarize', label: '总结全文', hint: '提炼 3-5 句要点' },
  { key: 'outline', label: '生成大纲', hint: 'H2/H3 树状结构' },
  { key: 'translate_en', label: '翻译为英文', hint: '保留 Markdown' },
];

/**
 * Per-document AI assistant — a floating button at the top-right of the
 * reader that opens a drawer for whole-document operations (summarize,
 * outline, translate) or free-form Q&A. Different from `SelectionAI` which
 * triggers from a text selection.
 */
export function DocAIPanel({ content, title, modelOverride }: Props) {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [question, setQuestion] = useState('');
  const [activeLabel, setActiveLabel] = useState('');
  const [modelLabel, setModelLabel] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    getCapabilities()
      .then((c) => {
        const id = modelOverride || c.default_model;
        const found = c.models.find((m) => m.id === id);
        setModelLabel(found?.label || id);
      })
      .catch(() => setModelLabel(''));
  }, [modelOverride]);

  async function run(op: AIOperation, custom?: string, label = '') {
    setAnswer('');
    setActiveLabel(label || op);
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const body = custom
      ? `问题：${custom}\n\n文档「${title ?? ''}」全文：\n${content}`
      : `文档「${title ?? ''}」：\n${content}`;
    try {
      await streamAI(op, body, {
        model: modelOverride || localStorage.getItem('jz-ai-model') || undefined,
        signal: ctrl.signal,
        onDelta: (d) => setAnswer((prev) => prev + d),
        onError: (msg) => {
          setAnswer((prev) => prev + `\n[错误] ${msg}`);
          setStreaming(false);
        },
        onDone: () => setStreaming(false),
      });
    } catch {
      setStreaming(false);
    }
  }

  return (
    <>
      <Tooltip title={modelLabel ? `AI 助手 (${modelLabel})` : 'AI 助手'} placement="left">
        <Button
          type="primary"
          shape="circle"
          icon={<RobotOutlined />}
          className="jz-doc-ai-fab"
          onClick={() => setOpen(true)}
          aria-label="AI 助手"
        />
      </Tooltip>
      <Drawer
        title={
          <span>
            <ThunderboltOutlined style={{ color: '#1677ff', marginRight: 6 }} />
            AI 助手
            {modelLabel && <Tag style={{ marginLeft: 8, fontSize: 11 }}>{modelLabel}</Tag>}
          </span>
        }
        open={open}
        onClose={() => {
          abortRef.current?.abort();
          setOpen(false);
          setStreaming(false);
        }}
        width={420}
        destroyOnClose={false}
      >
        <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--jz-text-muted)' }}>
          快捷操作（基于当前文档）
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              block
              style={{ textAlign: 'left' }}
              disabled={streaming}
              onClick={() => run(p.key, undefined, p.label)}
            >
              <span style={{ fontWeight: 500 }}>{p.label}</span>
              <span style={{ fontSize: 11, color: 'var(--jz-text-muted)', marginLeft: 8 }}>
                {p.hint}
              </span>
            </Button>
          ))}
        </div>
        <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--jz-text-muted)' }}>
          问问 AI（基于这篇文档）
        </div>
        <Input.Search
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="比如：里面说的 X 是什么意思？为什么作者认为 Y？"
          enterButton="询问"
          loading={streaming}
          onSearch={(v) => {
            if (!v.trim()) return;
            void run('continue', v.trim(), '问答');
          }}
        />
        <div
          style={{
            marginTop: 16,
            minHeight: 100,
            padding: 12,
            border: '1px solid var(--jz-border)',
            borderRadius: 6,
            background: 'var(--jz-surface-2, rgba(0,0,0,0.02))',
          }}
        >
          {activeLabel && (
            <div
              style={{
                marginBottom: 8,
                fontSize: 11,
                color: 'var(--jz-text-muted)',
                fontWeight: 600,
              }}
            >
              {activeLabel}
            </div>
          )}
          {streaming && !answer && (
            <div style={{ textAlign: 'center', padding: 16 }}>
              <Spin /> <span style={{ marginLeft: 8 }}>正在思考…</span>
            </div>
          )}
          {!streaming && !answer && (
            <div style={{ color: 'var(--jz-text-muted)', fontSize: 13 }}>
              点击上方按钮或输入问题开始。
            </div>
          )}
          {answer && (
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                margin: 0,
                fontSize: 14,
                lineHeight: 1.7,
              }}
            >
              {answer}
              {streaming && <span style={{ opacity: 0.6 }}>▍</span>}
            </pre>
          )}
        </div>
      </Drawer>
    </>
  );
}
