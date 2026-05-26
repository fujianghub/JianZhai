import { Button, Spin } from 'antd';
import { JzAiIcon } from '@/components/common/JzIcon';

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
      <div className="jz-ai-panel-body">
        {streaming && !text && (
          <div className="jz-ai-panel-empty">
            <Spin size="small" /> <span style={{ marginLeft: 8 }}>正在生成…</span>
          </div>
        )}
        {!streaming && !text && !selectionPreview && (
          <div className="jz-ai-panel-empty">等待 AI 响应…</div>
        )}
        {text && (
          <pre>
            {text}
            {streaming && <span style={{ opacity: 0.6 }}>▍</span>}
          </pre>
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
