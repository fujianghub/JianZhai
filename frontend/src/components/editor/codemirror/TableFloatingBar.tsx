import { createPortal } from 'react-dom';
import { Tooltip } from 'antd';
import {
  AlignCenterOutlined,
  InsertRowBelowOutlined,
  InsertRowRightOutlined,
  DeleteRowOutlined,
  DeleteColumnOutlined,
} from '@ant-design/icons';

export type TableBarCommand = 'format' | 'row' | 'col' | 'del-row' | 'del-col';

interface Props {
  /** 表格首行上方的锚点（视口坐标）；null 隐藏。 */
  anchor: { left: number; top: number } | null;
  onCommand: (cmd: TableBarCommand) => void;
}

const ITEMS: Array<{ cmd: TableBarCommand; icon: React.ReactNode; title: string; danger?: boolean }> = [
  { cmd: 'format', icon: <AlignCenterOutlined />, title: '一键对齐格式化' },
  { cmd: 'row', icon: <InsertRowBelowOutlined />, title: '下方插入行' },
  { cmd: 'col', icon: <InsertRowRightOutlined />, title: '右侧插入列' },
  { cmd: 'del-row', icon: <DeleteRowOutlined />, title: '删除当前行', danger: true },
  { cmd: 'del-col', icon: <DeleteColumnOutlined />, title: '删除当前列', danger: true },
];

/** MD 模式：光标进入表格自动浮出的操作条（语雀式就近操作）。 */
export default function TableFloatingBar({ anchor, onCommand }: Props) {
  if (!anchor) return null;
  return createPortal(
    <div
      className="jz-md-float-toolbar jz-md-table-bar"
      style={{ position: 'fixed', left: Math.max(8, anchor.left), top: Math.max(8, anchor.top - 40), zIndex: 9998 }}
      role="toolbar"
      aria-label="表格操作"
      onMouseDown={(e) => e.preventDefault()}
    >
      <span className="jz-md-table-bar-label">表格</span>
      {ITEMS.map((it) => (
        <Tooltip key={it.cmd} title={it.title} mouseEnterDelay={0.4}>
          <button
            type="button"
            className={`jz-md-float-btn${it.danger ? ' is-danger' : ''}`}
            onClick={() => onCommand(it.cmd)}
            aria-label={it.title}
          >
            {it.icon}
          </button>
        </Tooltip>
      ))}
    </div>,
    document.body,
  );
}
