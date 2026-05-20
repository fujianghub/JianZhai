/**
 * JianZhai 自制图标库 — 双色调古风极简。
 *
 * 设计原则：
 *   - 24×24 viewBox；主线 1.5px stroke + `currentColor`（跟随父级 color，4 主题通吃）
 *   - 每个图标有一个"印泥色"小点（朱砂/翡翠/暗金/青蓝/紫/橙），给单调线稿一个性
 *   - 印泥色用 inline 颜色变量 `--jz-icon-accent`，可被外层 CSS 覆盖（如选中态变朱砂）
 *   - linecap / linejoin: round（柔软感）
 *
 * 颜色作用：
 *   - 默认状态：彩点是"专属色"，主线 currentColor
 *   - hover：容器变 accent 色，彩点保留专属色（对比鲜明）
 *   - 选中 (.is-active)：彩点跟随主线变 accent 色（统一发光）
 *
 * 用法：<JzKbIcon />     —— 默认双色
 *      <JzKbIcon tone="#10b981" />  —— 覆盖彩点色
 */
import type { CSSProperties, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  /** 覆盖默认的"印泥色"。不传时各图标使用自己的专属色。 */
  tone?: string;
};

const baseProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Wrap({
  size = '1em',
  tone,
  children,
  style,
  ...rest
}: IconProps & { children: React.ReactNode }) {
  const mergedStyle: CSSProperties = {
    ...style,
    // 当容器把 --jz-icon-accent-active 设了（如选中态），优先使用它；
    // 否则用 tone prop；最后落到 CSS 变量默认值
    ['--jz-icon-tone' as string]: tone,
  };
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      style={mergedStyle}
      {...baseProps}
      {...rest}
    >
      {children}
    </svg>
  );
}

/** 取得"印泥色"——优先用 selected 态注入的色，否则用每个图标的专属色。 */
const ACCENT = 'var(--jz-icon-accent-active, var(--jz-icon-tone, #b94a3b))';
const ACCENT_JADE = 'var(--jz-icon-accent-active, var(--jz-icon-tone, #10b981))';
const ACCENT_GOLD = 'var(--jz-icon-accent-active, var(--jz-icon-tone, #d97706))';
const ACCENT_BLUE = 'var(--jz-icon-accent-active, var(--jz-icon-tone, #5b8def))';
const ACCENT_ORANGE = 'var(--jz-icon-accent-active, var(--jz-icon-tone, #fb923c))';
const ACCENT_VIOLET = 'var(--jz-icon-accent-active, var(--jz-icon-tone, #a78bfa))';
const ACCENT_CYAN = 'var(--jz-icon-accent-active, var(--jz-icon-tone, #06b6d4))';

/* ═══════════════ 后台菜单 ═══════════════ */

/** 线装书 — 知识库（朱砂） */
export function JzKbIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M5 4h12a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5z" />
      <line x1="7" y1="7" x2="7" y2="18" />
      {/* 朱砂装订点 */}
      <circle cx="7" cy="9" r="0.7" fill={ACCENT} stroke="none" />
      <circle cx="7" cy="12" r="0.7" fill={ACCENT} stroke="none" />
      <circle cx="7" cy="15" r="0.7" fill={ACCENT} stroke="none" />
      {/* 书名签 */}
      <rect x="11" y="6.5" width="4.5" height="6" rx="0.5" />
      <line x1="12.5" y1="9" x2="14" y2="9" opacity="0.7" />
    </Wrap>
  );
}

/** 节点网络 — 知识图谱（青蓝） */
export function JzGraphIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <line x1="6.5" y1="7" x2="12" y2="12" />
      <line x1="17.5" y1="7" x2="12" y2="12" />
      <line x1="12" y1="12" x2="12" y2="18.5" />
      <line x1="6.5" y1="7" x2="17.5" y2="7" strokeDasharray="2 2" />
      <circle cx="6.5" cy="7" r="2" />
      <circle cx="17.5" cy="7" r="2" />
      {/* 中心节点：青蓝填充 */}
      <circle cx="12" cy="12" r="2.2" fill={ACCENT_BLUE} stroke="none" />
      <circle cx="12" cy="18.5" r="2" />
    </Wrap>
  );
}

/** 卷轴流出 — 导出（暖橙） */
export function JzExportIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <rect x="4" y="6" width="10" height="12" rx="1" />
      <line x1="6.5" y1="9" x2="11.5" y2="9" />
      <line x1="6.5" y1="12" x2="11.5" y2="12" />
      <line x1="6.5" y1="15" x2="9.5" y2="15" />
      {/* 流出箭头 + 暖橙箭头头 */}
      <line x1="14" y1="12" x2="20" y2="12" />
      <path
        d="M17.5,9.5 L20,12 L17.5,14.5 Z"
        fill={ACCENT_ORANGE}
        stroke={ACCENT_ORANGE}
      />
    </Wrap>
  );
}

