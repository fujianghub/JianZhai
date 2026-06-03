/**
 * JianZhai 自制图标库 — 主题双色（柔和线稿 + accent 浅填色 + 玉石渐变）。
 *
 * 颜色全部由 CSS 变量驱动（定义于 .jz-glass）：
 *   --jz-icon-fill / --jz-icon-fill-strong / --jz-icon-spot
 *   --jz-icon-grad-a / --jz-icon-grad-b（玉石渐变两端）
 * 全部派生自 --jz-icon-accent（默认翡翠 --jz-accent，全站统一）。
 * 描边用 currentColor，由父级槽位控制默认/hover/选中色。
 *
 * 图形：24×24，stroke 1.5，每图标 ≤1 渐变/浅填色面 + ≤2 点缀。
 */
import { useId } from 'react';
import type { CSSProperties, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  /** 覆盖 --jz-icon-accent（少用；默认跟主题翡翠走） */
  tone?: string;
};

const baseProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const ICON_FILL = 'var(--jz-icon-fill)';
const ICON_FILL_STRONG = 'var(--jz-icon-fill-strong)';
const ICON_SPOT = 'var(--jz-icon-spot)';

/**
 * 玉石线性渐变 def — 每个图标实例独立 id，避免同页多实例冲突
 * （id 约定同 ArchitectureSVG：useId 去冒号）。
 * stop-color 走 CSS 变量，随主题自动变色。
 */
function useJadeGrad() {
  const id = `jz-jade-${useId().replace(/:/g, '')}`;
  const def = (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor="var(--jz-icon-grad-a)" />
      <stop offset="100%" stopColor="var(--jz-icon-grad-b)" />
    </linearGradient>
  );
  return { id, def, url: `url(#${id})` };
}

