import { useDeferredValue, useEffect, useMemo, useRef } from 'react';
import { Alert, Button, Spin, Tag, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { AIErrorPayload } from '@/api/ai';
import { JzAiIcon } from '@/components/common/JzIcon';
import { renderMarkdown } from '@/utils/markdown';
import CodeBlockEnhancer from '@/components/common/CodeBlockEnhancer';

export interface AIAssistantPanelProps {
  open: boolean;
  title: string;
  modelLabel?: string;
  streaming: boolean;
  text: string;
  /** v0.9.7: when an error occurs, render an inline Alert with classified
   *  message + retry button. Replaces the raw "AI 生成失败" toast. */
  error?: AIErrorPayload | null;
  errorTitle?: string;
  errorHint?: string;
  selectionPreview?: string;
  /** v0.9.7: thumbnails of attached images (data URLs). */
  images?: string[];
  canReplace?: boolean;
  embedded?: boolean;
  onAbort: () => void;
  onClose: () => void;
  /** v0.9.7: re-run the most recent call. Called on the ↻ button. */
  onRegenerate?: () => void;
  onCopy?: () => void;
  onInsertBefore?: () => void;
  onInsertAfter?: () => void;
  onReplace?: () => void;
  /** Display a tooltip showing token / cost estimate when the user hovers
   *  the primary action. */
  estimate?: { tokens: number; usd: number } | null;
}

export default function AIAssistantPanel({
  open,
  title,
  modelLabel,
  streaming,
  text,
  error,
  errorTitle,
  errorHint,
  selectionPreview,
  images,
  canReplace = true,
  embedded = false,
  onAbort,
  onClose,
  onRegenerate,
  onCopy,
  onInsertBefore,
  onInsertAfter,
  onReplace,
  estimate,
}: AIAssistantPanelProps) {
  const deferredText = useDeferredValue(text);
  const renderedHtml = useMemo(() => renderMarkdown(deferredText), [deferredText]);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!streaming) return;
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [streaming, deferredText]);

  if (!open) return null;

  const errorAlertType = (() => {
    switch (error?.code) {
      case 'ai_budget_exceeded': return 'warning' as const;
      case 'ai_unavailable':
      case 'ai_disabled': return 'info' as const;
      default: return 'error' as const;
    }
  })();

  const body = (
    <div className={'jz-ai-panel' + (embedded ? ' jz-ai-panel--embedded' : '')}>
      <div className="jz-ai-panel-header">
        <JzAiIcon size={18} style={{ color: '#6366f1', flexShrink: 0 }} />
        <span className="jz-ai-panel-title">{title}</span>
        {modelLabel && <span className="jz-ai-panel-chip">{modelLabel}</span>}
        {estimate && (
          <Tooltip title={`约 ${estimate.tokens} 输入 token · 约 $${estimate.usd.toFixed(4)} 输出上限`}>
            <Tag style={{ marginLeft: 6, fontSize: 11 }}>≈ ${estimate.usd.toFixed(3)}</Tag>
          </Tooltip>
        )}
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
      {images && images.length > 0 && (
        <div className="jz-ai-panel-images" aria-label="附图">
          {images.map((src, i) => (
            <img key={i} src={src} alt={`图 ${i + 1}`} />
          ))}
        </div>
      )}
      <div className="jz-ai-panel-body" ref={bodyRef}>
        {streaming && !text && !error && (
          <div className="jz-ai-panel-empty">
            <Spin size="small" /> <span style={{ marginLeft: 8 }}>正在生成…</span>
          </div>
        )}
        {!streaming && !text && !error && !selectionPreview && (
          <div className="jz-ai-panel-empty">等待 AI 响应…</div>
        )}
        {error && (
          <Alert
            className="jz-ai-panel-error"
            type={errorAlertType}
            showIcon
            message={errorTitle || 'AI 调用失败'}
            description={errorHint || error.detail}
            action={onRegenerate ? (
              <Button size="small" onClick={onRegenerate} icon={<ReloadOutlined />}>
                重试
              </Button>
            ) : null}
            style={{ marginBottom: text ? 12 : 0 }}
          />
        )}
        {text && (
          <div className="jz-ai-panel-markdown">
            <div
              className="markdown-preview jz-markdown jz-ai-md"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
            {streaming && <span className="jz-ai-panel-caret" aria-hidden>▍</span>}
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
        {onRegenerate && (
          <Tooltip title="用同样的输入再来一次（如对结果不满意）">
            <Button
              size="small"
              icon={<ReloadOutlined />}
              disabled={streaming || (!text.trim() && !error)}
              onClick={onRegenerate}
            >
              再来一次
            </Button>
          </Tooltip>
        )}
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
