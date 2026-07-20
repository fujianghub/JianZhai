import { createPortal } from 'react-dom';
import { Tooltip } from 'antd';

export type LinkMenuCommand = 'plain' | 'title' | 'card' | 'open-doc' | 'browse';

interface Props {
  /** 链接下方的锚点（视口坐标）；null 隐藏。 */
  anchor: { left: number; top: number } | null;
  /** 内部 doc: 链接才显示「打开文档」。 */
  isDoc: boolean;
  /** mailto/锚点等不可转卡片。 */
  canCard: boolean;
  /** 显示文本本身是裸 URL ⇔ 链接模式激活，否则标题模式激活。 */
  plainActive: boolean;
  titleLoading?: boolean;
  onCommand: (cmd: LinkMenuCommand) => void;
}

/**
 * MD 模式光标落在 `[text](url)` 上时的语雀式链接菜单
 * （FloatingFormatToolbar 同款 portal 范式）。
 */
export default function LinkFloatingMenu({
  anchor,
  isDoc,
  canCard,
  plainActive,
  titleLoading,
  onCommand,
}: Props) {
  if (!anchor) return null;
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.max(8, anchor.left),
    top: anchor.top,
    zIndex: 9999,
  };
  const modeBtn = (cmd: LinkMenuCommand, label: string, active: boolean, title: string) => (
    <Tooltip title={title} mouseEnterDelay={0.4}>
      <button
        type="button"
        className={'jz-md-float-btn jz-md-link-btn' + (active ? ' is-active' : '')}
        onClick={() => onCommand(cmd)}
        disabled={cmd === 'card' && !canCard}
      >
        {label}
      </button>
    </Tooltip>
  );
  return createPortal(
    <div
      className="jz-md-float-toolbar jz-md-link-menu"
      style={style}
      role="toolbar"
      aria-label="链接操作"
      onMouseDown={(e) => e.preventDefault()}
    >
      {modeBtn('plain', '链接', plainActive, '显示为 URL 原文')}
      {modeBtn('title', titleLoading ? '取标题…' : '标题', !plainActive, '显示为目标标题')}
      {modeBtn('card', '卡片', false, '转为卡片')}
      <span className="jz-md-float-divider" aria-hidden />
      {isDoc && modeBtn('open-doc', '打开文档', false, '站内打开该文档')}
      {modeBtn('browse', '浏览器访问', false, '新标签页打开')}
    </div>,
    document.body,
  );
}
