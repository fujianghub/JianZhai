import {
  CheckCircleFilled,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleFilled,
  LoadingOutlined,
} from '@ant-design/icons';
import { SAVE_STATUS_META, type SaveStatus } from './saveStatus';

/**
 * 保存状态胶囊——三编辑器共用（此前各自 `<Tag color>` 纯文字，无图标、三份重复）。
 * 图标三态机照抄 ExportCapsule 范式：spin / 实心勾 / 实心叉；`role="status"` +
 * `aria-live="polite"` 让读屏在保存失败时得到通知。
 */
function statusIcon(status: SaveStatus) {
  switch (status) {
    case 'saving':
      return <LoadingOutlined spin />;
    case 'saved':
      return <CheckCircleFilled />;
    case 'error':
      return <CloseCircleFilled />;
    case 'pending':
      return <ClockCircleOutlined />;
    default:
      return <CheckCircleOutlined />;
  }
}

export default function SaveStatusPill({ status }: { status: SaveStatus }) {
  const meta = SAVE_STATUS_META[status];
  return (
    <span
      className={`jz-save-pill is-${status} tone-${meta.tone}`}
      role="status"
      aria-live="polite"
      data-status={status}
    >
      <span className="jz-save-pill-ico" aria-hidden>
        {statusIcon(status)}
      </span>
      {meta.text}
    </span>
  );
}
