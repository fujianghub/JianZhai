import { Button, Tooltip } from 'antd';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  CloseOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { downloadExport, type ExportTask } from '@/api/exports';
import { useExportWatchStore } from '@/stores/exportWatch';

const STATUS_TEXT: Record<ExportTask['status'], string> = {
  pending: '排队中',
  running: '导出中',
  done: '已就绪',
  failed: '失败',
};

function statusIcon(t: ExportTask) {
  if (t.status === 'done') return <CheckCircleFilled className="jz-export-capsule-ico is-done" />;
  if (t.status === 'failed') return <CloseCircleFilled className="jz-export-capsule-ico is-failed" />;
  return <LoadingOutlined className="jz-export-capsule-ico" spin />;
}

/**
 * 导出实况胶囊（App 级常驻，路由切换不消失）。
 * 观察池空则不渲染任何 DOM；样式见 theme.css（--jz-overlay-surface 实底，
 * 与 AI FAB（右下）错开固定在左下）。
 */
export default function ExportCapsule() {
  const tasks = useExportWatchStore((s) => s.tasks);
  const dismiss = useExportWatchStore((s) => s.dismiss);
  if (tasks.length === 0) return null;
  return (
    <div className="jz-export-capsule-stack" role="status" aria-live="polite">
      {tasks.map((t) => (
        <div
          key={t.id}
          className={`jz-export-capsule${t.status === 'failed' ? ' is-failed' : ''}`}
        >
          {statusIcon(t)}
          <Tooltip title={t.status === 'failed' && t.error ? t.error : undefined}>
            <span className="jz-export-capsule-label">
              导出 · {t.format.toUpperCase()} · {t.target_label || t.filename || `#${t.id}`} ·{' '}
              {STATUS_TEXT[t.status]}
            </span>
          </Tooltip>
          {t.status === 'done' && (
            <Button
              size="small"
              type="primary"
              onClick={() => {
                downloadExport(t);
                dismiss(t.id);
              }}
            >
              下载
            </Button>
          )}
          <button
            type="button"
            className="jz-export-capsule-close"
            aria-label="关闭该导出提示"
            onClick={() => dismiss(t.id)}
          >
            <CloseOutlined />
          </button>
        </div>
      ))}
    </div>
  );
}
