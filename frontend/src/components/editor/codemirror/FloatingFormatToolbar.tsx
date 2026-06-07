import { createPortal } from 'react-dom';
import { Tooltip } from 'antd';
import {
  BoldOutlined,
  ItalicOutlined,
  StrikethroughOutlined,
  CodeOutlined,
  UnderlineOutlined,
  LinkOutlined,
  ClearOutlined,
} from '@ant-design/icons';

export type FloatCommand =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'underline'
  | 'link'
  | 'clear';

interface Props {
  /** 选区上方的锚点（视口坐标）；null 隐藏。 */
  anchor: { left: number; top: number } | null;
  onCommand: (cmd: FloatCommand) => void;
}

const ITEMS: Array<{ cmd: FloatCommand; icon: React.ReactNode; title: string }> = [
  { cmd: 'bold', icon: <BoldOutlined />, title: '加粗 (Ctrl+B)' },
  { cmd: 'italic', icon: <ItalicOutlined />, title: '斜体 (Ctrl+I)' },
  { cmd: 'strike', icon: <StrikethroughOutlined />, title: '删除线 (Ctrl+Shift+X)' },
  { cmd: 'code', icon: <CodeOutlined />, title: '行内代码 (Ctrl+E)' },
  { cmd: 'underline', icon: <UnderlineOutlined />, title: '下划线 (Ctrl+U)' },
  { cmd: 'link', icon: <LinkOutlined />, title: '链接 (Ctrl+K)' },
  { cmd: 'clear', icon: <ClearOutlined />, title: '清除格式' },
];

/**
 * MD 模式选区浮动格式条（语雀式「就近编辑」）。
 * 锚在选区起点上方；mousedown preventDefault 保持编辑器选区不丢。
 */
export default function FloatingFormatToolbar({ anchor, onCommand }: Props) {
  if (!anchor) return null;
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.max(8, anchor.left),
    top: Math.max(8, anchor.top - 44),
    zIndex: 9999,
  };
  return createPortal(
    <div
      className="jz-md-float-toolbar"
      style={style}
      role="toolbar"
      aria-label="选区格式"
      onMouseDown={(e) => e.preventDefault()}
    >
      {ITEMS.map((it) => (
        <Tooltip key={it.cmd} title={it.title} mouseEnterDelay={0.4}>
          <button
            type="button"
            className="jz-md-float-btn"
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
