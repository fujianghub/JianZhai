import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { Dropdown, Tooltip, message } from 'antd';
import { JzAiSparkIcon } from '@/components/common/JzIcon';
import type { Editor } from '@tiptap/core';
import { getCapabilities, runAI, streamAI } from '@/api/ai';
import { getResolvedAIModelId, resolveAIModel } from '@/utils/aiModel';
import type { AIOpDef } from './ai/aiOps';
import AIMenuList from './ai/AIMenuList';
import AIAssistantPanel from './ai/AIAssistantPanel';
import AIPromptInline from './ai/AIPromptInline';

interface Props {
  editor: Editor | null;
  fallbackContent?: () => string;
}

/** Shared AI generate flow (toolbar + quick-insert menu + slash `/ai`). */
export async function triggerAIGenerateFromEditor(
  editor: Editor,
  prompt: string,
): Promise<void> {
  if (!prompt.trim()) return;
  try {
    const model = await getResolvedAIModelId();
    const text = await runAI('outline', prompt, {
      extra: '直接生成正文，而非大纲',
      model,
    });
    editor.chain().focus().insertContent(text).run();
  } catch (err) {
    message.error(err instanceof Error ? err.message : 'AI 调用失败');
  }
}

export function runAIOp(
  _editor: Editor,
  op: AIOpDef,
  content: string,
  modelId: string,
  callbacks: {
    onStart: () => void;
    onDelta: (text: string) => void;
    onDone: () => void;
    onError: (msg: string) => void;
  },
  signal?: AbortSignal,
): Promise<void> {
  return streamAI(op.key, content, {
    model: modelId || undefined,
    signal,
    onDelta: (d) => callbacks.onDelta(d),
    // v0.9.7: streamAI now emits a typed AIErrorPayload; consumers that
    // still want a plain-string message convert via .detail.
    onError: (err) => callbacks.onError(err.detail),
    onDone: callbacks.onDone,
  });
}

