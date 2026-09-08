/**
 * 目录（TOC）展示偏好 — one shape shared by three surfaces ("scopes"):
 *
 *   - ``kblist``  the blog rail's 大类 / 知识库 list (``BlogKbNavPanel``)
 *   - ``kb``      a knowledge base's document tree (``PublicKbFolderTree``)
 *   - ``article`` an article's heading outline (``TocPanel`` MD / Docx,
 *                 ``PdfTocPanel``)
 *
 * Two layers per scope:
 *   1. site defaults — served by ``/api/v1/public/toc-settings/`` as
 *      ``{scope: prefs}`` and managed from ``/admin/toc`` (``stores/tocSettings.ts``);
 *   2. per-device overrides — ``jz-toc-prefs:v2:<scope>`` in localStorage,
 *      holding ONLY the keys the reader explicitly changed. Merging is
 *      ``{...siteDefaults[scope], ...overrides}``, so changing a site default
 *      later still reaches every reader who never touched that key (the
 *      frozen-default trap, see CLAUDE.md). Never write on mount.
 *
 * Key names, choices and defaults mirror ``backend/apps/accounts/models.py``
 * (``TOC_SCOPES`` / ``TOC_PREF_CHOICES`` / ``DEFAULT_TOC_PREFS``) — change
 * both together.
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
  /** KB tree / KB list: doc-count badges. */
  counts: boolean;
  /** Article TOC: show the chapter numbering prefix. */
  numbers: boolean;
  /** KB list: group knowledge bases under their 大类. */
  grouped: boolean;
}

/** Factory defaults (2026-09-08): 紧凑 / 中 / 细 / 宋体 / 淡显 for every scope. */
export const DEFAULT_TOC_PREFS: TocPrefs = {
  density: 'compact',
  size: 'm',
  font: 'serif',
  color: 'muted',
  weight: 'light',
  depth: 6,
  wrap: false,
  counts: true,
  numbers: true,
  grouped: true,
};

export const TOC_DENSITIES: TocDensity[] = ['compact', 'normal', 'loose'];
export const TOC_SIZES: TocSize[] = ['s', 'm', 'l'];
export const TOC_COLORS: TocColor[] = ['text', 'muted', 'layered'];
export const TOC_WEIGHTS: TocWeight[] = ['light', 'normal', 'bold'];
export const TOC_DEPTHS: TocDepth[] = [2, 3, 4, 6];

/* ── Scopes ────────────────────────────────────────────────────────────── */

/** Which surface a prefs blob belongs to — each keeps its own site default
 * and its own local override blob. Order = admin page order. */
export type TocScope = 'kblist' | 'kb' | 'article';
export const TOC_SCOPES: TocScope[] = ['kblist', 'kb', 'article'];

export type TocSiteDefaults = Record<TocScope, TocPrefs>;

export const DEFAULT_TOC_SITE: TocSiteDefaults = {
  kblist: { ...DEFAULT_TOC_PREFS },
  kb: { ...DEFAULT_TOC_PREFS },
  article: { ...DEFAULT_TOC_PREFS },
};

/** Which knobs a scope exposes (rows hidden elsewhere still carry a value;
 * only the surface's CSS / markup decides what is rendered). */
export interface TocScopeFeatures {
  /** Article: heading depth + chapter numbering. */
  depth: boolean;
  numbers: boolean;
  /** KB tree / KB list: count badges. */
  counts: boolean;
  /** KB list: 大类 grouping. */
  grouped: boolean;
  /** Whether the 「分层」 colour scheme makes sense (needs ≥2 levels). */
  colorLayered: boolean;
}

export interface TocScopeMeta {
  /** Admin tab label. */
  label: string;
  /** Short name used in tooltips / chips. */
  short: string;
  /** One-line description for the admin tab. */
  hint: string;
  /** Where it applies (admin header chips). */
  chips: string[];
  features: TocScopeFeatures;
}

export const TOC_SCOPE_META: Record<TocScope, TocScopeMeta> = {
  kblist: {
    label: '大类知识库目录',
    short: '知识库列表',
    hint: '博客左栏按大类分组的知识库列表',
    chips: ['文章页左栏「知识库」', '知识库页左栏「知识库」'],
    features: { depth: false, numbers: false, counts: true, grouped: true, colorLayered: false },
  },
  kb: {
    label: '知识库文档目录',
    short: '文档目录树',
    hint: '一个知识库内的文件夹 / 文档树',
    chips: ['知识库页目录树', '文章页左栏「目录」'],
    features: { depth: false, numbers: false, counts: true, grouped: false, colorLayered: true },
  },
  article: {
    label: '文档内容目录',
    short: '文章目录',
    hint: '一篇文档的标题大纲（右侧目录）',
    chips: ['文章页右侧目录', 'Word 导入文档', 'PDF 书签'],
    features: { depth: true, numbers: true, counts: false, grouped: false, colorLayered: true },
  },
};

export const isTocScope = (v: unknown): v is TocScope => typeof v === 'string' && (TOC_SCOPES as string[]).includes(v);

/* ── Fonts ─────────────────────────────────────────────────────────────── */

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

/* ── Repair ────────────────────────────────────────────────────────────── */

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
  if (typeof o.grouped === 'boolean') out.grouped = o.grouped;
  return out;
}

/** Full, valid prefs: ``base`` (site defaults) patched by the valid keys of ``raw``. */
export function repairTocPrefs(raw: unknown, base: TocPrefs = DEFAULT_TOC_PREFS): TocPrefs {
  return { ...base, ...pickTocOverrides(raw) };
}

/** Pre-``accounts 0010`` servers sent ONE flat prefs dict for every surface. */
export function isLegacyFlatToc(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return Object.keys(o).length > 0 && !TOC_SCOPES.some((s) => s in o);
}

/** Full ``{scope: prefs}`` from whatever the server sent (a legacy flat blob
 * is spread to every scope). Mirrors the backend ``repair_toc_site``. */
export function repairTocSite(raw: unknown): TocSiteDefaults {
  if (isLegacyFlatToc(raw)) {
    const flat = repairTocPrefs(raw);
    return { kblist: { ...flat }, kb: { ...flat }, article: { ...flat } };
  }
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    kblist: repairTocPrefs(o.kblist),
    kb: repairTocPrefs(o.kb),
    article: repairTocPrefs(o.article),
  };
}

/* ── Local overrides ───────────────────────────────────────────────────── */

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
