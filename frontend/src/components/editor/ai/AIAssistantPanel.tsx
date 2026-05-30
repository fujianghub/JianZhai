import { useDeferredValue, useEffect, useMemo, useRef } from 'react';
import { Button, Spin } from 'antd';
import { JzAiIcon } from '@/components/common/JzIcon';
import { renderMarkdown } from '@/utils/markdown';
import CodeBlockEnhancer from '@/components/common/CodeBlockEnhancer';

export interface AIAssistantPanelProps {
  open: boolean;
  title: string;
  modelLabel?: string;
  streaming: boolean;
  text: string;
  selectionPreview?: string;
  canReplace?: boolean;
  embedded?: boolean;
  onAbort: () => void;
  onClose: () => void;
  onCopy?: () => void;
  onInsertBefore?: () => void;
  onInsertAfter?: () => void;
  onReplace?: () => void;
}

export default function AIAssistantPanel({
  open,
  title,
  modelLabel,
  streaming,
  text,
  selectionPreview,
  canReplace = true,
  embedded = false,
  onAbort,
  onClose,
  onCopy,
  onInsertBefore,
  onInsertAfter,
  onReplace,
}: AIAssistantPanelProps) {
  // ─── 流式 Markdown 渲染 ───────────────────────────────────────────────
  //
  // AI 后端 prompt 明确要求输出 Markdown（见 apps/ai/prompts.py），但此前
  // panel 一直用 <pre>{text}</pre> 显示纯文本，标题 / 列表 / 代码块都不会
  // 渲染为对应 HTML。这一版改用项目共用的 ``renderMarkdown()``（与博客阅
  // 读端、编辑器实时预览同一管线，自带 markdown-it + KaTeX + DOMPurify
  // 净化 + 代码高亮 + callout 容器）。
  //
  // 流式期间每来一个 delta 都全量重渲染 markdown-it 太贵（30+ delta/s ×
  // 5-50ms 解析 = 主线程卡顿）。用 React 18 的 useDeferredValue 把"渲染
  // 用的副本"标记为可延迟，浏览器空闲时才追赶最新 text，打字感仍流畅。
  // 流停后（streaming 切回 false）useDeferredValue 立刻吐出终局值。
  //
  // 代码块复制按钮 / Mermaid 图渲染挂载在 ``CodeBlockEnhancer``，只在流
  // 停后才挂——流式中半截 markdown 可能引出残缺代码栅栏，hydrate Mermaid
  // 会报错；onDone 后挂载就能正常渲染。
  const deferredText = useDeferredValue(text);
  const renderedHtml = useMemo(() => renderMarkdown(deferredText), [deferredText]);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // 流式时让 panel 自动滚到底，体验跟 ChatGPT 一致。
  useEffect(() => {
    if (!streaming) return;
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [streaming, deferredText]);

  if (!open) return null;

  const body = (
    <div className={'jz-ai-panel' + (embedded ? ' jz-ai-panel--embedded' : '')}>
      <div className="jz-ai-panel-header">
        <JzAiIcon size={18} style={{ color: '#6366f1', flexShrink: 0 }} />
        <span className="jz-ai-panel-title">{title}</span>
        {modelLabel && <span className="jz-ai-panel-chip">{modelLabel}</span>}
        <button type="button" className="jz-ai-panel-close" onClick={onClose} aria-label="关闭">
          ×
        </button>
      </div>
      {selectionPreview && (
        <div className="jz-ai-panel-preview" style={{ marginTop: 12 }}>
          <div className="jz-ai-panel-preview-label">选中片段</div>
          {selectionPreview}
        </div>
      )}
      <div className="jz-ai-panel-body" ref={bodyRef}>
        {streaming && !text && (
          <div className="jz-ai-panel-empty">
            <Spin size="small" /> <span style={{ marginLeft: 8 }}>正在生成…</span>
          </div>
        )}
        {!streaming && !text && !selectionPreview && (
          <div className="jz-ai-panel-empty">等待 AI 响应…</div>
        )}
        {text && (
          <div className="jz-ai-panel-markdown">
            <div
              className="markdown-preview jz-markdown jz-ai-md"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
            {streaming && <span className="jz-ai-panel-caret" aria-hidden>▍</span>}
            {/* 代码块复制 / Mermaid / PlantUML 等增强仅在流停后挂载，避免
                流式过程中半截源码触发 hydrate 报错。绑定 key 到最终 text，
                这样同一次响应只挂一次。 */}
            {!streaming && (
              <CodeBlockEnhancer
                selector=".jz-ai-panel-body .jz-ai-md"
                bindKey={text}
              />
            )}
          </div>
        )}
      </div>
      <div className="jz-ai-panel-footer">
        <Button size="small" onClick={streaming ? onAbort : onClose}>
          {streaming ? '中止' : '关闭'}
        </Button>
        {onCopy && (
          <Button size="small" disabled={streaming || !text.trim()} onClick={onCopy}>
            复制
          </Button>
        )}
        {onInsertBefore && (
          <Button size="small" disabled={streaming || !text.trim()} onClick={onInsertBefore}>
            插入到上方
          </Button>
        )}
        {onInsertAfter && (
          <Button size="small" disabled={streaming || !text.trim()} onClick={onInsertAfter}>
            插入到下方
          </Button>
        )}
        {canReplace && onReplace && (
          <Button
            size="small"
            className="jz-ai-btn-primary"
            disabled={streaming || !text.trim()}
            onClick={onReplace}
          >
            替换选中
          </Button>
        )}
      </div>
    </div>
  );

  if (embedded) return body;

  return (
    <div className="jz-ai-panel-overlay" onClick={onClose} role="presentation">
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {body}
      </div>
    </div>
  );
}