function Wrap({
  size = '1em',
  tone,
  children,
  style,
  className,
  ...rest
}: IconProps & { children: React.ReactNode }) {
  const mergedStyle: CSSProperties = {
    ...style,
    ['--jz-icon-accent' as string]: tone,
  };
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      className={['jz-icon', className].filter(Boolean).join(' ')}
      style={mergedStyle}
      {...baseProps}
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ═══════════════ 后台菜单 ═══════════════ */

/** 线装书 — 知识库（书封玉石渐变 + 书脊三孔 + 右上书签垂带） */
export function JzKbIcon(p: IconProps) {
  const grad = useJadeGrad();
  return (
    <Wrap {...p}>
      <defs>{grad.def}</defs>
      <path
        d="M5 4h13a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"
        fill={grad.url}
      />
      <path d="M5 4h13a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M8 5v14" />
      <path d="M14.8 4v4.2l1.4-1.1 1.4 1.1V4" fill={ICON_FILL_STRONG} />
      <circle cx="8" cy="9" r="0.75" fill={ICON_SPOT} stroke="none" />
      <circle cx="8" cy="12" r="0.75" fill={ICON_SPOT} stroke="none" />
      <circle cx="8" cy="15" r="0.75" fill={ICON_SPOT} stroke="none" />
      <line x1="11" y1="10.5" x2="16" y2="10.5" opacity="0.55" />
      <line x1="11" y1="13.5" x2="15" y2="13.5" opacity="0.4" />
      <line x1="11" y1="16.5" x2="13.5" y2="16.5" opacity="0.3" />
    </Wrap>
  );
}

/** 节点网络 — 知识图谱（中心节点玉石渐变 + 外节点层次） */
export function JzGraphIcon(p: IconProps) {
  const grad = useJadeGrad();
  return (
    <Wrap {...p}>
      <defs>{grad.def}</defs>
      <circle cx="6.5" cy="7.5" r="2" fill={ICON_FILL_STRONG} stroke="none" />
      <circle cx="6.5" cy="7.5" r="2" />
      <circle cx="17.5" cy="7.5" r="2" />
      <circle cx="12" cy="17.5" r="2" />
      <line x1="8" y1="8.6" x2="10.1" y2="10.2" />
      <line x1="16" y1="8.6" x2="13.9" y2="10.2" />
      <line x1="12" y1="14.7" x2="12" y2="15.4" />
      <circle cx="12" cy="12" r="2.6" fill={grad.url} stroke="none" />
      <circle cx="12" cy="12" r="2.6" />
      <circle cx="12" cy="12" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/** 文档导出（折角文档玉石渐变 + 外送箭头） */
export function JzExportIcon(p: IconProps) {
  const grad = useJadeGrad();
  return (
    <Wrap {...p}>
      <defs>{grad.def}</defs>
      <path
        d="M4 7a1 1 0 0 1 1-1h6.5L14 8.5V17a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7z"
        fill={grad.url}
      />
      <path d="M4 7a1 1 0 0 1 1-1h6.5L14 8.5V17a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7z" />
      <path d="M11.5 6v2.5H14" opacity="0.7" />
      <path d="M6.5 11.5h5M6.5 14.5h3.5" strokeLinecap="round" opacity="0.55" />
      <path d="M15 12h4.5" />
      <path d="M17.2 10.2L19.5 12l-2.3 1.8" fill={ICON_SPOT} stroke={ICON_SPOT} />
    </Wrap>
  );
}

/** AI 助手（六边宝石玉石渐变 + 内核 + 侧旁小星） */
export function JzAiIcon(p: IconProps) {
  const grad = useJadeGrad();
  return (
    <Wrap {...p}>
      <defs>{grad.def}</defs>
      <path
        d="M12 4l6.5 3.75v8.5L12 20l-6.5-3.75v-8.5L12 4z"
        fill={grad.url}
      />
      <path d="M12 4l6.5 3.75v8.5L12 20l-6.5-3.75v-8.5L12 4z" />
      <circle cx="12" cy="12" r="2.5" fill={ICON_FILL_STRONG} stroke="none" />
      <circle cx="12" cy="12" r="1" fill={ICON_SPOT} stroke="none" />
      <path
        d="M15.9 7.1l.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4.4-1.1z"
        fill={ICON_SPOT}
        stroke="none"
        opacity="0.85"
      />
    </Wrap>
  );
}

/** 工具栏 AI 图标（更克制的圆角方 + sparkle）。 */
export function JzAiToolbarIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <rect x="5.5" y="5.5" width="13" height="13" rx="3.2" fill={ICON_FILL} />
      <rect x="5.5" y="5.5" width="13" height="13" rx="3.2" />
      <path
        d="M12 8.3l.7 2.9 2.9.7-2.9.8L12 15.7l-.7-2.9-2.9-.7 2.9-.8L12 8.3z"
        fill={ICON_FILL_STRONG}
        stroke="none"
      />
      <path d="M12 8.3l.7 2.9 2.9.7-2.9.8L12 15.7l-.7-2.9-2.9-.7 2.9-.8L12 8.3z" />
      <circle cx="16.9" cy="7.1" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/* ═══════════════ AI 助手操作菜单 ═══════════════ */

export function JzAiContinueIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M6.5 17.5l2-5.5 5.5-2-5.5 2" />
      <path d="M14 8v6" strokeLinecap="round" opacity="0.55" />
      <circle cx="17.5" cy="6.5" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

export function JzAiPolishIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M7 17l3-9 2 2 4-4 3 11" />
      <path d="M16.5 6.5l1.5 1.5-1.5 1.5" fill={ICON_SPOT} stroke={ICON_SPOT} />
    </Wrap>
  );
}

export function JzAiExpandIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M8 12h8M12 8v8" />
      <path d="M6.5 9.5L8 8M15.5 9.5L14 8M6.5 14.5L8 16M15.5 14.5L14 16" opacity="0.55" />
      <circle cx="12" cy="12" r="1" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

export function JzAiFixIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M7.5 12.5l2.2 2.2 6.8-6.8" />
      <path d="M5 18h4" opacity="0.55" strokeLinecap="round" />
      <circle cx="17" cy="7" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

export function JzAiSummarizeIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M7 8h10M7 12h8M7 16h6" strokeLinecap="round" />
      <path d="M16 8v8" opacity="0.55" />
      <circle cx="5.5" cy="8" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

export function JzAiGenOutlineIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M7 7h10M9 11h8M11 15h6" strokeLinecap="round" />
      <circle cx="5.5" cy="7" r="0.8" fill={ICON_SPOT} stroke="none" />
      <circle cx="7.5" cy="11" r="0.8" fill={ICON_FILL_STRONG} stroke="none" />
      <circle cx="9.5" cy="15" r="0.8" fill={ICON_FILL_STRONG} stroke="none" />
    </Wrap>
  );
}

export function JzAiTranslateEnIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M6 8h5v8H6z" fill={ICON_FILL} />
      <path d="M6 8h5v8H6z" />
      <path d="M8 10h1M8 13h1" strokeLinecap="round" />
      <path d="M14 10h4M14 14h3" strokeLinecap="round" />
      <circle cx="17.5" cy="7" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

export function JzAiTranslateZhIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <rect x="6" y="7" width="12" height="10" rx="2" fill={ICON_FILL} />
      <rect x="6" y="7" width="12" height="10" rx="2" />
      <path d="M9.5 11.5h5M11 9.8v3.4" strokeLinecap="round" />
      <circle cx="16.8" cy="7.2" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

export function JzAiAskIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path
        d="M6 7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4.5L9 19v-4H8a2 2 0 0 1-2-2V7z"
        fill={ICON_FILL}
      />
      <path d="M6 7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4.5L9 19v-4H8a2 2 0 0 1-2-2V7z" />
      <path d="M9.5 10.5h5" strokeLinecap="round" opacity="0.65" />
      <circle cx="17" cy="7" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/* ═══════════════ 编辑器插入菜单 / Slash 命令 ═══════════════ */

export function JzImageIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <rect x="5" y="6" width="14" height="12" rx="2" fill={ICON_FILL} />
      <rect x="5" y="6" width="14" height="12" rx="2" />
      <path d="M8 14l2.2-2.2 2.2 2.2 2.6-3 3 3.6" opacity="0.9" />
      <circle cx="9" cy="9.5" r="1.1" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