/** 印章 + ✦ — AI 助手（翡翠） */
export function JzAiIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M12 7.5 L12 16.5 M7.5 12 L16.5 12 M9 9 L15 15 M15 9 L9 15" opacity="0.7" />
      {/* 翡翠中心 */}
      <circle cx="12" cy="12" r="2" fill={ACCENT_JADE} stroke="none" />
    </Wrap>
  );
}

/** 多人剪影 — 用户（紫罗兰） */
export function JzUsersIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <circle cx="9" cy="8" r="2.6" />
      <path d="M3.5 19c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" />
      <circle cx="17" cy="8" r="2" fill={ACCENT_VIOLET} stroke="none" />
      <path d="M15.5 14.5c2.5 0 5 2 5 4.5" />
    </Wrap>
  );
}

/** 古塔 — 架构总览（暗金） */
export function JzArchitectureIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <line x1="12" y1="3" x2="12" y2="5" />
      {/* 顶端朱砂点（塔尖） */}
      <circle cx="12" cy="3.3" r="0.7" fill={ACCENT_GOLD} stroke="none" />
      <path d="M8.5 5 L15.5 5 L14 7 L10 7 Z" />
      <path d="M7.5 9 L16.5 9 L15 11 L9 11 Z" />
      <path d="M6 13 L18 13 L16.5 15 L7.5 15 Z" />
      <rect x="6.5" y="15" width="11" height="5" rx="0.5" />
      <path d="M11 20 L11 17 Q12 16 13 17 L13 20" fill={ACCENT_GOLD} fillOpacity="0.25" />
    </Wrap>
  );
}

/** 经纬球 — 查看博客（青） */
export function JzBlogIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <ellipse cx="12" cy="12" rx="3.5" ry="8.5" />
      <line x1="3.5" y1="12" x2="20.5" y2="12" />
      <path d="M4.5 8 Q12 6.5 19.5 8" />
      <path d="M4.5 16 Q12 17.5 19.5 16" />
      {/* 大陆点：青色 */}
      <circle cx="9" cy="9.5" r="0.8" fill={ACCENT_CYAN} stroke="none" />
    </Wrap>
  );
}

/* ═══════════════ 博客导航 ═══════════════ */

/** 双层卷轴 — 归档（暗金） */
export function JzArchiveIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <rect x="3.5" y="4" width="17" height="4" rx="0.5" fill={ACCENT_GOLD} fillOpacity="0.18" />
      <line x1="6.5" y1="6" x2="17.5" y2="6" />
      <rect x="5" y="8" width="14" height="12" rx="0.5" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="16" x2="13" y2="16" />
      <circle cx="7.5" cy="6" r="0.6" fill={ACCENT_GOLD} stroke="none" />
    </Wrap>
  );
}

/** 标签牌 — 标签（朱砂） */
export function JzTagsIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path
        d="M3.5 4.5 L11.5 4.5 L20 13 L13 20 L4.5 11.5 Z"
        fill={ACCENT}
        fillOpacity="0.12"
      />
      <circle cx="7.5" cy="8.5" r="1.4" fill={ACCENT} stroke="none" />
    </Wrap>
  );
}

/** 信号波 — RSS（暖橙） */
export function JzRssIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <circle cx="6.5" cy="17.5" r="1.5" fill={ACCENT_ORANGE} stroke="none" />
      <path d="M4.5 11 Q9 11 13 15 Q13 17.5 13 17.5" />
      <path d="M4.5 5.5 Q12 5.5 18.5 12 Q18.5 17.5 18.5 17.5" />
    </Wrap>
  );
}

/** 印章 + 钥匙 — 后台（朱砂） */
export function JzAdminIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <rect x="4" y="4" width="9" height="9" rx="1" fill={ACCENT} fillOpacity="0.15" />
      <circle cx="8.5" cy="8.5" r="1.5" fill={ACCENT} stroke="none" />
      <line x1="13" y1="13" x2="20" y2="20" />
      <circle cx="18.5" cy="18.5" r="1.5" />
    </Wrap>
  );
}

/** 放大镜 — 搜索（保持中性，hover 时变 accent） */
export function JzSearchIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <circle cx="10.5" cy="10.5" r="6" />
      <line x1="15" y1="15" x2="20" y2="20" />
      {/* 镜面反射点 */}
      <circle cx="8.5" cy="9" r="0.6" fill="currentColor" stroke="none" opacity="0.5" />
    </Wrap>
  );
}

