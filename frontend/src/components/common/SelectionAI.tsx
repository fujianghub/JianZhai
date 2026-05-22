import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Dropdown, Input, Modal, Spin } from 'antd';
import { JzAiIcon, JzAiSparkIcon } from '@/components/common/JzIcon';
import { streamAI, type AIOperation } from '@/api/ai';

interface SelectionState {
  text: string;
  /** Where to anchor the floating button (viewport coords). */
  x: number;
  y: number;
}

interface Props {
  /** Limit selection capture to text inside this element. Pass `null` to listen
   *  on the whole document. */
  scopeRef?: React.RefObject<HTMLElement | null>;
  /** Optional extra context (whole doc, current KB, etc) to send with custom
   *  questions so the AI can reason about the surrounding content. */
  contextProvider?: () => string;
}

const QUICK_OPS: Array<{ key: AIOperation; label: string }> = [
  { key: 'polish', label: '润色' },
  { key: 'expand', label: '扩写' },
  { key: 'fix', label: '纠错' },
  { key: 'summarize', label: '总结' },
  { key: 'translate_en', label: '翻译为英文' },
  { key: 'translate_zh', label: '翻译为中文' },
];

/**
 * Selection-driven AI helper. Watches text selections inside `scopeRef` (or
 * the whole document if omitted) and, when the user finishes selecting, shows
 * a floating ✨ button anchored near the selection. Clicking it opens a menu
 * with quick AI operations or a "询问" input for custom prompts.
 *
 * The component is self-contained: the parent only needs to provide where to
 * watch and (optionally) a context provider for richer questions.
 */
export function SelectionAI({ scopeRef, contextProvider }: Props) {
  const [sel, setSel] = useState<SelectionState | null>(null);
  const [showAsk, setShowAsk] = useState(false);
  const [question, setQuestion] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [answer, setAnswer] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const lastSelectionRef = useRef<string>('');

  // Track selection changes inside scope.
  useEffect(() => {
    function onSelectionChange() {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setSel(null);
        return;
      }
      const text = selection.toString().trim();
      if (!text || text.length < 2) {
        setSel(null);
        return;
      }
      // Scope check — selection must be inside scopeRef (if provided)
      if (scopeRef?.current) {
        const range = selection.getRangeAt(0);
        if (!scopeRef.current.contains(range.commonAncestorContainer)) {
          setSel(null);
          return;
        }
      }
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) {
        setSel(null);
        return;
      }
      lastSelectionRef.current = text;
      // Anchor at top-right of selection
      setSel({
        text,
        x: Math.min(window.innerWidth - 40, rect.right + 6),
        y: Math.max(8, rect.top - 4),
      });
    }
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [scopeRef]);

  const runOperation = useCallback(
    async (operation: AIOperation, customQuestion?: string) => {
      if (!sel) return;
      const model = localStorage.getItem('jz-ai-model') || undefined;
      setShowAsk(true);
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
        await streamAI(operation, content, {
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
    [sel, contextProvider]
  );

  type MenuItem =
    | { type: 'divider'; key: string }
    | { key: string; label: string; onClick: () => void };
  const items: MenuItem[] = QUICK_OPS.map((op) => ({
    key: op.key,
    label: op.label,
    onClick: () => { void runOperation(op.key); },
  }));
  items.push({ type: 'divider', key: '__divider' });
  items.push({
    key: 'ask',
    label: '✏️ 自由提问…',
    onClick: () => {
      setQuestion('');
      setAnswer('');
      setShowAsk(true);
    },
  });

  return (
    <>
      {sel && !showAsk && (
        <Dropdown
          menu={{ items: items as never }}
          trigger={['click']}
          getPopupContainer={() => document.body}
          onOpenChange={(open) => {
            if (!open) {
              // Don't immediately dismiss; user might have closed without picking
              setTimeout(() => {
                const cur = window.getSelection()?.toString().trim();
                if (!cur) setSel(null);
              }, 200);
            }
          }}
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

      <Modal
        open={showAsk}
        title={
          <span>
            <JzAiIcon size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
            AI 助手
          </span>
        }
        width={560}
        onCancel={() => {
          abortRef.current?.abort();
          setShowAsk(false);
          setStreaming(false);
          setSel(null);
        }}
        footer={null}
      >
        <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--jz-text-muted)' }}>
          选中片段：
        </div>
        <div
          style={{
            fontSize: 12,
            padding: '8px 10px',
            border: '1px solid var(--jz-border)',
            borderRadius: 4,
            background: 'var(--jz-surface-2, rgba(0,0,0,0.02))',
            maxHeight: 80,
            overflow: 'auto',
            marginBottom: 12,
            color: 'var(--jz-text-muted)',
          }}
        >
          {lastSelectionRef.current}
        </div>
        <Input.Search
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="问点什么？（回车提交，如「这段什么意思？」「举个例子」）"
          enterButton="询问"
          loading={streaming}
          onSearch={(v) => {
            if (!v.trim()) return;
            // Use 'continue' as a free-form completion operation
            void runOperation('continue', v.trim());
          }}
        />
        <div style={{ marginTop: 16, minHeight: 80, maxHeight: 320, overflow: 'auto' }}>
          {streaming && !answer && (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Spin /> <span style={{ marginLeft: 8 }}>正在思考…</span>
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
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button
            disabled={streaming || !answer}
            onClick={() => {
              void navigator.clipboard.writeText(answer);
            }}
          >
            复制回答
          </Button>
          <Button
            onClick={() => {
              abortRef.current?.abort();
              setShowAsk(false);
              setStreaming(false);
              setSel(null);
            }}
          >
            关闭
          </Button>
        </div>
      </Modal>
    </>
  );
}