export function JzTableIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <rect x="5" y="6" width="14" height="12" rx="2" fill={ICON_FILL} />
      <rect x="5" y="6" width="14" height="12" rx="2" />
      <path d="M5 10h14M5 14h14M10 6v12M14 6v12" opacity="0.9" />
      <circle cx="7.5" cy="8.2" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

export function JzQuoteIcon(p: IconProps) {
  const grad = useJadeGrad();
  return (
    <Wrap {...p}>
      <defs>{grad.def}</defs>
      <path d="M7.5 12.5c0-2 1.1-3.6 3-4.5v1.9c-1 .6-1.4 1.3-1.4 2.6h1.6v3.5H7.5v-3.5z" fill={grad.url} />
      <path d="M13.3 12.5c0-2 1.1-3.6 3-4.5v1.9c-1 .6-1.4 1.3-1.4 2.6h1.6v3.5h-3.2v-3.5z" fill={grad.url} />
      <path d="M7.5 12.5c0-2 1.1-3.6 3-4.5v1.9c-1 .6-1.4 1.3-1.4 2.6h1.6v3.5H7.5v-3.5z" />
      <path d="M13.3 12.5c0-2 1.1-3.6 3-4.5v1.9c-1 .6-1.4 1.3-1.4 2.6h1.6v3.5h-3.2v-3.5z" />
      <path d="M8.5 18.5h7" opacity="0.5" />
      <circle cx="12" cy="6.8" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

export function JzHrIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M5.5 12h13" />
      <path d="M7.2 12l1.1-1.1M7.2 12l1.1 1.1" opacity="0.55" />
      <path d="M16.8 12l-1.1-1.1M16.8 12l-1.1 1.1" opacity="0.55" />
      <circle cx="12" cy="12" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

export function JzMermaidIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <circle cx="7.5" cy="8" r="1.7" />
      <circle cx="16.5" cy="8" r="1.7" />
      <circle cx="12" cy="16" r="1.7" />
      <path d="M9 8.6l2.2 5.8M15 8.6l-2.2 5.8" />
      <circle cx="12" cy="12" r="1.3" fill={ICON_FILL_STRONG} stroke="none" />
      <circle cx="12" cy="12" r="0.7" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

export function JzUmlIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <rect x="6" y="7" width="5" height="4" rx="1" fill={ICON_FILL} />
      <rect x="6" y="7" width="5" height="4" rx="1" />
      <rect x="13" y="7" width="5" height="4" rx="1" fill={ICON_FILL} />
      <rect x="13" y="7" width="5" height="4" rx="1" />
      <rect x="9.5" y="13" width="5" height="4" rx="1" fill={ICON_FILL_STRONG} stroke="none" />
      <rect x="9.5" y="13" width="5" height="4" rx="1" />
      <path d="M11 11.2l-1 1.6M13 11.2l1 1.6" />
      <circle cx="12" cy="6.2" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

export function JzVideoIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <rect x="5" y="7" width="12.5" height="10" rx="2" fill={ICON_FILL} />
      <rect x="5" y="7" width="12.5" height="10" rx="2" />
      <path d="M12 10.2l2.6 1.8-2.6 1.8v-3.6z" fill={ICON_SPOT} stroke={ICON_SPOT} />
      <path d="M17.5 10l1.8-1.1v6.2L17.5 14v-4z" opacity="0.55" />
    </Wrap>
  );
}

export function JzCalloutIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M10 17h4" />
      <path d="M11 19h2" />
      <path
        d="M12 5.8a4.2 4.2 0 0 0-2.7 7.4c.6.5.9 1 .9 1.8h3.6c0-.8.3-1.3.9-1.8A4.2 4.2 0 0 0 12 5.8z"
        fill={ICON_FILL}
      />
      <path d="M12 5.8a4.2 4.2 0 0 0-2.7 7.4c.6.5.9 1 .9 1.8h3.6c0-.8.3-1.3.9-1.8A4.2 4.2 0 0 0 12 5.8z" />
      <circle cx="12" cy="8.8" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

export function JzMathIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M17 7H9.5l5 5-5 5H17" />
      <path d="M7 7h2" />
      <path d="M7 17h2" />
      <circle cx="15.8" cy="12" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

export function JzDetailsIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <rect x="5" y="7" width="14" height="10" rx="2" fill={ICON_FILL} />
      <rect x="5" y="7" width="14" height="10" rx="2" />
      <path d="M10 10l2 2 2-2" />
      <path d="M8 14h8" opacity="0.55" />
      <circle cx="7.2" cy="9.2" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

