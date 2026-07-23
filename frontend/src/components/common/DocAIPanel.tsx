import { useEffect, useRef, useState } from 'react';
import { Button, Drawer, Input, Spin } from 'antd';
import { JzAiIcon } from '@/components/common/JzIcon';
import { streamAI, getCapabilities, type AIOperation } from '@/api/ai';
import { getResolvedAIModelId, resolveAIModel } from '@/utils/aiModel';
import AIAssistantPanel from '@/components/editor/ai/AIAssistantPanel';
import { AI_PRESETS_DOC } from '@/components/editor/ai/aiOps';

interface Props {
  content: string;
  title?: string;
  modelOverride?: string;
}

/** 全文塞 prompt 的长度上限（字符）。超长文档截头部并注明，防止超模型
 *  上下文 / 白白烧预算 —— 总结/大纲类操作对头部截断相对不敏感。 */
const MAX_AI_CONTENT_CHARS = 20000;

function clipForAI(content: string): string {
  if (content.length <= MAX_AI_CONTENT_CHARS) return content;
  return (
    content.slice(0, MAX_AI_CONTENT_CHARS) +
    `\n\n[注：文档过长，以上仅为前 ${MAX_AI_CONTENT_CHARS} 字，其余已截断]`
  );
}

export function DocAIPanel({ content, title, modelOverride }: Props) {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [question, setQuestion] = useState('');
  const [activeLabel, setActiveLabel] = useState('');
  const [modelLabel, setModelLabel] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const refreshModelLabel = () => {
      getCapabilities()
        .then((c) => {
          const id = modelOverride || resolveAIModel(c);
          const found = c.models.find((m) => m.id === id);
          setModelLabel(found?.label || id);
        })
        .catch(() => setModelLabel(''));
    };
    refreshModelLabel();
    window.addEventListener('jz-ai-model-changed', refreshModelLabel);
    return () => window.removeEventListener('jz-ai-model-changed', refreshModelLabel);
  }, [modelOverride]);

  async function run(op: AIOperation, custom?: string, label = '') {
    setAnswer('');
    setActiveLabel(label || op);
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const clipped = clipForAI(content);
    const body = custom
      ? `问题：${custom}\n\n文档「${title ?? ''}」全文：\n${clipped}`
      : `文档「${title ?? ''}」：\n${clipped}`;
    try {
      await streamAI(op, body, {
        model: modelOverride || (await getResolvedAIModelId()),
        signal: ctrl.signal,
        onDelta: (d) => setAnswer((prev) => prev + d),
        onError: (err) => {
          setAnswer((prev) => prev + `\n[错误] ${err.detail}`);
          setStreaming(false);
        },
        onDone: () => setStreaming(false),
      });
    } catch {
      setStreaming(false);
    }
  }

  function closeDrawer() {
    abortRef.current?.abort();
    setOpen(false);
    setStreaming(false);
  }

  return (
    <>
      <Button
        type="primary"
        shape="circle"
        className="jz-doc-ai-fab"
        onClick={() => setOpen(true)}
        aria-label="AI 助手"
        title={modelLabel ? `AI 助手 (${modelLabel})` : 'AI 助手'}
        icon={<JzAiIcon size={18} />}
      />
      <Drawer
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <JzAiIcon size={16} style={{ color: '#6366f1' }} />
            AI 助手
            {modelLabel && <span className="jz-ai-panel-chip">{modelLabel}</span>}
          </span>
        }
        className="jz-ai-drawer"
        open={open}
        onClose={closeDrawer}
        width={420}
        destroyOnHidden={false}
      >
        <div className="jz-ai-drawer-hero">
          基于当前文档内容。模型在「个人空间 → AI 助手」中设置，对全文 AI、选区 AI 与编辑器工具栏全局生效。
        </div>
        <div className="jz-ai-preset-grid">
          {AI_PRESETS_DOC.map((p) => (
            <button
              key={p.key}
              type="button"
              className="jz-ai-preset-card"
              disabled={streaming}
              onClick={() => void run(p.key, undefined, p.label)}
            >
              <span className="jz-ai-preset-card-title">{p.label}</span>
              <span className="jz-ai-preset-card-hint">{p.hint}</span>
            </button>
          ))}
        </div>
        <div className="jz-ai-ask-row">
          <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--jz-text-muted)' }}>
            问问 AI（基于这篇文档）
          </div>
          <Input.Search
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="比如：里面说的 X 是什么意思？"
            enterButton="询问"
            loading={streaming}
            onSearch={(v) => {
              if (!v.trim()) return;
              void run('continue', v.trim(), '问答');
            }}
          />
        </div>
        {(streaming || answer || activeLabel) && (
          <AIAssistantPanel
            open
            title={activeLabel ? `AI · ${activeLabel}` : 'AI 结果'}
            modelLabel={modelLabel}
            streaming={streaming}
            text={answer}
            embedded
            canReplace={false}
            onAbort={() => {
              abortRef.current?.abort();
              setStreaming(false);
            }}
            onClose={() => {
              setAnswer('');
              setActiveLabel('');
              setStreaming(false);
            }}
            onCopy={() => void navigator.clipboard.writeText(answer)}
          />
        )}
        {streaming && !answer && (
          <div style={{ textAlign: 'center', padding: 16, marginTop: 8 }}>
            <Spin size="small" /> <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--jz-text-muted)' }}>正在思考…</span>
          </div>
        )}
      </Drawer>
    </>
  );
}
