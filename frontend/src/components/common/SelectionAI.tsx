import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { Dropdown, Input, message } from 'antd';
import { JzAiAskIcon, JzAiSparkIcon } from '@/components/common/JzIcon';
import { streamAI, type AIOperation } from '@/api/ai';
import { getResolvedAIModelId } from '@/utils/aiModel';
import AIMenuList from '@/components/editor/ai/AIMenuList';
import AIAssistantPanel from '@/components/editor/ai/AIAssistantPanel';
import type { AIOpDef } from '@/components/editor/ai/aiOps';
import { AI_OPS } from '@/components/editor/ai/aiOps';

interface SelectionState {
  text: string;
  x: number;
  y: number;
}

interface Props {
  scopeRef?: React.RefObject<HTMLElement | null>;
  contextProvider?: () => string;
}

const SELECTION_OPS = AI_OPS.filter((o) =>
  (['polish', 'expand', 'fix', 'summarize', 'translate_en', 'translate_zh'] as AIOperation[]).includes(
    o.key,
  ),
);

export function SelectionAI({ scopeRef, contextProvider }: Props) {
  const [sel, setSel] = useState<SelectionState | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [askMode, setAskMode] = useState(false);
  const [question, setQuestion] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [answer, setAnswer] = useState('');
  const [activeOp, setActiveOp] = useState<AIOpDef | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastSelectionRef = useRef<string>('');

  useEffect(() => {
    function onSelectionChange() {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        if (!panelOpen) setSel(null);
        return;
      }
      const text = selection.toString().trim();
      if (!text || text.length < 2) {
        if (!panelOpen) setSel(null);
        return;
      }
      if (scopeRef?.current) {
        const range = selection.getRangeAt(0);
        if (!scopeRef.current.contains(range.commonAncestorContainer)) {
          if (!panelOpen) setSel(null);
          return;
        }
      }
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) {
        if (!panelOpen) setSel(null);
        return;
      }
      lastSelectionRef.current = text;
      setSel({
        text,
        x: Math.min(window.innerWidth - 40, rect.right + 6),
        y: Math.max(8, rect.top - 4),
      });
    }
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [scopeRef, panelOpen]);

  const runOperation = useCallback(
    async (op: AIOpDef, customQuestion?: string) => {
      if (!sel) return;
      setAskMode(false);
      const model = await getResolvedAIModelId();
      setPanelOpen(true);
      setActiveOp(op);
      setAnswer('');
      setStreaming(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const content = customQuestion
        ? `问题：${customQuestion}\n\n参考片段：${sel.text}${
            contextProvider ? '\n\n全文：' + contextProvider() : ''
          }`
        : sel.text;
      try {
        await streamAI(op.key, content, {
          model,
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
    },
    [sel, contextProvider],
  );

  function closePanel() {
    abortRef.current?.abort();
    setPanelOpen(false);
    setAskMode(false);
    setStreaming(false);
    setActiveOp(null);
    setAnswer('');
    setQuestion('');
    setSel(null);
  }

  const showAskForm = panelOpen && askMode && !streaming && !answer;

  return (
    <>
      {sel && !panelOpen && (
        <Dropdown
          trigger={['click']}
          placement="bottomRight"
          overlayClassName="jz-editor-dropdown jz-ai-dropdown"
          dropdownRender={() => (
            <AIMenuList
              ops={SELECTION_OPS}
              onSelect={(op) => void runOperation(op)}
              extraItems={[
                {
                  key: 'ask',
                  label: '自由提问',
                  hint: '基于选中内容问答',
                  icon: createElement(JzAiAskIcon, { size: 18 }),
                  onClick: () => {
                    setQuestion('');
                    setAnswer('');
                    setActiveOp({
                      key: 'continue',
                      label: '问答',
                      hint: '',
                      icon: createElement(JzAiAskIcon, { size: 18 }),
                      replace: false,
                    });
                    setAskMode(true);
                    setPanelOpen(true);
                  },
                },
              ]}
            />
          )}
        >
          <button
            type="button"
            className="jz-selection-ai-btn"
            style={{
              position: 'fixed',
              left: sel.x,
              top: sel.y,
              zIndex: 1070,
            }}
            aria-label="AI 操作"
          >
            <JzAiSparkIcon size={16} style={{ color: '#fff' }} />
          </button>
        </Dropdown>
      )}

      {panelOpen && showAskForm ? (
        <div className="jz-ai-panel-overlay" onClick={closePanel}>
          <div className="jz-ai-panel" onClick={(e) => e.stopPropagation()}>
            <div className="jz-ai-panel-header">
              <span className="jz-ai-panel-title">自由提问</span>
              <button type="button" className="jz-ai-panel-close" onClick={closePanel}>
                ×
              </button>
            </div>
            {lastSelectionRef.current && (
              <div className="jz-ai-panel-preview" style={{ marginTop: 12 }}>
                <div className="jz-ai-panel-preview-label">选中片段</div>
                {lastSelectionRef.current}
              </div>
            )}
            <div style={{ padding: 16 }}>
              <Input.Search
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="问点什么？（回车提交）"
                enterButton="询问"
                onSearch={(v) => {
                  if (!v.trim()) return;
                  void runOperation(
                    { key: 'continue', label: '问答', hint: '', icon: '?', replace: false },
                    v.trim(),
                  );
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <AIAssistantPanel
          open={panelOpen}
          title={activeOp ? `AI · ${activeOp.label}` : 'AI 助手'}
          streaming={streaming}
          text={answer}
          selectionPreview={lastSelectionRef.current}
          canReplace={false}
          onAbort={closePanel}
          onClose={closePanel}
          onCopy={() => {
            void navigator.clipboard.writeText(answer);
            message.success('已复制');
          }}
        />
      )}
    </>
  );
}