export function JzColumns2Icon(p: IconProps) {
  return (
    <Wrap {...p}>
      <rect x="5" y="6" width="14" height="12" rx="2" fill={ICON_FILL} />
      <rect x="5" y="6" width="14" height="12" rx="2" />
      <path d="M12 6v12" />
      <circle cx="8" cy="9" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

export function JzColumns3Icon(p: IconProps) {
  return (
    <Wrap {...p}>
      <rect x="5" y="6" width="14" height="12" rx="2" fill={ICON_FILL} />
      <rect x="5" y="6" width="14" height="12" rx="2" />
      <path d="M9.6 6v12M14.4 6v12" />
      <circle cx="7.4" cy="9" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

export function JzTabsIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M6 9.2h6l1.2 1.6H18a1 1 0 0 1 1 1v5.2a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-6.8a1 1 0 0 1 1-1z" fill={ICON_FILL} />
      <path d="M6 9.2h6l1.2 1.6H18a1 1 0 0 1 1 1v5.2a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-6.8a1 1 0 0 1 1-1z" />
      <path d="M7.5 12.6h4.2" opacity="0.55" />
      <circle cx="9" cy="8" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

export function JzDocCardIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <rect x="5" y="6" width="14" height="12" rx="2" fill={ICON_FILL} />
      <rect x="5" y="6" width="14" height="12" rx="2" />
      <path d="M8 10h8M8 12.8h6" opacity="0.65" />
      <circle cx="8" cy="8.6" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

export function JzLinkCardIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <rect x="5" y="6" width="14" height="12" rx="2" fill={ICON_FILL} />
      <rect x="5" y="6" width="14" height="12" rx="2" />
      <path d="M9.5 12h2.2M12.3 12h2.2" opacity="0.7" />
      <path d="M10.2 10.5l-1.2 1.2a1.8 1.8 0 0 0 0 2.6 1.8 1.8 0 0 0 2.6 0l.5-.5" />
      <path d="M13.8 13.5l1.2-1.2a1.8 1.8 0 0 0 0-2.6 1.8 1.8 0 0 0-2.6 0l-.5.5" />
      <circle cx="8" cy="8.5" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

export function JzAtIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M16.7 12.4c0 2.7-1.9 4.6-4.7 4.6-3 0-5.4-2.3-5.4-5.2S9 6.6 12 6.6c2.7 0 4.7 1.8 4.7 4.2v1.9c0 .7-.5 1.2-1.2 1.2-.6 0-1.1-.4-1.2-1" />
      <path d="M14.4 12.1c0 1.3-1 2.3-2.3 2.3s-2.3-1-2.3-2.3 1-2.3 2.3-2.3 2.3 1 2.3 2.3z" fill={ICON_FILL_STRONG} stroke="none" />
      <path d="M14.4 12.1c0 1.3-1 2.3-2.3 2.3s-2.3-1-2.3-2.3 1-2.3 2.3-2.3 2.3 1 2.3 2.3z" />
      <circle cx="18" cy="8" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

export function JzEmojiIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <circle cx="12" cy="12" r="6.8" fill={ICON_FILL} />
      <circle cx="12" cy="12" r="6.8" />
      <circle cx="9.5" cy="11" r="0.7" fill={ICON_SPOT} stroke="none" />
      <circle cx="14.5" cy="11" r="0.7" fill={ICON_SPOT} stroke="none" />
      <path d="M9.5 14.2c.8 1 1.8 1.5 2.5 1.5s1.7-.5 2.5-1.5" />
    </Wrap>
  );
}

/** 选区 AI 浮钮 */
export function JzAiSparkIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path
        d="M12 5l1 5.5 5.5 1-5.5 1.5L12 19l-1-5.5-5.5-1 5.5-1.5L12 5z"
        fill={ICON_FILL_STRONG}
        stroke="none"
      />
      <path d="M12 5l1 5.5 5.5 1-5.5 1.5L12 19l-1-5.5-5.5-1 5.5-1.5L12 5z" />
      <circle cx="12" cy="12" r="1.2" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/** 用户（主头像玉石渐变 + 副人肩侧点缀） */
export function JzUsersIcon(p: IconProps) {
  const grad = useJadeGrad();
  return (
    <Wrap {...p}>
      <defs>{grad.def}</defs>
      <circle cx="9" cy="8" r="2.8" fill={grad.url} />
      <circle cx="9" cy="8" r="2.8" />
      <path d="M3.5 19c0-2.8 2.5-5 5.5-5s5.5 2.2 5.5 5" />
      <circle cx="17" cy="8.5" r="2.2" fill={ICON_FILL} />
      <circle cx="17" cy="8.5" r="2.2" />
      <path d="M14.5 14.5c2.2 0 4.5 1.8 4.5 4.5" />
      <circle cx="19.8" cy="12.6" r="0.8" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/** 架构总览（顶层玉石渐变 + 底座纹理） */
export function JzArchitectureIcon(p: IconProps) {
  const grad = useJadeGrad();
  return (
    <Wrap {...p}>
      <defs>{grad.def}</defs>
      <path d="M8 6h8l-1.5 2H9.5Z" fill={grad.url} />
      <path d="M8 6h8l-1.5 2H9.5Z" />
      <path d="M7 10h10l-1.5 2H8.5Z" fill={ICON_FILL} />
      <path d="M7 10h10l-1.5 2H8.5Z" />
      <path d="M6 14h12l-1.5 2H7.5Z" />
      <rect x="6.5" y="16.5" width="11" height="4.5" rx="0.5" fill={ICON_FILL_STRONG} stroke="none" />
      <path d="M9 18.7h6" opacity="0.45" />
      <circle cx="12" cy="4.5" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/** 查看博客 */
export function JzBlogIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <circle cx="12" cy="12" r="8.5" fill={ICON_FILL} />
      <circle cx="12" cy="12" r="8.5" />
      <ellipse cx="12" cy="12" rx="3.5" ry="8.5" />
      <line x1="3.5" y1="12" x2="20.5" y2="12" />
      <path d="M4.5 8q7.5-2 15 0" />
      <path d="M4.5 16q7.5 2 15 0" />
    </Wrap>
  );
}

/* ═══════════════ 博客导航 ═══════════════ */

/** 归档（柜身玉石渐变 + 抽屉拉手 + 把钮点缀） */
export function JzArchiveIcon(p: IconProps) {
  const grad = useJadeGrad();
  return (
    <Wrap {...p}>
      <defs>{grad.def}</defs>
      <rect x="4" y="4" width="16" height="4.5" rx="0.8" fill={ICON_FILL_STRONG} stroke="none" />
      <rect x="4" y="4" width="16" height="4.5" rx="0.8" />
      <rect x="5" y="9.5" width="14" height="10" rx="0.8" fill={grad.url} />
      <rect x="5" y="9.5" width="14" height="10" rx="0.8" />
      <path d="M10 13h4" strokeLinecap="round" />
      <circle cx="12" cy="16.2" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/** 标签（牌面玉石渐变 + 系绳孔 + 斜纹） */
export function JzTagsIcon(p: IconProps) {
  const grad = useJadeGrad();
  return (
    <Wrap {...p}>
      <defs>{grad.def}</defs>
      <path d="M4 5h7l9 8.5-7.5 7.5L4 12.5V5z" fill={grad.url} />
      <path d="M4 5h7l9 8.5-7.5 7.5L4 12.5V5z" />
      <circle cx="7.5" cy="8.5" r="1.3" fill={ICON_SPOT} stroke="none" />
      <path d="M11 12l3.5 3.3" opacity="0.45" />
    </Wrap>
  );
}

/** RSS（波纹三弧 + 信号源点） */
export function JzRssIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <circle cx="5.5" cy="18.5" r="1.8" fill={ICON_SPOT} stroke="none" />
      <path d="M5.5 12.5A6 6 0 0 1 11.5 18.5" fill="none" />
      <path d="M5.5 9.2A9.3 9.3 0 0 1 14.8 18.5" fill="none" opacity="0.45" />
      <path d="M5.5 6A12 12 0 0 1 17.5 18.5" fill="none" />
    </Wrap>
  );
}

/** 后台入口 */
export function JzAdminIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <rect x="4" y="4" width="9" height="9" rx="1" fill={ICON_FILL} />
      <rect x="4" y="4" width="9" height="9" rx="1" />
      <circle cx="8.5" cy="8.5" r="1.5" fill={ICON_SPOT} stroke="none" />
      <path d="M13.5 13.5l5.5 5.5" />
      <circle cx="18.5" cy="18.5" r="2" fill={ICON_FILL} />
      <circle cx="18.5" cy="18.5" r="2" />
    </Wrap>
  );
}

/** 个人空间（人形 + 册页） */
export function JzSpaceIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path
        d="M12 12c2.2 0 4-1.6 4-3.6S14.2 4.8 12 4.8 8 6.4 8 8.4s1.8 3.6 4 3.6z"
        fill={ICON_FILL}
      />
      <path d="M12 12c2.2 0 4-1.6 4-3.6S14.2 4.8 12 4.8 8 6.4 8 8.4s1.8 3.6 4 3.6z" />
      <path d="M6.5 19.2c.8-2.6 3-4.4 5.5-4.4s4.7 1.8 5.5 4.4" fill="none" />
      <rect x="15" y="6" width="6" height="8" rx="1" fill={ICON_FILL} />
      <rect x="15" y="6" width="6" height="8" rx="1" />
      <path d="M16.5 8.5h3M16.5 11h2.2" strokeWidth={1.2} />
      <circle cx="17.5" cy="13.5" r="0.8" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/** 搜索（镜片玉石渐变 + 高光弧 + 柄端点缀） */
export function JzSearchIcon(p: IconProps) {
  const grad = useJadeGrad();
  return (
    <Wrap {...p}>
      <defs>{grad.def}</defs>
      <circle cx="10.5" cy="10.5" r="6" fill={grad.url} />
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M7.6 8.6a3.6 3.6 0 0 1 2.2-1.7" opacity="0.55" />
      <path d="M15 15l4.5 4.5" />
      <circle cx="19.2" cy="19.2" r="1" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/* ═══════════════ AI 管理 Tab ═══════════════ */

export function JzOverviewIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <circle cx="12" cy="12" r="8" fill={ICON_FILL} />
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7l1 5-1 1-1-5z" fill={ICON_SPOT} stroke="none" />
      <path d="M12 13l-1-1 1-5 1 5z" />
    </Wrap>
  );
}

export function JzModelIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M12 4l7.5 4v8L12 20l-7.5-4v-8L12 4z" fill={ICON_FILL} />
      <path d="M12 4l7.5 4v8L12 20l-7.5-4v-8L12 4z" />
      <path d="M12 4v8l7.5-4M12 12L4.5 8" opacity="0.45" />
    </Wrap>
  );
}