export function AIAssistantMenu({ editor, fallbackContent }: Props) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [modelId, setModelId] = useState('');
  const [modelLabel, setModelLabel] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [active, setActive] = useState<AIOpDef | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [text, setText] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const refreshModel = useCallback(async () => {
    try {
      const c = await getCapabilities();
      const id = resolveAIModel(c);
      setModelId(id);
      setModelLabel(c.models.find((m) => m.id === id)?.label || id);
      setConfigured(c.configured);
    } catch {
      setConfigured(false);
    }
  }, []);

  useEffect(() => {
    void refreshModel();
    const onChange = () => void refreshModel();
    window.addEventListener('storage', onChange);
    window.addEventListener('jz-ai-model-changed', onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('jz-ai-model-changed', onChange);
    };
  }, [refreshModel]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const collectSelection = useCallback(() => {
    if (!editor) return '';
    const { from, to } = editor.state.selection;
    if (from !== to) {
      return editor.state.doc.textBetween(from, to, '\n', '\n');
    }
    return fallbackContent ? fallbackContent() : editor.getText();
  }, [editor, fallbackContent]);

  const hasSelection = useCallback(() => {
    if (!editor) return false;
    const { from, to } = editor.state.selection;
    return from !== to;
  }, [editor]);

  /** Selection range snapshotted when the AI op is LAUNCHED — applyResult
   * must target where the user asked, not wherever the cursor drifted to
   * while the stream was running (clicking elsewhere mid-stream used to
   * replace/insert at the wrong position). */
  const selectionRef = useRef<{ from: number; to: number } | null>(null);

  const run = useCallback(
    async (op: AIOpDef) => {
      if (!editor) return;
      const content = collectSelection();
      if (!content.trim()) {
        message.warning('请先选中要处理的文本，或在文档中输入内容');
        return;
      }
      {
        const { from, to } = editor.state.selection;
        selectionRef.current = { from, to };
      }
      setMenuOpen(false);
      setActive(op);
      setText('');
      setStreaming(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        await runAIOp(
          editor,
          op,
          content,
          modelId,
          {
            onStart: () => {},
            onDelta: (d) => setText((prev) => prev + d),
            onDone: () => setStreaming(false),
            onError: (msg) => {
              message.error(msg);
              setStreaming(false);
            },
          },
          ctrl.signal,
        );
      } catch {
        setStreaming(false);
      }
    },
    [editor, collectSelection, modelId],
  );

  function applyResult(mode: 'replace' | 'after' | 'before') {
    if (!editor || !text.trim()) return;
    // Use the launch-time snapshot; clamp into the current doc in case edits
    // during streaming shrank it. Fall back to the live selection only when
    // no snapshot exists.
    const docEnd = editor.state.doc.content.size;
    const snap = selectionRef.current ?? editor.state.selection;
    const from = Math.max(0, Math.min(snap.from, docEnd));
    const to = Math.max(from, Math.min(snap.to, docEnd));
    const chain = editor.chain().focus();
    if (mode === 'replace' && from !== to) {
      chain.deleteRange({ from, to }).insertContent(text).run();
    } else if (mode === 'before') {
      chain.insertContentAt(Math.max(0, from), text + '\n\n').run();
    } else {
      chain.insertContentAt(to, '\n\n' + text).run();
    }
    selectionRef.current = null;
    setActive(null);
    setText('');
  }

  function closePanel() {
    abortRef.current?.abort();
    setActive(null);
    setStreaming(false);
    setText('');
  }

  const aiAriaLabel = modelLabel ? `AI，${modelLabel}` : 'AI';

  if (configured === false) {
    return (
      <Tooltip title="未配置 API Key" overlayClassName="jz-toolbar-ai-tooltip" mouseEnterDelay={0.3}>
        <button type="button" className="jz-toolbar-ai-btn" disabled aria-label="AI，未配置">
          <span className="jz-toolbar-ai-mark" aria-hidden>
            AI
          </span>
        </button>
      </Tooltip>
    );
  }

  return (
    <>
      <Dropdown
        open={menuOpen}
        onOpenChange={setMenuOpen}
        disabled={configured === null}
        trigger={['click']}
        placement="bottomLeft"
        overlayClassName="jz-editor-dropdown jz-ai-dropdown"
        dropdownRender={() => (
          <AIMenuList
            onSelect={(op) => void run(op)}
            extraItems={[
              {
                key: 'generate',
                label: 'AI 生成段落',
                hint: '描述你想写什么',
                icon: createElement(JzAiSparkIcon, { size: 18 }),
                onClick: () => {
                  setMenuOpen(false);
                  setPromptOpen(true);
                },
              },
            ]}
          />
        )}
      >
        <Tooltip
          title={modelLabel || undefined}
          overlayClassName="jz-toolbar-ai-tooltip"
          mouseEnterDelay={0.3}
        >
          <button
            type="button"
            className="jz-toolbar-ai-btn"
            aria-label={aiAriaLabel}
            aria-expanded={menuOpen}
            disabled={configured === null}
          >
            <span className="jz-toolbar-ai-mark" aria-hidden>
              AI
            </span>
          </button>
        </Tooltip>
      </Dropdown>

      {promptOpen && (
        <div className="jz-ai-panel-overlay" onClick={() => setPromptOpen(false)}>
          <div className="jz-ai-panel" style={{ width: 'min(400px, 100%)' }} onClick={(e) => e.stopPropagation()}>
            <div className="jz-ai-panel-header">
              <span className="jz-ai-panel-title">AI 生成段落</span>
              <button type="button" className="jz-ai-panel-close" onClick={() => setPromptOpen(false)}>
                ×
              </button>
            </div>
            <div style={{ padding: 16 }}>
              <AIPromptInline
                open
                onClose={() => setPromptOpen(false)}
                onSubmit={(p) => {
                  if (editor) void triggerAIGenerateFromEditor(editor, p);
                  setPromptOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}

      <AIAssistantPanel
        open={!!active}
        title={active ? `AI · ${active.label}` : 'AI 助手'}
        modelLabel={modelLabel}
        streaming={streaming}
        text={text}
        canReplace={
          selectionRef.current
            ? selectionRef.current.from !== selectionRef.current.to
            : hasSelection()
        }
        onAbort={closePanel}
        onClose={closePanel}
        onCopy={() => {
          void navigator.clipboard.writeText(text);
          message.success('已复制');
        }}
        onInsertBefore={() => applyResult('before')}
        onInsertAfter={() => applyResult('after')}
        onReplace={() => applyResult('replace')}
      />
    </>
  );
}
