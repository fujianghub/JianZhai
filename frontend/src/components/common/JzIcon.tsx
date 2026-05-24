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
} as const;

export type JzIconName = keyof typeof JZ_ICONS;

export default function JzIcon({ name, ...rest }: { name: JzIconName } & IconProps) {
  const Comp = JZ_ICONS[name];
  return <Comp {...rest} />;
}