export function JzUsageIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M4 20h16" />
      <rect x="6.5" y="13" width="2.5" height="7" rx="0.4" fill={ICON_FILL} />
      <rect x="11" y="9" width="2.5" height="11" rx="0.4" fill={ICON_FILL_STRONG} stroke="none" />
      <rect x="15.5" y="11" width="2.5" height="9" rx="0.4" fill={ICON_FILL} />
    </Wrap>
  );
}

export function JzSettingsIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <circle cx="12" cy="12" r="2.8" fill={ICON_FILL} />
      <circle cx="12" cy="12" r="2.8" />
      <path d="M12 3v2M12 19v2M21 12h-2M5 12H3M18.4 5.6l-1.4 1.4M7 17l-1.4 1.4M18.4 18.4l-1.4-1.4M7 7L5.6 5.6" />
    </Wrap>
  );
}

/* ═══════════════ 编辑器侧栏 Tab ═══════════════ */

export function JzOutlineIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M5 6h14M8 10h11M8 14h11M11 18h8" strokeLinecap="round" />
      <circle cx="5" cy="10" r="0.8" fill={ICON_SPOT} stroke="none" />
      <circle cx="5" cy="14" r="0.8" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

export function JzBacklinkIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <circle cx="6.5" cy="6.5" r="2.2" fill={ICON_FILL} />
      <circle cx="6.5" cy="6.5" r="2.2" />
      <circle cx="17.5" cy="17.5" r="2.2" fill={ICON_FILL} />
      <circle cx="17.5" cy="17.5" r="2.2" />
      <path d="M8.5 8.5l7 7" />
      <path d="M10 7.5H8v2M16.5 16.5h2v-2" />
    </Wrap>
  );
}

