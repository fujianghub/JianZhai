/**
 * 目录（TOC）展示偏好 — one shape shared by the article right rail (MD /
 * Docx / PDF), the KB directory tree and the EPUB sidebar's 目录 tab.
 *
 * Two layers:
 *   1. site defaults — served by ``/api/v1/public/toc-settings/`` and managed
 *      from ``/admin/toc`` (``stores/tocSettings.ts`` holds them);
 *   2. per-device overrides — ``jz-toc-prefs:v2:<scope>`` in localStorage,
 *      holding ONLY the keys the reader explicitly changed. Merging is
 *      ``{...siteDefaults, ...overrides}``, so changing a site default later
 *      still reaches every reader who never touched that key (the
 *      frozen-default trap, see CLAUDE.md). Never write on mount.
 *
 * Key names, choices and defaults mirror ``backend/apps/accounts/models.py``
 * (``TOC_PREF_CHOICES`` / ``DEFAULT_TOC_PREFS``) — change both together.
 */
import {
  FONT_STACK_MASHAN_READER,
  FONT_STACK_NOTO_SANS_READER,
  FONT_STACK_XIAOWEI_READER,
} from './fontStacks';

export type TocDensity = 'compact' | 'normal' | 'loose';
export type TocSize = 's' | 'm' | 'l';
export type TocFont = 'ui' | 'serif' | 'kai' | 'wenkai' | 'sans' | 'xiaowei' | 'brush' | 'mono' | 'reader';
export type TocColor = 'text' | 'muted' | 'layered';
/** Weight scale for the level hierarchy: light (500/400/400), normal (600/500/400), bold (700/600/500). */
export type TocWeight = 'light' | 'normal' | 'bold';
/** Heading depth shown in article TOCs; 6 = every level. */
export type TocDepth = 2 | 3 | 4 | 6;

export interface TocPrefs {
  density: TocDensity;
  size: TocSize;
  font: TocFont;
  color: TocColor;
  weight: TocWeight;
  depth: TocDepth;
  /** Wrap long titles (default: single line + ellipsis). */
  wrap: boolean;
  /** KB tree: doc-count badges on folder rows. */
  counts: boolean;
  /** Article TOC: show the chapter numbering prefix. */
  numbers: boolean;
}

export const DEFAULT_TOC_PREFS: TocPrefs = {
  density: 'normal',
  size: 'm',
  font: 'ui',
  color: 'text',
  weight: 'normal',
  depth: 6,
  wrap: false,
  counts: true,
  numbers: true,
};

export const TOC_DENSITIES: TocDensity[] = ['compact', 'normal', 'loose'];
export const TOC_SIZES: TocSize[] = ['s', 'm', 'l'];
export const TOC_COLORS: TocColor[] = ['text', 'muted', 'layered'];
export const TOC_WEIGHTS: TocWeight[] = ['light', 'normal', 'bold'];
export const TOC_DEPTHS: TocDepth[] = [2, 3, 4, 6];

export interface TocFontOption {
  key: TocFont;
  label: string;
  title: string;
  /** CSS ``font-family`` value — token references where one exists, else the
   * reader-preset stack from ``fontStacks.ts`` (never a hand-written stack). */
  family: string;
}

/** ``reader`` follows the article body font (``--jz-article-font`` is set by
 * PostDetail; the EPUB reader passes its own stack). */
export const TOC_FONT_OPTIONS: TocFontOption[] = [
  { key: 'ui', label: '界面', title: '站内界面字体', family: 'var(--jz-font-ui)' },
  { key: 'serif', label: '宋体', title: '思源宋体 / 衬线', family: 'var(--jz-font-serif)' },
  { key: 'kai', label: '楷体', title: '楷体 · 手书', family: 'var(--jz-font-kai)' },
  { key: 'wenkai', label: '文楷', title: '霞鹜文楷 · 屏显', family: 'var(--jz-font-display)' },
  { key: 'sans', label: '思源黑', title: '思源黑体 · 现代', family: FONT_STACK_NOTO_SANS_READER },
  { key: 'xiaowei', label: '小薇', title: '站酷小薇 · 秀丽', family: FONT_STACK_XIAOWEI_READER },
  { key: 'brush', label: '书法', title: '马善政毛笔书法', family: FONT_STACK_MASHAN_READER },
  { key: 'mono', label: '等宽', title: 'JetBrains Mono', family: 'var(--jz-font-mono)' },
  { key: 'reader', label: '正文', title: '跟随正文字体', family: 'var(--jz-article-font, var(--jz-font-serif))' },
];
const FONT_KEYS = new Set<string>(TOC_FONT_OPTIONS.map((o) => o.key));

/** Resolved ``font-family`` for a pref key; ``readerStack`` overrides the
 * ``reader`` entry where the body font is known as a stack (EPUB). */
export function tocFontFamily(font: TocFont, readerStack?: string): string {
  if (font === 'reader' && readerStack) return readerStack;
  return TOC_FONT_OPTIONS.find((o) => o.key === font)?.family ?? 'var(--jz-font-ui)';
}

/** Only the valid keys of ``raw`` (unknown / out-of-range dropped) — the shape
 * stored as a local override blob. */
export function pickTocOverrides(raw: unknown): Partial<TocPrefs> {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Partial<TocPrefs> = {};
  if (TOC_DENSITIES.includes(o.density as TocDensity)) out.density = o.density as TocDensity;
  if (TOC_SIZES.includes(o.size as TocSize)) out.size = o.size as TocSize;
  if (typeof o.font === 'string' && FONT_KEYS.has(o.font)) out.font = o.font as TocFont;
  if (TOC_COLORS.includes(o.color as TocColor)) out.color = o.color as TocColor;
  if (TOC_WEIGHTS.includes(o.weight as TocWeight)) out.weight = o.weight as TocWeight;
  const depth = Number(o.depth);
  if (TOC_DEPTHS.includes(depth as TocDepth)) out.depth = depth as TocDepth;
  if (typeof o.wrap === 'boolean') out.wrap = o.wrap;
  if (typeof o.counts === 'boolean') out.counts = o.counts;
  if (typeof o.numbers === 'boolean') out.numbers = o.numbers;
  return out;
}

/** Full, valid prefs: ``base`` (site defaults) patched by the valid keys of ``raw``. */
export function repairTocPrefs(raw: unknown, base: TocPrefs = DEFAULT_TOC_PREFS): TocPrefs {
  return { ...base, ...pickTocOverrides(raw) };
}

/** Which surface the overrides belong to — each keeps its own blob. */
export type TocScope = 'article' | 'kb';

const keyFor = (scope: TocScope) => `jz-toc-prefs:v2:${scope}`;

export function loadTocOverrides(scope: TocScope): Partial<TocPrefs> {
  try {
    const raw = localStorage.getItem(keyFor(scope));
    return raw ? pickTocOverrides(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

/** Written only on explicit changes; an empty object clears the blob. */
export function saveTocOverrides(scope: TocScope, overrides: Partial<TocPrefs>): void {
  try {
    if (Object.keys(overrides).length === 0) localStorage.removeItem(keyFor(scope));
    else localStorage.setItem(keyFor(scope), JSON.stringify(overrides));
  } catch {
    /* storage unavailable — best effort */
  }
}

/** Heading level → 1-based rail level, after normalising to the shallowest
 * heading present (an article that starts at h2 still renders as level 1). */
export function relativeTocLevel(level: number, minLevel: number): number {
  return Math.max(1, Math.min(4, level - minLevel + 1));
}
