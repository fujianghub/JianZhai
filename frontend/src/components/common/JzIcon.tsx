/**
 * JianZhai 自制图标库 — 主题双色（柔和线稿 + accent 浅填色）。
 *
 * 颜色全部由 CSS 变量驱动（定义于 .jz-glass）：
 *   --jz-icon-fill / --jz-icon-fill-strong / --jz-icon-spot
 * 描边用 currentColor，由父级槽位控制默认/hover/选中色。
 *
 * 图形：24×24，stroke 1.5，每图标 ≤1 浅填色 + ≤1 点缀。
 */
import type { CSSProperties, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  /** 覆盖 --jz-icon-spot（少用；一般跟主题走） */
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
const ICON_SPOT = 'var(--jz-icon-spot, var(--jz-icon-tone, var(--jz-accent)))';

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
    ['--jz-icon-tone' as string]: tone,
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

/** 线装书 — 知识库 */
export function JzKbIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path
        d="M5 4h13a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"
        fill={ICON_FILL}
      />
      <path d="M5 4h13a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M8 5v14" />
      <circle cx="8" cy="9" r="0.75" fill={ICON_SPOT} stroke="none" />
      <circle cx="8" cy="12" r="0.75" fill={ICON_SPOT} stroke="none" />
      <circle cx="8" cy="15" r="0.75" fill={ICON_SPOT} stroke="none" />
      <line x1="11" y1="9" x2="15" y2="9" opacity="0.55" />
      <line x1="11" y1="12" x2="14" y2="12" opacity="0.4" />
    </Wrap>
  );
}

/** 节点网络 — 知识图谱 */
export function JzGraphIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <circle cx="6.5" cy="7.5" r="2" />
      <circle cx="17.5" cy="7.5" r="2" />
      <circle cx="12" cy="17.5" r="2" />
      <line x1="8" y1="8.5" x2="11" y2="11.5" />
      <line x1="16" y1="8.5" x2="13" y2="11.5" />
      <line x1="12" y1="13" x2="12" y2="15.5" />
      <circle cx="12" cy="12" r="2.2" fill={ICON_FILL_STRONG} stroke="none" />
      <circle cx="12" cy="12" r="0.9" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/** 文档导出 */
export function JzExportIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <rect x="4" y="6" width="10" height="12" rx="1" fill={ICON_FILL} />
      <rect x="4" y="6" width="10" height="12" rx="1" />
      <path d="M6.5 9h5M6.5 12h5M6.5 15h3" strokeLinecap="round" />
      <path d="M15 12h4.5" />
      <path d="M17.2 10.2L19.5 12l-2.3 1.8" fill={ICON_SPOT} stroke={ICON_SPOT} />
    </Wrap>
  );
}

/** AI 助手 */
export function JzAiIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path
        d="M12 4l6.5 3.75v8.5L12 20l-6.5-3.75v-8.5L12 4z"
        fill={ICON_FILL}
      />
      <path d="M12 4l6.5 3.75v8.5L12 20l-6.5-3.75v-8.5L12 4z" />
      <circle cx="12" cy="12" r="2.5" fill={ICON_FILL_STRONG} stroke="none" />
      <circle cx="12" cy="12" r="1" fill={ICON_SPOT} stroke="none" />
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
  return (
    <Wrap {...p}>
      <path d="M7.5 12.5c0-2 1.1-3.6 3-4.5v1.9c-1 .6-1.4 1.3-1.4 2.6h1.6v3.5H7.5v-3.5z" fill={ICON_FILL} />
      <path d="M13.3 12.5c0-2 1.1-3.6 3-4.5v1.9c-1 .6-1.4 1.3-1.4 2.6h1.6v3.5h-3.2v-3.5z" fill={ICON_FILL} />
      <path d="M7.5 12.5c0-2 1.1-3.6 3-4.5v1.9c-1 .6-1.4 1.3-1.4 2.6h1.6v3.5H7.5v-3.5z" />
      <path d="M13.3 12.5c0-2 1.1-3.6 3-4.5v1.9c-1 .6-1.4 1.3-1.4 2.6h1.6v3.5h-3.2v-3.5z" />
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

/** 用户 */
export function JzUsersIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <circle cx="9" cy="8" r="2.8" fill={ICON_FILL} />
      <circle cx="9" cy="8" r="2.8" />
      <path d="M3.5 19c0-2.8 2.5-5 5.5-5s5.5 2.2 5.5 5" />
      <circle cx="17" cy="8.5" r="2.2" />
      <path d="M14.5 14.5c2.2 0 4.5 1.8 4.5 4.5" />
    </Wrap>
  );
}

/** 架构总览 */
export function JzArchitectureIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M8 6h8l-1.5 2H9.5Z" fill={ICON_FILL} />
      <path d="M8 6h8l-1.5 2H9.5Z" />
      <path d="M7 10h10l-1.5 2H8.5Z" fill={ICON_FILL} />
      <path d="M7 10h10l-1.5 2H8.5Z" />
      <path d="M6 14h12l-1.5 2H7.5Z" />
      <rect x="6.5" y="16.5" width="11" height="4.5" rx="0.5" fill={ICON_FILL_STRONG} stroke="none" />
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

/** 归档 */
export function JzArchiveIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <rect x="4" y="4" width="16" height="4.5" rx="0.8" fill={ICON_FILL_STRONG} stroke="none" />
      <rect x="5" y="9.5" width="14" height="10" rx="0.8" fill={ICON_FILL} />
      <rect x="5" y="9.5" width="14" height="10" rx="0.8" />
      <path d="M8.5 13h7M8.5 16h4.5" strokeLinecap="round" />
    </Wrap>
  );
}

/** 标签 */
export function JzTagsIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M4 5h7l9 8.5-7.5 7.5L4 12.5V5z" fill={ICON_FILL} />
      <path d="M4 5h7l9 8.5-7.5 7.5L4 12.5V5z" />
      <circle cx="7.5" cy="8.5" r="1.3" fill={ICON_SPOT} stroke="none" />
    </Wrap>
  );
}

/** RSS */
export function JzRssIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <circle cx="5.5" cy="18.5" r="1.8" fill={ICON_SPOT} stroke="none" />
      <path d="M5.5 12.5A6 6 0 0 1 11.5 18.5" fill="none" />
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

/** 搜索 */
export function JzSearchIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l4.5 4.5" />
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
} as const;

export type JzIconName = keyof typeof JZ_ICONS;

export default function JzIcon({ name, ...rest }: { name: JzIconName } & IconProps) {
  const Comp = JZ_ICONS[name];
  return <Comp {...rest} />;
}