export function JzCommentIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path
        d="M5 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11l-3.5 3.5V16H7a2 2 0 0 1-2-2V6z"
        fill={ICON_FILL}
      />
      <path d="M9 10.5h6M9 13h4" strokeLinecap="round" opacity="0.55" />
    </Wrap>
  );
}

export function JzAttachmentIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path
        d="M16.5 8.5L9.5 15.5a2.8 2.8 0 0 1-4-4l7.5-7.5a4 4 0 0 1 5.7 5.7l-8 8a5.5 5.5 0 0 1-7.8-7.8l1.5-1.5"
        fill="none"
      />
      <circle cx="17" cy="7" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/** 四角向外 — 进入全屏 / 完整编辑 */
export function JzFullscreenIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M9 4H5a1 1 0 0 0-1 1v4" />
      <path d="M15 4h4a1 1 0 0 1 1 1v4" />
      <path d="M20 15v4a1 1 0 0 1-1 1h-4" />
      <path d="M4 15v4a1 1 0 0 0 1 1h4" />
      <circle cx="12" cy="12" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/** 四角向内 — 退出全屏 */
export function JzCompressIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M4 8h3a1 1 0 0 0 1-1V4" />
      <path d="M20 8h-3a1 1 0 0 1-1-1V4" />
      <path d="M16 20v-3a1 1 0 0 1 1-1h3" />
      <path d="M8 20v-3a1 1 0 0 0-1-1H4" />
      <circle cx="12" cy="12" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

// JzQuoteIcon 已在上方定义（line ~264），无需重复。
// 注册到 JZ_ICONS map 下方即可让侧栏菜单引用。

/* ═══════════════ 后台菜单（专属新图标） ═══════════════ */