/* ═══════════════ AI 管理 Tab ═══════════════ */

/** 罗盘 — 概览（翡翠针 + 朱砂指北） */
export function JzOverviewIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="1" fill={ACCENT_JADE} stroke="none" />
      <path d="M12 6 L13.5 12 L12 13 L10.5 12 Z" fill={ACCENT} stroke="none" />
      <path d="M12 13 L10.5 12 L12 18 L13.5 12 Z" />
      <line x1="12" y1="3" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="21" />
      <line x1="3" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="21" y2="12" />
    </Wrap>
  );
}

/** 等距立方 — 模型（翡翠面） */
export function JzModelIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M12 3 L20 7.5 L20 16.5 L12 21 L4 16.5 L4 7.5 Z" />
      {/* 翡翠光面 */}
      <path
        d="M12 3 L20 7.5 L12 12 Z"
        fill={ACCENT_JADE}
        fillOpacity="0.2"
      />
      <path d="M12 3 L12 12 M12 12 L4 7.5 M12 12 L20 7.5 M12 12 L12 21" />
    </Wrap>
  );
}

/** 柱状统计 — 用量（翡翠主柱） */
export function JzUsageIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <line x1="3.5" y1="20" x2="20.5" y2="20" />
      <rect x="6" y="13" width="2.5" height="7" rx="0.4" />
      <rect
        x="11"
        y="8"
        width="2.5"
        height="12"
        rx="0.4"
        fill={ACCENT_JADE}
        stroke="none"
      />
      <rect x="16" y="11" width="2.5" height="9" rx="0.4" />
    </Wrap>
  );
}

/** 齿轮 — 设置（翡翠中心） */
export function JzSettingsIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <circle cx="12" cy="12" r="3" fill={ACCENT_JADE} fillOpacity="0.18" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5 L12 4.5 M12 19.5 L12 21.5 M21.5 12 L19.5 12 M4.5 12 L2.5 12
               M18.7 5.3 L17.3 6.7 M6.7 17.3 L5.3 18.7 M18.7 18.7 L17.3 17.3 M6.7 6.7 L5.3 5.3" />
    </Wrap>
  );
}

/* ═══════════════ 编辑器侧栏 Tab ═══════════════ */

/** 层级大纲 — 大纲（朱砂项目符号） */
export function JzOutlineIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="8" y1="10" x2="20" y2="10" />
      <line x1="8" y1="14" x2="20" y2="14" />
      <line x1="12" y1="18" x2="20" y2="18" />
      <circle cx="5" cy="10" r="0.9" fill={ACCENT} stroke="none" />
      <circle cx="5" cy="14" r="0.9" fill={ACCENT} stroke="none" />
      <circle cx="9" cy="18" r="0.9" fill={ACCENT} stroke="none" />
    </Wrap>
  );
}

/** 双向链接 — 反链（青蓝节点） */
export function JzBacklinkIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <circle cx="6" cy="6" r="2.5" fill={ACCENT_BLUE} fillOpacity="0.25" />
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" fill={ACCENT_BLUE} fillOpacity="0.25" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8 8 L16 16" />
      <polyline points="9.5,7 7.5,7 7.5,9" />
      <polyline points="14.5,17 16.5,17 16.5,15" />
    </Wrap>
  );
}

/** 对话气泡 — 评论（暖橙气泡 + 朱砂三点） */
export function JzCommentIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path
        d="M4 6 a2 2 0 0 1 2-2 h12 a2 2 0 0 1 2 2 v9 a2 2 0 0 1-2 2 H10 L6 21 V17 H6 a2 2 0 0 1-2-2 Z"
        fill={ACCENT_ORANGE}
        fillOpacity="0.12"
      />
      <circle cx="9" cy="10.5" r="0.9" fill={ACCENT} stroke="none" />
      <circle cx="12" cy="10.5" r="0.9" fill={ACCENT} stroke="none" />
      <circle cx="15" cy="10.5" r="0.9" fill={ACCENT} stroke="none" />
    </Wrap>
  );
}

/** 回形针 — 附件（暗金） */
export function JzAttachmentIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path
        d="M18 8.5 L10 16.5 a3 3 0 0 1-4.2-4.2 L13.5 4.6 a4.5 4.5 0 0 1 6.4 6.4 L11 19.6 a6 6 0 0 1-8.5-8.5 L9 4.5"
        stroke={ACCENT_GOLD}
      />
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
