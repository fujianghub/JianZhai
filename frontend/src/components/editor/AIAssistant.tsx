import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dropdown, Modal, Select, Spin, Tooltip, message } from 'antd';
import { JzAiIcon } from '@/components/common/JzIcon';
import type { Editor } from '@tiptap/core';
import { getCapabilities, streamAI, type AIModelOption, type AIOperation } from '@/api/ai';

const AI_MODEL_KEY = 'jz-ai-model';

interface OpDef {
  key: AIOperation;
  label: string;
  hint: string;
  /** When true, replace the selection with the result. When false, insert after. */
  replace: boolean;
}

const OPS: OpDef[] = [
  { key: 'continue', label: '续写', hint: '基于当前段落延展', replace: false },
  { key: 'polish', label: '润色', hint: '让文字更流畅', replace: true },
  { key: 'expand', label: '扩写', hint: '补充细节与例子', replace: true },
  { key: 'fix', label: '纠错', hint: '修正错别字 / 语法', replace: true },
  { key: 'summarize', label: '总结', hint: '提炼 3-5 句要点', replace: false },
  { key: 'outline', label: '生成大纲', hint: '基于片段生成 H2/H3 结构', replace: false },
  { key: 'translate_en', label: '翻译为英文', hint: 'EN', replace: false },
  { key: 'translate_zh', label: '翻译为中文', hint: 'ZH', replace: false },
];

interface Props {
  editor: Editor | null;
  /** Triggered when no text is selected. Falls back to whole document. */
  fallbackContent?: () => string;
}

export function AIAssistantMenu({ editor, fallbackContent }: Props) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [models, setModels] = useState<AIModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem(AI_MODEL_KEY) || ''
  );
  const [active, setActive] = useState<OpDef | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [text, setText] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    getCapabilities()
      .then((c) => {
        setConfigured(c.configured);
        setModels(c.models || []);
        // If the persisted choice is no longer available (renamed/removed),
        // fall back to the server's default.
        const allowed = new Set((c.models || []).map((m) => m.id));
        setSelectedModel((prev) =>
          prev && allowed.has(prev) ? prev : c.default_model
        );
      })
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    if (selectedModel) {
      localStorage.setItem(AI_MODEL_KEY, selectedModel);
      // Notify the header badge (and any other listener) so the UI tag
      // updates without a page refresh.
      window.dispatchEvent(new CustomEvent('jz-ai-model-changed'));
    }
  }, [selectedModel]);

  const collectSelection = useCallback(() => {
    if (!editor) return '';
    const { from, to } = editor.state.selection;
    if (from !== to) {
      return editor.state.doc.textBetween(from, to, '\n', '\n');
    }
    return fallbackContent ? fallbackContent() : editor.getText();
  }, [editor, fallbackContent]);

  const run = useCallback(
    async (op: OpDef) => {
      if (!editor) return;
      const content = collectSelection();
      if (!content.trim()) {
        message.warning('请先选中要处理的文本，或在文档中输入内容');
        return;
      }
      setActive(op);
      setText('');
      setStreaming(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        await streamAI(op.key, content, {
          model: selectedModel || undefined,
          signal: ctrl.signal,
          onDelta: (d) => setText((prev) => prev + d),
          onError: (msg) => {
            message.error(msg);
            setStreaming(false);
          },
          onDone: () => setStreaming(false),
        });
      } catch {
        setStreaming(false);
      }
    },
    [editor, collectSelection, selectedModel]
  );

  function applyResult(mode: 'replace' | 'after' | 'before') {
    if (!editor || !text.trim()) return;
    const { from, to } = editor.state.selection;
    const chain = editor.chain().focus();
    if (mode === 'replace' && from !== to) {
      chain.deleteRange({ from, to }).insertContent(text).run();
    } else if (mode === 'before') {
      chain.insertContentAt(Math.max(0, from), text + '\n\n').run();
    } else {
      chain.insertContentAt(to, '\n\n' + text).run();
    }
    setActive(null);
    setText('');
  }

  const items = useMemo(
    () =>
      OPS.map((op) => ({
        key: op.key,
        label: (
          <span style={{ display: 'inline-flex', flexDirection: 'column', minWidth: 140 }}>
            <span style={{ fontSize: 13 }}>{op.label}</span>
            <span style={{ fontSize: 11, color: 'var(--jz-text-muted)' }}>{op.hint}</span>
          </span>
        ),
        onClick: () => run(op),
      })),
    [run]
  );

  // IMPORTANT: keep all hooks above any early return — otherwise React errors
  // with "Rendered fewer hooks than expected" when `configured` flips.
  const modelLabel = useMemo(
    () => models.find((m) => m.id === selectedModel)?.label || selectedModel,
    [models, selectedModel]
  );

  if (configured === false) {
    return (
      <Tooltip title="未配置 ANTHROPIC_API_KEY，AI 助手暂不可用">
        <Button size="small" icon={<JzAiIcon size={14} />} disabled>
          AI
        </Button>
      </Tooltip>
    );
  }

  return (
    <>
      <Dropdown menu={{ items }} disabled={configured === null}>
        <Tooltip title={`AI 写作助手 · 当前模型：${modelLabel || '加载中…'}`}>
          <Button size="small" icon={<JzAiIcon size={14} />}>AI ▾</Button>
        </Tooltip>
      </Dropdown>
      {models.length > 1 && (
        <Tooltip title="切换 AI 模型（每次调用都用此模型）">
          <Select
            size="small"
            value={selectedModel || undefined}
            onChange={setSelectedModel}
            style={{ minWidth: 150 }}
            options={models.map((m) => ({
              value: m.id,
              label: (
                <span>
                  <span>{m.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--jz-text-muted)', marginLeft: 6 }}>
                    {m.hint}
                  </span>
                </span>
              ),
            }))}
          />
        </Tooltip>
      )}

      <Modal
        open={!!active}
        title={
          active
            ? `AI · ${active.label}（${modelLabel}）`
            : ''
        }
        width={640}
        onCancel={() => {
          abortRef.current?.abort();
          setActive(null);
          setStreaming(false);
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              abortRef.current?.abort();
              setActive(null);
              setStreaming(false);
            }}
          >
            {streaming ? '中止' : '关闭'}
          </Button>,
          <Button
            key="copy"
            disabled={streaming || !text.trim()}
            onClick={() => {
              void navigator.clipboard.writeText(text);
              message.success('已复制');
            }}
          >
            复制
          </Button>,
          <Button
            key="before"
            disabled={streaming || !text.trim()}
            onClick={() => applyResult('before')}
          >
            插入到上方
          </Button>,
          <Button
            key="after"
            disabled={streaming || !text.trim()}
            onClick={() => applyResult('after')}
          >
            插入到下方
          </Button>,
          <Button
            key="replace"
            type="primary"
            disabled={streaming || !text.trim()}
            onClick={() => applyResult('replace')}
          >
            替换选中
          </Button>,
        ]}
      >
        <div style={{ minHeight: 160, maxHeight: 360, overflow: 'auto' }}>
          {streaming && !text && (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <Spin /> <span style={{ marginLeft: 8 }}>正在生成…</span>
            </div>
          )}
          {text && (
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                margin: 0,
                fontSize: 14,
                lineHeight: 1.7,
              }}
            >
              {text}
              {streaming && <span style={{ opacity: 0.6 }}>▍</span>}
            </pre>
          )}
        </div>
      </Modal>
    </>
  );
}