/** 四宫格仪表盘 — 工作台 */
export function JzDashboardIcon(p: IconProps) {
  const grad = useJadeGrad();
  return (
    <Wrap {...p}>
      <defs>{grad.def}</defs>
      <rect x="4" y="4" width="9" height="7" rx="1.5" fill={grad.url} />
      <rect x="4" y="4" width="9" height="7" rx="1.5" />
      <rect x="15" y="4" width="5" height="7" rx="1.5" />
      <rect x="4" y="13" width="5" height="7" rx="1.5" />
      <rect x="11" y="13" width="9" height="7" rx="1.5" fill={ICON_FILL} />
      <rect x="11" y="13" width="9" height="7" rx="1.5" />
      <path d="M13 17.6l2-2 1.5 1.2 2-2.4" />
      <circle cx="18.5" cy="14.4" r="0.8" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/** 纸篓 — 回收站 */
export function JzTrashIcon(p: IconProps) {
  const grad = useJadeGrad();
  return (
    <Wrap {...p}>
      <defs>{grad.def}</defs>
      <path
        d="M6.5 8.5h11l-1 10.6a1.5 1.5 0 0 1-1.5 1.4H9a1.5 1.5 0 0 1-1.5-1.4l-1-10.6z"
        fill={grad.url}
      />
      <path d="M6.5 8.5h11l-1 10.6a1.5 1.5 0 0 1-1.5 1.4H9a1.5 1.5 0 0 1-1.5-1.4l-1-10.6z" />
      <path d="M5 8.5h14" />
      <path d="M9.8 5.5h4.4a1 1 0 0 1 1 1v2H8.8v-2a1 1 0 0 1 1-1z" fill={ICON_FILL_STRONG} />
      <path d="M10.4 11.5l.4 5.8M13.6 11.5l-.4 5.8" opacity="0.5" />
      <circle cx="12" cy="7.2" r="0.8" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/** 人像 + 落款印 — 个人资料 */
export function JzProfileIcon(p: IconProps) {
  const grad = useJadeGrad();
  return (
    <Wrap {...p}>
      <defs>{grad.def}</defs>
      <circle cx="11" cy="8.5" r="3.2" fill={ICON_FILL} />
      <circle cx="11" cy="8.5" r="3.2" />
      <path d="M4.5 19.5c.9-3 3.5-5 6.5-5s5.6 2 6.5 5" fill={grad.url} />
      <path d="M4.5 19.5c.9-3 3.5-5 6.5-5s5.6 2 6.5 5" />
      <rect x="16.2" y="4.8" width="4" height="4" rx="0.8" fill={ICON_SPOT} stroke="none" opacity="0.9" />
      <path d="M17.4 6.8h1.6" stroke="#fff" strokeWidth={1.1} opacity="0.85" />
    </Wrap>
  );
}

/* ═══════════════ KB 树节点 ═══════════════ */
/* 树行高小（~16px 渲染），细节克制：1 渐变面 + 1-2 笔 + 1 大彩点（r≥1）。 */

/** 函套（合）— 文件夹折叠态 */
export function JzFolderIcon(p: IconProps) {
  const grad = useJadeGrad();
  return (
    <Wrap {...p}>
      <defs>{grad.def}</defs>
      <path
        d="M4 7.5a1 1 0 0 1 1-1h4.2l1.8 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-11z"
        fill={grad.url}
      />
      <path d="M4 7.5a1 1 0 0 1 1-1h4.2l1.8 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-11z" />
      <path d="M4 11h16" opacity="0.45" />
      <circle cx="17.3" cy="14.8" r="1" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/** 函套（开）— 文件夹展开态，前盖外翻 */
export function JzFolderOpenIcon(p: IconProps) {
  const grad = useJadeGrad();
  return (
    <Wrap {...p}>
      <defs>{grad.def}</defs>
      <path d="M4 17.5V7.5a1 1 0 0 1 1-1h4.2l1.8 2h7a1 1 0 0 1 1 1V11" />
      <path
        d="M6.4 11h13.3a.7.7 0 0 1 .67.9l-1.85 6.4a1 1 0 0 1-.96.7H4.3a.7.7 0 0 1-.67-.9L5.4 11.8a1 1 0 0 1 1-.8z"
        fill={grad.url}
      />
      <path d="M6.4 11h13.3a.7.7 0 0 1 .67.9l-1.85 6.4a1 1 0 0 1-.96.7H4.3a.7.7 0 0 1-.67-.9L5.4 11.8a1 1 0 0 1 1-.8z" />
      <circle cx="16.6" cy="15" r="1" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/** 折角笺纸 — 树文档节点（浅填区别于书封 JzKbIcon） */
export function JzDocIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path
        d="M6.5 4H13l5 5v10a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"
        fill={ICON_FILL}
      />
      <path d="M6.5 4H13l5 5v10a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M13 4v4.2a.8.8 0 0 0 .8.8H18" opacity="0.6" />
      <path d="M8.5 13h7" opacity="0.5" />
      <path d="M8.5 16h5" opacity="0.35" />
      <circle cx="8.8" cy="8.3" r="1" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/* ═══════════════ 主题切换 ═══════════════ */

/** 日轮 — 亮色主题 */
export function JzSunIcon(p: IconProps) {
  const grad = useJadeGrad();
  return (
    <Wrap {...p}>
      <defs>{grad.def}</defs>
      <circle cx="12" cy="12" r="4" fill={grad.url} />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M18 6l-1.4 1.4M7.4 16.6L6 18" />
      <circle cx="12" cy="12" r="1" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/** 月牙 — 暗色主题 */
export function JzMoonIcon(p: IconProps) {
  const grad = useJadeGrad();
  return (
    <Wrap {...p}>
      <defs>{grad.def}</defs>
      <path
        d="M19.5 13A7.5 7.5 0 1 1 11 4.5a6 6 0 0 0 8.5 8.5z"
        fill={grad.url}
      />
      <path d="M19.5 13A7.5 7.5 0 1 1 11 4.5a6 6 0 0 0 8.5 8.5z" />
      <circle cx="17.5" cy="6.5" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/** 星空 — starry 主题（一大星 + 两小星点，区别于收藏星 JzStarIcon） */
export function JzStarrySkyIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path
        d="M12 5.5l1.5 3.4 3.7.5-2.7 2.6.7 3.7-3.2-1.8-3.2 1.8.7-3.7-2.7-2.6 3.7-.5L12 5.5z"
        fill={ICON_FILL_STRONG}
        stroke="none"
      />
      <path d="M12 5.5l1.5 3.4 3.7.5-2.7 2.6.7 3.7-3.2-1.8-3.2 1.8.7-3.7-2.7-2.6 3.7-.5L12 5.5z" />
      <circle cx="18.7" cy="15.8" r="0.8" fill={ICON_SPOT} stroke="none" />
      <circle cx="5.3" cy="13.2" r="0.7" fill={ICON_SPOT} stroke="none" />
      <path d="M18 5.5v2M17 6.5h2" opacity="0.5" />
    </Wrap>
  );
}

/** 海波 — deepsea 主题（三道波浪，吸收原 ThemeSwitcher 本地 WaveIcon） */
export function JzDeepseaIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M4 8.5c1.3-1.5 2.7-1.5 4 0s2.7 1.5 4 0 2.7-1.5 4 0 2.7 1.5 4 0" />
      <path d="M4 13c1.3-1.5 2.7-1.5 4 0s2.7 1.5 4 0 2.7-1.5 4 0 2.7 1.5 4 0" opacity="0.6" />
      <path d="M4 17.5c1.3-1.5 2.7-1.5 4 0s2.7 1.5 4 0 2.7-1.5 4 0 2.7 1.5 4 0" opacity="0.35" />
      <circle cx="18.5" cy="5.2" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/* ═══════════════ 博客阅读端 meta ═══════════════ */

/** 钟面 — 发布时间 */
export function JzClockIcon(p: IconProps) {
  const grad = useJadeGrad();
  return (
    <Wrap {...p}>
      <defs>{grad.def}</defs>
      <circle cx="12" cy="12" r="7.5" fill={grad.url} />
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 7.8V12l2.9 1.7" />
      <circle cx="12" cy="12" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/** 书斋小屋 — 面包屑首页 */
export function JzHomeIcon(p: IconProps) {
  const grad = useJadeGrad();
  return (
    <Wrap {...p}>
      <defs>{grad.def}</defs>
      <path
        d="M6 10.5L12 5.5l6 5v8a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-8z"
        fill={grad.url}
      />
      <path d="M6 10.5L12 5.5l6 5v8a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-8z" />
      <path d="M4 12l8-6.7L20 12" opacity="0.55" />
      <path d="M10.5 19.5V15h3v4.5" />
      <circle cx="12" cy="9.7" r="0.8" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/* ═══════════════ 用户菜单 ═══════════════ */

/** 收藏星 — 饱满居中五角星 */
export function JzStarIcon(p: IconProps) {
  const grad = useJadeGrad();
  return (
    <Wrap {...p}>
      <defs>{grad.def}</defs>
      <path
        d="M12 4.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7L12 4.5z"
        fill={grad.url}
      />
      <path d="M12 4.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7L12 4.5z" />
      <circle cx="12" cy="11.5" r="1" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/** 退出登录 — 门扉 + 外向箭头 */
export function JzLogoutIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M11.5 4H6.5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5" fill={ICON_FILL} />
      <path d="M11.5 4H6.5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5" />
      <path d="M13.5 12H20" />
      <path d="M17.2 9.2L20 12l-2.8 2.8" />
      <circle cx="9" cy="12" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/* ═══════════════ 通用导出 ═══════════════ */
export const JZ_ICONS = {
  kb: JzKbIcon,
  graph: JzGraphIcon,
  export: JzExportIcon,
  ai: JzAiIcon,
  users: JzUsersIcon,
  architecture: JzArchitectureIcon,
  blog: JzBlogIcon,
  archive: JzArchiveIcon,
  tags: JzTagsIcon,
  rss: JzRssIcon,
  admin: JzAdminIcon,
  space: JzSpaceIcon,
  search: JzSearchIcon,
  overview: JzOverviewIcon,
  model: JzModelIcon,
  usage: JzUsageIcon,
  settings: JzSettingsIcon,
  outline: JzOutlineIcon,
  backlink: JzBacklinkIcon,
  comment: JzCommentIcon,
  attachment: JzAttachmentIcon,
  fullscreen: JzFullscreenIcon,
  compress: JzCompressIcon,
  quote: JzQuoteIcon,
  dashboard: JzDashboardIcon,
  trash: JzTrashIcon,
  profile: JzProfileIcon,
  folder: JzFolderIcon,
  folderOpen: JzFolderOpenIcon,
  doc: JzDocIcon,
  sun: JzSunIcon,
  moon: JzMoonIcon,
  starrySky: JzStarrySkyIcon,
  deepsea: JzDeepseaIcon,
  star: JzStarIcon,
  logout: JzLogoutIcon,
  clock: JzClockIcon,
  home: JzHomeIcon,
} as const;

export type JzIconName = keyof typeof JZ_ICONS;

export default function JzIcon({ name, ...rest }: { name: JzIconName } & IconProps) {
  const Comp = JZ_ICONS[name];
  return <Comp {...rest} />;
}
