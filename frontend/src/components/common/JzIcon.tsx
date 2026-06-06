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
import {
  JzAiIcon,
  JzArchitectureIcon,
  JzArchiveBoxIcon,
  JzDashboardIcon,
  JzExportIcon,
  JzGraphIcon,
  JzKbIcon,
  JzProfileIcon,
  JzTagIcon,
  JzTrashIcon,
  JzUserGroupIcon,
} from './JzIconKit';

/* 用户自选设计稿系列（/icon）经 JzIconKit 接入，这里转一手保持旧引用路径 */
export {
  JzAiIcon,
  JzArchitectureIcon,
  JzArchiveBoxIcon,
  JzDashboardIcon,
  JzExportIcon,
  JzGraphIcon,
  JzKbIcon,
  JzProfileIcon,
  JzTagIcon,
  JzTrashIcon,
  JzUserGroupIcon,
};

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
  /* 双引号（市场标准 quote 形，SF 分层）：首引实心 + 次引次层填充 */
  return (
    <Wrap {...p}>
      <path
        d="M11 7.2C7.9 8.3 6 10.7 6 13.6c0 2.1 1.4 3.6 3.3 3.6 1.7 0 3-1.2 3-2.9 0-1.6-1.2-2.8-2.8-2.8h-.5c.3-1.4 1.3-2.5 2.8-3.2z"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M19 7.2c-3.1 1.1-5 3.5-5 6.4 0 2.1 1.4 3.6 3.3 3.6 1.7 0 3-1.2 3-2.9 0-1.6-1.2-2.8-2.8-2.8H17c.3-1.4 1.3-2.5 2.8-3.2z"
        fill="currentColor"
        opacity={HIER_OPACITY}
        stroke="none"
      />
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

/** 架构总览 */

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

/** 后台入口 */

/** 个人空间（人形 + 册页） */

/** 搜索 — 放大镜（纯线稿：镜片无填充 + 粗握柄，2026-06-06 去实心） */
export function JzSearchIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15.2 15.2 19.4 19.4" strokeWidth={1.3} />
    </Wrap>
  );
}

/* ── SF Symbols 分层渲染系列（2026-06-06 定稿基准）──
   单色双层：主层 = currentColor 全色（描边/实心点睛），
   次层 = currentColor 透明填充（HIER_OPACITY）。
   次层随槽位状态梯度（35%→70%→100%）自动同步明暗。
   准则：≤5 元素、剪影优先、最小特征 ≥2.5px、几何圆润留白大。 */
const HIER_OPACITY = 0.28;


/** RSS — 同心波（纯线稿：双弧 + 空心源点，2026-06-06 去填充） */
export function JzRssIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <circle cx="6.3" cy="17.7" r="1.6" />
      <path d="M4.5 11.4a8.1 8.1 0 0 1 8.1 8.1" />
      <path d="M4.5 5.3a14.2 14.2 0 0 1 14.2 14.2" />
    </Wrap>
  );
}

/** 用户 — 头肩人形（SF 分层：头与肩双层填充） */
export function JzUserIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <circle cx="12" cy="8.3" r="3.5" fill="currentColor" fillOpacity={0.28} />
      <path
        d="M5 19.6a7 7 0 0 1 14 0z"
        fill="currentColor"
        fillOpacity={0.28}
      />
    </Wrap>
  );
}





/** 单册书 — 文章所属知识库（meta 行小尺寸用）：书皮填充 + 粗书脊 */
export function JzBookIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <rect x="5" y="4.5" width="14" height="15" rx="1.6" fill="currentColor" fillOpacity={0.28} />
      <path d="M8.6 4.5v15" strokeWidth={2} />
    </Wrap>
  );
}

/** 时钟 — 发布时间：表盘填充 + 粗指针 */
export function JzClockIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <circle cx="12" cy="12" r="8" fill="currentColor" fillOpacity={0.28} />
      <path d="M12 7.6V12l3 2.2" strokeWidth={2} />
    </Wrap>
  );
}

/** 房子 — 首页（市场标准 house 形）：屋体填充 + 门 */
export function JzHomeIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path
        d="M4.5 10.4 12 4.2l7.5 6.2v8.2a1.8 1.8 0 0 1-1.8 1.8H6.3a1.8 1.8 0 0 1-1.8-1.8z"
        fill="currentColor"
        fillOpacity={0.28}
      />
      <path d="M9.8 20.2v-4.4a2.2 2.2 0 0 1 4.4 0v4.4" />
    </Wrap>
  );
}

/** 铅笔 — 编辑（市场标准 pencil 形）：笔身填充 + 笔箍线 */
export function JzEditIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path
        d="M14.2 5.8l4 4L8.6 19.4 4 20l.6-4.6z"
        fill="currentColor"
        fillOpacity={0.28}
      />
      <path d="M12.4 7.6l4 4" />
    </Wrap>
  );
}

/** 撰写 — 完整编辑（市场标准 square.and.pencil 形）：开口方框 + 笔身填充 */
export function JzComposeIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M11 5H6.8a2.3 2.3 0 0 0-2.3 2.3v9.9a2.3 2.3 0 0 0 2.3 2.3h9.9a2.3 2.3 0 0 0 2.3-2.3V13" />
      <path
        d="M17.6 4.7l1.7 1.7-7.2 7.2-2.3.6.6-2.3z"
        fill="currentColor"
        fillOpacity={0.28}
      />
    </Wrap>
  );
}

/** 打开的文件夹 — 文档列表（市场标准 folder.open 形）：前翻盖填充 */
export function JzFolderOpenIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M4 16.5V6.8A1.8 1.8 0 0 1 5.8 5h3.3l1.9 2h6.2A1.8 1.8 0 0 1 19 8.8v1.4" />
      <path
        d="M6.9 10.2h12.6a1.3 1.3 0 0 1 1.25 1.7l-1.8 5.4a2 2 0 0 1-1.9 1.4H5.9A1.9 1.9 0 0 1 4 16.8l1-5.1a1.9 1.9 0 0 1 1.9-1.5z"
        fill="currentColor"
        fillOpacity={0.28}
      />
    </Wrap>
  );
}

/** 汉堡菜单 — 三横线 */
export function JzMenuIcon(p: IconProps) {
  return (
    <Wrap {...p}>
      <path d="M4.5 7h15M4.5 12h15M4.5 17h15" strokeWidth={2} />
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
  /* 列表/大纲（市场标准 list.bullet 形，SF 分层）：实心圆点 + 文本线 */
  return (
    <Wrap {...p}>
      <circle cx="5.6" cy="7" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="5.6" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="5.6" cy="17" r="1.3" fill="currentColor" stroke="none" />
      <path d="M9.6 7h9M9.6 12h9M9.6 17h6" strokeWidth={1.8} />
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

/* ═══════════════ 通用导出 ═══════════════ */
export const JZ_ICONS = {
  kb: JzKbIcon,
  graph: JzGraphIcon,
  export: JzExportIcon,
  ai: JzAiIcon,
  architecture: JzArchitectureIcon,
  blog: JzBlogIcon,
  tags: JzTagsIcon,
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
} as const;

export type JzIconName = keyof typeof JZ_ICONS;

export default function JzIcon({ name, ...rest }: { name: JzIconName } & IconProps) {
  const Comp = JZ_ICONS[name];
  return <Comp {...rest} />;
}
