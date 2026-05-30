import { useEffect, useRef, useState } from 'react';
import { Drawer, Input, Spin } from 'antd';
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
    getCapabilities()
      .then((c) => {
        const id = modelOverride || resolveAIModel(c);
        const found = c.models.find((m) => m.id === id);
        setModelLabel(found?.label || id);
      })
      .catch(() => setModelLabel(''));
    const onChange = () => {
      getCapabilities()
        .then((c) => {
          const id = modelOverride || resolveAIModel(c);
          const found = c.models.find((m) => m.id === id);
          setModelLabel(found?.label || id);
        })
        .catch(() => {});
    };
    window.addEventListener('jz-ai-model-changed', onChange);
    return () => window.removeEventListener('jz-ai-model-changed', onChange);
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
      <button
        type="button"
        className="jz-doc-ai-fab ant-btn ant-btn-primary ant-btn-circle"
        onClick={() => setOpen(true)}
        aria-label="AI 助手"
        title={modelLabel ? `AI 助手 (${modelLabel})` : 'AI 助手'}
      >
        <JzAiIcon size={18} />
      </button>
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
