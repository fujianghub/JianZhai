/**
 * Pure helpers behind the EPUB reader (``components/common/EpubReader.tsx``):
 * TOC flattening, reader preferences, per-book position memory, the user
 * stylesheet injected into every chapter document, and the client-side script
 * scrub. No DOM access here so everything is unit-testable in vitest.
 *
 * Styling model follows Readium CSS: the publisher's stylesheet stays in
 * charge and 简斋 layers a *user* sheet on top — colours always (the chapter
 * must match the site theme), typography only for the knobs the reader has
 * explicitly turned (font family is an opt-in override, never silent).
 */

export interface EpubTocItem {
  label: string;
  href?: string;
  subitems?: EpubTocItem[];
  /** Assigned in place by foliate's ``TOCProgress`` once the book is open;
   * ``relocate`` events report the current chapter by this id. */
  id?: number;
}

export interface EpubTocEntry {
  key: string;
  title: string;
  /** ``null`` for unlinked grouping entries (a Part title with no page). */
  href: string | null;
  /** 1-based nesting depth. */
  level: number;
  /** foliate's TOC item id when known (matches ``relocate.tocItem.id``). */
  id: number | null;
}

/** Flatten foliate's nested TOC into the list shape the sidebar renders. */
export function flattenEpubToc(toc: EpubTocItem[] | undefined | null, maxLevel = 6): EpubTocEntry[] {
  const out: EpubTocEntry[] = [];
  const walk = (items: EpubTocItem[], level: number, prefix: string) => {
    items.forEach((item, i) => {
      const key = prefix ? `${prefix}.${i}` : String(i);
      const title = (item.label ?? '').replace(/\s+/g, ' ').trim() || '（无标题）';
      out.push({ key, title, href: item.href || null, level, id: typeof item.id === 'number' ? item.id : null });
      if (item.subitems?.length && level < maxLevel) walk(item.subitems, level + 1, key);
    });
  };
  walk(toc ?? [], 1, '');
  return out;
}

/**
 * Split a TOC title into its numbering prefix and the text so the sidebar can
 * set the number in tabular, muted type: ``第1章 路由器`` → ``['第1章', '路由器']``,
 * ``1.2.3 拓扑`` → ``['1.2.3', '拓扑']``, ``二、总结`` → ``['二、', '总结']``.
 * Titles without a recognisable prefix come back with an empty ``num``.
 */
export function splitTocTitle(title: string): { num: string; text: string } {
  const t = title.trim();
  const m = t.match(
    /^((?:第\s*[0-9一二三四五六七八九十百零〇两]+\s*[篇章节部卷讲课回])|(?:\d+(?:[.．]\d+)*[.．]?)|(?:[一二三四五六七八九十]+[、.．])|(?:[IVXLC]+[.．])|(?:附录\s*[A-Z一二三四五六七八九十]?)|(?:Chapter\s+\d+)|(?:Part\s+[IVX\d]+))(?:(?<=[、.．:：])|(?=[\s:：、]|$))[\s:：、]*(.*)$/i,
  );
  if (!m || !m[2]) return { num: '', text: t };
  return { num: m[1].trim(), text: m[2].trim() };
}

/** Parent key of a flattened entry (``'2.1.0'`` → ``'2.1'``), ``null`` at the root. */
export function tocParentKey(key: string): string | null {
  const i = key.lastIndexOf('.');
  return i < 0 ? null : key.slice(0, i);
}

/** Every ancestor key of ``key`` (nearest first). */
export function tocAncestorKeys(key: string): string[] {
  const out: string[] = [];
  for (let k = tocParentKey(key); k != null; k = tocParentKey(k)) out.push(k);
  return out;
}

/** Whether entry ``i`` has children (the next entry is nested deeper). */
export function tocHasChildren(entries: EpubTocEntry[], i: number): boolean {
  const next = entries[i + 1];
  return !!next && next.level > entries[i].level;
}

/** Keys expanded by default: every entry shallower than ``depth`` (so the tree
 * shows ``depth`` levels), i.e. depth 2 = level-1 entries expanded. */
export function defaultExpandedTocKeys(entries: EpubTocEntry[], depth = 2): Set<string> {
  const set = new Set<string>();
  entries.forEach((e, i) => {
    if (e.level < depth && tocHasChildren(entries, i)) set.add(e.key);
  });
  return set;
}

/** Entries whose ancestors are all expanded. */
export function visibleTocEntries(entries: EpubTocEntry[], expanded: Set<string>): EpubTocEntry[] {
  return entries.filter((e) => tocAncestorKeys(e.key).every((k) => expanded.has(k)));
}

/**
 * Which TOC entry is "current" for a visible range — the heading at the top
 * of the page (Apple Books semantics). foliate's own ``tocItem`` picks the
 * *last* anchor inside the visible range, so with fine-grained TOCs (several
 * numbered sub-sections per spread) clicking "1.2" highlights "1.3".
 *
 * @param entries      flattened TOC in document order
 * @param sectionOf    per entry: spine index its href resolves to, -1 if none
 * @param index        spine index of the section currently rendered
 * @param compare      ``<0`` anchor is before the range start, ``0`` at it,
 *                     ``>0`` after; ``null`` when the anchor can't be resolved
 * @param fallbackId   foliate's own guess, used when this section has no entries
 */
export function pickActiveTocId(
  entries: EpubTocEntry[],
  sectionOf: number[],
  index: number,
  compare: (entry: EpubTocEntry) => number | null,
  fallbackId: number | null,
): number | null {
  let last: number | null = null;
  let seen = false;
  for (let i = 0; i < entries.length; i++) {
    if (sectionOf[i] !== index) continue;
    seen = true;
    const c = compare(entries[i]);
    if (c == null) continue;
    if (c <= 0) last = entries[i].id;
    else break;
  }
  if (!seen) return fallbackId;
  if (last != null) return last;
  // The page starts above this section's first heading: the chapter is still
  // the last entry of an earlier section (e.g. a Part title spanning files).
  for (let i = entries.length - 1; i >= 0; i--) {
    if (sectionOf[i] >= 0 && sectionOf[i] < index && entries[i].id != null) return entries[i].id;
  }
  return fallbackId;
}

export type EpubFlow = 'paginated' | 'scrolled';

/** Below this reader width a paginated two-column book is cramped; scroll. */
export const PAGINATED_MIN_WIDTH = 720;

export function defaultFlowFor(readerWidth: number): EpubFlow {
  return readerWidth >= PAGINATED_MIN_WIDTH ? 'paginated' : 'scrolled';
}

/**
 * EPUB-only preferences. Body font, font scale and line-height are **not**
 * here: they are the Markdown reader's preferences (``articleFont.ts`` /
 * ``readerLayout.ts``) so a book and an article render identically and one
 * change follows the reader across both.
 */
export interface EpubPrefs {
  /** ``'auto'`` picks by reader width (desktop paginated, narrow scrolled). */
  flow: EpubFlow | 'auto';
  /** Keep the publisher's typefaces instead of the shared reader font. */
  publisherFont: boolean;
  /** First-line indent: the book's own (CJK 2em is conventional) or none
   * (matches the article reader). */
  indent: 'book' | 'none';
  /** Columns in paginated mode: ``'auto'`` = two only when the stage is wide
   * enough for two comfortable measures (technical books with code read
   * badly in narrow spreads), else a fixed 1 or 2. */
  columns: 1 | 2 | 'auto';
  /** Sidebar rail width in px (drag-resizable). */
  railWidth: number;
  /** Justify paragraphs (CJK publishers usually do; readers may prefer ragged). */
  justify: boolean;
  /** Page-turn animation (View Transitions; ``'none'`` = instant). */
  turn: EpubTurn;
  /** Paper colour: ``'theme'`` follows the site theme, else a preset key. */
  paper: EpubPaperKey;
  /** Sidebar TOC presentation. */
  toc: EpubTocPrefs;
}

export interface EpubTocPrefs {
  /** Row spacing. */
  density: 'compact' | 'normal' | 'loose';
  /** Row font size. */
  size: 's' | 'm' | 'l';
  /** Wrap long titles (default: single line, ellipsis). */
  wrap: boolean;
  /** Show the estimated page number of each entry. */
  pages: boolean;
  /** Typeface: site UI face, serif, 楷体, 文楷, or whatever the body text uses. */
  font: 'ui' | 'serif' | 'kai' | 'wenkai' | 'reader';
  /** Colour scheme: uniform body colour, all muted, or layered (Parts and
   * sections muted, chapters full). */
  color: 'text' | 'muted' | 'layered';
}
export const DEFAULT_TOC_PREFS: EpubTocPrefs = { density: 'normal', size: 'm', wrap: false, pages: true, font: 'ui', color: 'text' };
const TOC_FONTS = new Set(['ui', 'serif', 'kai', 'wenkai', 'reader']);
const TOC_COLORS = new Set(['text', 'muted', 'layered']);
export function repairTocPrefs(p: unknown): EpubTocPrefs {
  const o = (p && typeof p === 'object' ? p : {}) as Partial<EpubTocPrefs>;
  return {
    density: o.density === 'compact' || o.density === 'loose' ? o.density : 'normal',
    size: o.size === 's' || o.size === 'l' ? o.size : 'm',
    wrap: o.wrap === true,
    pages: o.pages !== false,
    font: typeof o.font === 'string' && TOC_FONTS.has(o.font) ? o.font : 'ui',
    color: typeof o.color === 'string' && TOC_COLORS.has(o.color) ? o.color : 'text',
  };
}

export type EpubTurn = 'none' | 'slide' | 'cover' | 'fade' | 'vertical' | 'flip';
export const EPUB_TURN_OPTIONS: Array<{ value: EpubTurn; label: string; hint: string }> = [
  { value: 'none', label: '无', hint: '瞬间切换' },
  { value: 'slide', label: '滑动', hint: '旧页左出、新页右入' },
  { value: 'cover', label: '覆盖', hint: '新页带阴影盖过旧页' },
  { value: 'fade', label: '淡入', hint: '交叉溶解' },
  { value: 'flip', label: '仿真', hint: '绕书脊 3D 翻转' },
  { value: 'vertical', label: '上下', hint: '新页自下而上' },
];
const TURN_VALUES = new Set<string>(EPUB_TURN_OPTIONS.map((o) => o.value));

export type EpubPaperKey = 'theme' | 'cream' | 'green' | 'sepia' | 'night';
export interface EpubPaper {
  key: EpubPaperKey;
  label: string;
  /** ``null`` = take colours from the site theme. */
  bg: string | null;
  fg: string | null;
  dark: boolean;
}
export const EPUB_PAPERS: EpubPaper[] = [
  { key: 'theme', label: '跟随主题', bg: null, fg: null, dark: false },
  { key: 'cream', label: '米黄', bg: '#f6efe0', fg: '#2b2620', dark: false },
  { key: 'green', label: '护眼', bg: '#cfe6cf', fg: '#1f2d21', dark: false },
  { key: 'sepia', label: '羊皮纸', bg: '#eee1c6', fg: '#46392a', dark: false },
  { key: 'night', label: '夜墨', bg: '#0f1013', fg: '#c6c8cc', dark: true },
];
export function paperFor(key: string | null | undefined): EpubPaper {
  return EPUB_PAPERS.find((p) => p.key === key) ?? EPUB_PAPERS[0];
}

/** Below this stage width ``columns: 'auto'`` renders a single column. */
export const AUTO_TWO_COLUMN_MIN_WIDTH = 1120;
export const RAIL_WIDTH_MIN = 180;
export const RAIL_WIDTH_MAX = 440;
export const RAIL_WIDTH_DEFAULT = 260;

export function resolveColumns(pref: EpubPrefs['columns'], stageWidth: number): 1 | 2 {
  if (pref === 1 || pref === 2) return pref;
  return stageWidth >= AUTO_TWO_COLUMN_MIN_WIDTH ? 2 : 1;
}

export function clampRailWidth(v: number): number {
  if (!Number.isFinite(v)) return RAIL_WIDTH_DEFAULT;
  return Math.round(Math.min(RAIL_WIDTH_MAX, Math.max(RAIL_WIDTH_MIN, v)));
}

export const DEFAULT_EPUB_PREFS: EpubPrefs = {
  flow: 'auto',
  publisherFont: false,
  indent: 'book',
  columns: 'auto',
  railWidth: RAIL_WIDTH_DEFAULT,
  justify: true,
  turn: 'none',
  paper: 'theme',
  toc: DEFAULT_TOC_PREFS,
};

const K_PREFS = 'jz-epub-prefs:v1';

/**
 * A preset key stored by the first EPUB batch (``font: 'verdana'`` etc.)
 * before the font choice became shared with the article reader. Consumers
 * migrate it into ``jz-article-font`` once and drop it.
 */
export function legacyEpubFontKey(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const p = JSON.parse(localStorage.getItem(K_PREFS) || '{}') as { font?: unknown };
    return typeof p.font === 'string' && p.font && p.font !== 'auto' && p.font !== 'publisher' ? p.font : null;
  } catch {
    return null;
  }
}

export function loadEpubPrefs(): EpubPrefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_EPUB_PREFS };
  try {
    const raw = localStorage.getItem(K_PREFS);
    if (!raw) return { ...DEFAULT_EPUB_PREFS };
    const p = JSON.parse(raw) as Partial<EpubPrefs> & { font?: unknown };
    return {
      flow: p.flow === 'paginated' || p.flow === 'scrolled' ? p.flow : 'auto',
      publisherFont: typeof p.publisherFont === 'boolean' ? p.publisherFont : p.font === 'publisher',
      indent: p.indent === 'none' ? 'none' : 'book',
      columns: p.columns === 1 || p.columns === 2 ? p.columns : 'auto',
      railWidth: clampRailWidth(Number(p.railWidth)),
      justify: p.justify !== false,
      turn: typeof p.turn === 'string' && TURN_VALUES.has(p.turn) ? (p.turn as EpubTurn) : 'none',
      paper: EPUB_PAPERS.some((x) => x.key === p.paper) ? (p.paper as EpubPaperKey) : 'theme',
      toc: repairTocPrefs(p.toc),
    };
  } catch {
    return { ...DEFAULT_EPUB_PREFS };
  }
}

export function saveEpubPrefs(prefs: EpubPrefs): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(K_PREFS, JSON.stringify(prefs));
  } catch {
    /* quota / private mode — preferences are best-effort */
  }
}

/* ── Position memory ─────────────────────────────────────────────────── */

export interface EpubPosition {
  /** EPUB CFI of the first visible content — precise, survives reflow. */
  cfi: string;
  /** Whole-book progress 0–1 — the fallback when the CFI no longer resolves. */
  fraction: number;
  /** Last-saved timestamp, for pruning. */
  t: number;
}

const K_POS = 'jz-epub-pos:v1';
export const EPUB_POSITION_MAX_ENTRIES = 200;

/** Storage key for a book: the attachment path without cache-busting query. */
export function epubPositionKey(url: string): string {
  const q = url.indexOf('?');
  return q >= 0 ? url.slice(0, q) : url;
}

function readPosMap(): Record<string, EpubPosition> {
  try {
    const raw = localStorage.getItem(K_POS);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, EpubPosition>;
    }
  } catch {
    /* corrupted / unavailable */
  }
  return {};
}

/** Pure: keep only the ``max`` most recently saved entries. */
export function pruneEpubPositions(
  map: Record<string, EpubPosition>,
  max: number,
): Record<string, EpubPosition> {
  const keys = Object.keys(map);
  if (keys.length <= max) return map;
  const keep = keys.sort((a, b) => (map[b]?.t ?? 0) - (map[a]?.t ?? 0)).slice(0, max);
  const next: Record<string, EpubPosition> = {};
  for (const k of keep) next[k] = map[k];
  return next;
}

export function saveEpubPosition(key: string, pos: { cfi: string; fraction: number }, now = Date.now()): void {
  if (!key || !pos.cfi || typeof localStorage === 'undefined') return;
  const map = readPosMap();
  map[key] = { cfi: pos.cfi, fraction: Math.min(1, Math.max(0, pos.fraction || 0)), t: now };
  try {
    localStorage.setItem(K_POS, JSON.stringify(pruneEpubPositions(map, EPUB_POSITION_MAX_ENTRIES)));
  } catch {
    /* best-effort */
  }
}

export function loadEpubPosition(key: string): EpubPosition | null {
  if (!key || typeof localStorage === 'undefined') return null;
  const e = readPosMap()[key];
  return e && typeof e.cfi === 'string' ? e : null;
}

export function clearEpubPosition(key: string): void {
  if (typeof localStorage === 'undefined') return;
  const map = readPosMap();
  if (map[key]) {
    delete map[key];
    try {
      localStorage.setItem(K_POS, JSON.stringify(map));
    } catch {
      /* best-effort */
    }
  }
}

/* ── Estimated page numbers for TOC entries ─────────────────────────────── */

/** Bytes of chapter markup per rendered page before any calibration. A 33 MB
 * technical book at the default measure (16.5px, single column) calibrated to
 * ≈1.0 KB/page (≈330 CJK characters plus markup); start there — the first
 * multi-page chapter the reader opens replaces it with the measured value. */
export const DEFAULT_BYTES_PER_PAGE = 1000;

/**
 * Running calibration of "bytes per page": every paginated section the reader
 * actually renders contributes its (size, pages) pair, so the estimate tightens
 * as the book is read. Pure value type; callers keep one per book.
 */
export interface PageCalibration {
  bytes: number;
  pages: number;
}
export function addCalibration(c: PageCalibration, sectionBytes: number, sectionPages: number): PageCalibration {
  // Single-page sections (cover, title page, dedication) say nothing about
  // body density and would skew the average — only multi-page sections count.
  if (!(sectionBytes > 0) || !(sectionPages >= 2)) return c;
  return { bytes: c.bytes + sectionBytes, pages: c.pages + sectionPages };
}
export function bytesPerPage(c: PageCalibration): number {
  return c.pages > 0 ? c.bytes / c.pages : DEFAULT_BYTES_PER_PAGE;
}

/**
 * Estimated 1-based page number where each TOC entry starts, plus the total.
 * Entries are placed at their section's start; several entries in one section
 * spread linearly through it (EPUB anchors are not resolved — that would mean
 * loading every chapter). ``sectionFractions`` is foliate's cumulative size
 * table (length = sections + 1); ``sectionOf`` maps entries → spine index.
 */
export function estimateTocPages(
  entries: EpubTocEntry[],
  sectionOf: number[],
  sectionFractions: number[],
  totalBytes: number,
  bpp: number,
): { pages: Array<number | null>; total: number } {
  const total = Math.max(1, Math.round(totalBytes / Math.max(1, bpp)));
  if (sectionFractions.length < 2) return { pages: entries.map(() => null), total };
  const perSection = new Map<number, number[]>();
  entries.forEach((_, i) => {
    const sec = sectionOf[i];
    if (sec >= 0) perSection.set(sec, [...(perSection.get(sec) ?? []), i]);
  });
  const pages: Array<number | null> = entries.map(() => null);
  for (const [sec, idxs] of perSection) {
    const start = sectionFractions[sec] ?? 0;
    const end = sectionFractions[sec + 1] ?? start;
    idxs.forEach((entryIdx, k) => {
      const f = start + ((end - start) * k) / idxs.length;
      pages[entryIdx] = Math.min(total, Math.floor(f * total) + 1);
    });
  }
  return { pages, total };
}

/* ── Remaining-time / TOC filter / syntax-highlight spans ───────────────── */

/** ``12 分钟`` / ``1 小时 20 分`` from foliate's minute estimate; ``''`` when unknown. */
export function formatMinutes(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min) || min < 0) return '';
  const m = Math.round(min);
  if (m < 1) return '不到 1 分钟';
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} 小时 ${r} 分` : `${h} 小时`;
}

/** Case-insensitive title filter; empty query → ``entries`` unchanged. */
export function filterTocEntries(entries: EpubTocEntry[], query: string): EpubTocEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => e.title.toLowerCase().includes(q));
}

/** Minimal hast shape produced by lowlight (``highlight.js`` class names). */
export interface HastNode {
  type: string;
  value?: string;
  properties?: { className?: string[] };
  children?: HastNode[];
}

export interface TokenSpan {
  start: number;
  end: number;
  /** highlight.js scope without the ``hljs-`` prefix, e.g. ``keyword``. */
  cls: string;
}

/** Highlight scopes worth colouring (others are left as plain text). */
export const HIGHLIGHT_SCOPES = new Set([
  'keyword', 'built_in', 'type', 'literal', 'number', 'string', 'comment', 'meta',
  'title', 'attr', 'attribute', 'variable', 'symbol', 'regexp', 'operator', 'punctuation', 'section', 'name', 'tag',
]);

/**
 * Flatten a lowlight tree into character spans (offsets into the original
 * text), each carrying the nearest ancestor scope. Used with the CSS Custom
 * Highlight API so code can be coloured **without touching the DOM** — the
 * chapter's CFI positions stay valid.
 */
export function tokenSpansFromHast(root: HastNode): TokenSpan[] {
  const out: TokenSpan[] = [];
  let offset = 0;
  const walk = (node: HastNode, scope: string | null) => {
    if (node.type === 'text') {
      const len = (node.value ?? '').length;
      if (scope && len > 0) {
        const last = out[out.length - 1];
        if (last && last.cls === scope && last.end === offset) last.end = offset + len;
        else out.push({ start: offset, end: offset + len, cls: scope });
      }
      offset += len;
      return;
    }
    let next = scope;
    const cls = node.properties?.className?.find((c) => c.startsWith('hljs-'));
    if (cls) {
      const bare = cls.slice(5).split('_')[0] === 'built' ? 'built_in' : cls.slice(5);
      next = HIGHLIGHT_SCOPES.has(bare) ? bare : scope;
    }
    for (const ch of node.children ?? []) walk(ch, next);
  };
  walk(root, null);
  return out;
}

/* ── Publisher font semantics → site faces ───────────────────────────── */

/**
 * CJK publishers encode meaning in font families: 楷体 for quotes / captions /
 * tips, 黑体 for headings, 宋体 for body, monospace for code. A blanket
 * font override (Readium's ``fontOverride``) flattens all of that to one face
 * and leaves ``<pre>`` on the browser's fallback monospace. Instead every
 * declared family is classified into a role and swapped for the matching
 * 简斋 stack, so the publisher's intent survives in the site's own type.
 */
export type FontRole = 'kai' | 'hei' | 'song' | 'mono' | 'other';

export function classifyFontFamily(family: string | null | undefined): FontRole {
  const f = (family ?? '').toLowerCase();
  if (!f) return 'other';
  if (/mono|courier|consolas|menlo|monaco|source ?code|fira ?code|jetbrains|inconsolata|sfmono/.test(f)) return 'mono';
  if (/kai|楷|wenkai/.test(f)) return 'kai';
  // sans before serif: "sans-serif" contains "serif"
  if (/hei|黑|gothic|sans|yahei|pingfang|helvetica|arial|verdana|tahoma|roboto|segoe|system-ui/.test(f)) return 'hei';
  if (/song|宋|ming|明|serif|times|georgia|garamond|baskerville|palatino/.test(f)) return 'song';
  return 'other';
}

export interface FontRoleStacks {
  /** The reader's chosen body face (stands in for 宋体 / generic serif). */
  body: string;
  kai: string;
  hei: string;
  mono: string;
}

export interface PublisherFontRule {
  selector: string;
  family: string;
}

/**
 * CSS that re-targets each publisher ``font-family`` rule to the site stack of
 * its role, plus rules for elements tagged from inline styles
 * (``data-jz-font="kai"`` …). ``other`` (icon / phonetic fonts) is left alone.
 */
export function buildFontMappingCss(rules: PublisherFontRule[], stacks: FontRoleStacks): string {
  const stackFor = (role: FontRole): string | null =>
    role === 'mono' ? stacks.mono : role === 'kai' ? stacks.kai : role === 'hei' ? stacks.hei : role === 'song' ? stacks.body : null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rules) {
    const stack = stackFor(classifyFontFamily(r.family));
    const sel = (r.selector ?? '').trim();
    if (!stack || !sel) continue;
    const line = `${sel} { font-family: ${stack} !important; }`;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  for (const role of ['kai', 'hei', 'song', 'mono'] as const) {
    out.push(`[data-jz-font="${role}"] { font-family: ${stackFor(role)} !important; }`);
  }
  return out.join('\n');
}

/** Relative luminance of an ``rgb()``/``rgba()`` string (0–1), ``null`` if unparsable / transparent. */
export function cssColorLuminance(color: string | null | undefined): number | null {
  const m = (color ?? '').match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/i);
  if (!m) return null;
  if (m[4] != null && parseFloat(m[4]) === 0) return null;
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(+m[1]) + 0.7152 * lin(+m[2]) + 0.0722 * lin(+m[3]);
}

/* ── User stylesheet ─────────────────────────────────────────────────── */

export interface EpubThemeInput {
  /** Page background — must be **opaque** (the site's ``--jz-cell-surface``,
   * the surface colour pre-composited over ``--jz-bg-app``): the chapter
   * iframe and the paginator's backdrop both paint it, and a translucent
   * glass surface would stack twice and drift from the wrapper. */
  bg: string;
  /** Body text colour (``--jz-text``). */
  fg: string;
  /** Link colour (``--jz-accent``). */
  accent: string;
  /** Muted text for running heads (``--jz-text-muted``). */
  muted: string;
  /** Whether the site theme is dark — drives ``color-scheme`` and the
   * publisher-colour neutralisation. */
  dark: boolean;
  /** Font stack to force onto the text, or ``null`` to keep the publisher's.
   * When set, the role stacks below re-target the publisher's semantic faces. */
  fontFamily: string | null;
  /** Site stacks for the publisher's semantic roles (used when ``fontFamily`` is set). */
  roles?: { kai: string; hei: string; mono: string };
  /** Body size at scale 1 — the site's ``--jz-fs-read`` so books match articles. */
  baseFontPx?: number;
  fontScale: number;
  lineHeight: number;
  justify: boolean;
  /** ``'none'`` strips the publisher's first-line indent (article-reader look). */
  indent?: 'book' | 'none';
}

/** Marker foliate's injected user sheets carry so the chapter normaliser can
 * skip them when harvesting *publisher* font rules. */
export const USER_SHEET_MARKER = '/*jz-user*/';

/**
 * Build the ``[before, after]`` pair foliate injects around the publisher CSS.
 *
 * ``before`` = defaults the publisher may override (base colours, root font
 * size). ``after`` = the reader's explicit choices, with ``!important`` so a
 * publisher ``body { color: #333 }`` can't leave grey-on-black text in a dark
 * theme. Inline ``<span style="color">`` accents are deliberately left alone —
 * a red emphasis stays red; only structural text is neutralised.
 */
export function buildEpubUserCss(t: EpubThemeInput): [string, string] {
  const scale = Math.min(3, Math.max(0.4, Number(t.fontScale) || 1));
  const rootPx = Math.round((t.baseFontPx ?? 16) * scale * 100) / 100;
  const before = `${USER_SHEET_MARKER}
@namespace epub "http://www.idpf.org/2007/ops";
html {
  color-scheme: ${t.dark ? 'dark' : 'light'};
  font-size: ${rootPx}px;
  background-color: ${t.bg};
  color: ${t.fg};
}
body { background-color: ${t.bg}; color: ${t.fg}; }
`;
  const mono = t.roles?.mono ?? "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace";
  const fontRule = t.fontFamily
    ? `
body, p, li, dd, dt, blockquote, div, td, th, h1, h2, h3, h4, h5, h6, span, a, figcaption, caption {
  font-family: ${t.fontFamily} !important;
}
pre, code, kbd, samp, tt, [data-jz-box="code"] { font-family: ${mono} !important; }`
    : '';
  const ink = t.dark ? '255,255,255' : '0,0,0';
  const boxBg = `rgba(${ink},${t.dark ? '.06' : '.045'})`;
  const boxBorder = `rgba(${ink},${t.dark ? '.16' : '.12'})`;
  const after = `${USER_SHEET_MARKER}
html { font-size: ${rootPx}px !important; }
html, body { background-color: ${t.bg} !important; color: ${t.fg} !important; }
p, li, dd, dt, blockquote, td, th, h1, h2, h3, h4, h5, h6, figcaption, caption {
  color: ${t.fg} !important;
  background-color: transparent !important;
}
body { line-height: ${t.lineHeight} !important; }
p, li, dd, blockquote {
  line-height: ${t.lineHeight} !important;
  text-align: ${t.justify ? 'justify' : 'start'};${t.indent === 'none' ? '\n  text-indent: 0 !important;' : ''}
  hanging-punctuation: allow-end last;
  widows: 2;
  orphans: 2;
}
h1, h2, h3, h4, h5, h6 { line-height: 1.35; text-shadow: none !important; }
[align="left"] { text-align: left; }
[align="right"] { text-align: right; }
[align="center"] { text-align: center; }
a:link, a:visited { color: ${t.accent} !important; text-decoration-thickness: 1px; text-underline-offset: 2px; }
/* Publisher boxes (tips, 知识点框, sidebars): keep them, restyle to the theme. */
[data-jz-box] {
  background-color: ${boxBg} !important;
  border-radius: 8px;
  padding: .7em 1em !important;
  margin-block: 1em;
  color: ${t.fg} !important;
}
[data-jz-box="code"] { padding: 0 !important; background-color: transparent !important; }
[data-jz-frame] {
  border-color: ${boxBorder} !important;
  border-radius: 8px;
  padding: .6em .9em !important;
  background-color: transparent !important;
}
/* Code: the site's monospace block, wrapped at spaces (e-reader style — no
   horizontal scrollbars inside a page). */
pre {
  white-space: pre-wrap !important;
  overflow-wrap: break-word;
  word-break: normal;
  tab-size: 4;
  font-size: .88em !important;
  line-height: 1.6 !important;
  padding: .75em 1em !important;
  margin: .9em 0 !important;
  border-radius: 8px;
  border: 1px solid ${boxBorder};
  background-color: ${boxBg} !important;
  color: ${t.fg} !important;
}
[data-jz-box="code"] > pre { margin: 0 !important; }
code, kbd, samp, tt {
  font-size: .9em;
  padding: .05em .35em;
  border-radius: 4px;
  background-color: ${boxBg};
  border: 1px solid ${boxBorder};
}
pre code, pre kbd, pre samp, pre tt { padding: 0; border: 0; background: transparent !important; font-size: inherit; }
table { border-collapse: collapse; margin: 1em auto; font-size: .92em; }
td, th { border-color: ${boxBorder} !important; padding: .35em .6em; }
th { background-color: ${boxBg} !important; }
blockquote { border-left-color: ${boxBorder}; }
hr { border-color: ${boxBorder}; }
img, svg, video { max-width: 100%; height: auto; border-radius: 4px; ${t.dark ? 'filter: brightness(.88);' : ''} }
img { cursor: zoom-in; }
/* Copy affordance drawn with a pseudo-element (no DOM injection → CFIs stay
   valid); the reader's click handler maps the top-right hit zone to a copy. */
pre { position: relative; }
pre::after {
  content: '复制';
  position: absolute;
  top: 6px;
  right: 8px;
  font: 11px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  letter-spacing: .04em;
  padding: 3px 9px;
  border-radius: 999px;
  color: ${t.accent};
  background: color-mix(in srgb, ${t.accent} 12%, ${t.bg});
  border: 1px solid color-mix(in srgb, ${t.accent} 28%, transparent);
  opacity: 0;
  transition: opacity 140ms ease;
  pointer-events: none;
  text-indent: 0;
}
pre:hover::after, pre[data-jz-copied]::after { opacity: 1; }
pre[data-jz-copied]::after { content: '已复制 ✓'; color: ${t.bg}; background: ${t.accent}; }
@media (hover: none) { pre::after { opacity: .85; } }
/* Tables wider than the column: the reader opens them in a zoom dialog. */
table[data-jz-wide] { cursor: zoom-in; }
/* Syntax highlight via the CSS Custom Highlight API (see EpubReader). */
::highlight(jz-hl-keyword) { color: ${t.dark ? '#c792ea' : '#8250df'}; }
::highlight(jz-hl-built_in), ::highlight(jz-hl-type), ::highlight(jz-hl-title), ::highlight(jz-hl-section), ::highlight(jz-hl-name), ::highlight(jz-hl-tag) { color: ${t.dark ? '#82aaff' : '#0550ae'}; }
::highlight(jz-hl-string), ::highlight(jz-hl-regexp), ::highlight(jz-hl-symbol) { color: ${t.dark ? '#c3e88d' : '#0a7d3a'}; }
::highlight(jz-hl-number), ::highlight(jz-hl-literal) { color: ${t.dark ? '#f78c6c' : '#b35900'}; }
::highlight(jz-hl-comment), ::highlight(jz-hl-meta) { color: ${t.dark ? '#7f8a99' : '#6e7781'}; }
::highlight(jz-hl-attr), ::highlight(jz-hl-attribute), ::highlight(jz-hl-variable) { color: ${t.dark ? '#ffcb6b' : '#953800'}; }
::highlight(jz-hl-operator), ::highlight(jz-hl-punctuation) { color: ${t.muted}; }
aside[epub|type~="endnote"],
aside[epub|type~="footnote"],
aside[epub|type~="note"],
aside[epub|type~="rearnote"] { display: none; }
::selection { background: ${t.accent}; color: #fff; }
${fontRule}
`;
  return [before, after];
}

/* ── Progress formatting ─────────────────────────────────────────────── */

export interface EpubProgressInput {
  fraction?: number;
  section?: { current: number; total: number } | null;
  tocLabel?: string | null;
}

/** Human progress line: ``12% · 第 3/117 节 · 第二章 OSPF``. */
export function formatEpubProgress(p: EpubProgressInput): string {
  const parts: string[] = [];
  if (typeof p.fraction === 'number' && Number.isFinite(p.fraction)) {
    parts.push(`${Math.round(Math.min(1, Math.max(0, p.fraction)) * 100)}%`);
  }
  if (p.section && p.section.total > 0) {
    parts.push(`第 ${p.section.current + 1}/${p.section.total} 节`);
  }
  const label = (p.tocLabel ?? '').replace(/\s+/g, ' ').trim();
  if (label) parts.push(label);
  return parts.join(' · ');
}

/* ── Client-side script scrub (defence in depth) ─────────────────────── */

/**
 * Strip scripting from a chapter's markup before it reaches the iframe. The
 * backend already sanitises at upload; this covers books uploaded before that
 * existed and keeps the reader safe on its own. Regex-based on purpose: it must
 * never alter anything but script vectors, and a DOM round-trip would.
 */
export function stripEpubScripts(markup: string): string {
  if (!markup || !/<script|\son[a-z]+\s*=|javascript:|<iframe|<object|<embed/i.test(markup)) return markup;
  return (
    markup
      // <script ...>...</script> and unterminated <script ...> tails
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<script\b[^>]*\/?>/gi, '')
      // inline event handlers: onload="..." / onclick='...' / onerror=bare
      .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      // javascript: URLs in href/src/xlink:href/action/formaction/data
      .replace(
        /(\s(?:href|src|xlink:href|action|formaction|data|poster)\s*=\s*)(["']?)\s*javascript:[^"'>\s]*/gi,
        '$1$2#',
      )
      // nested browsing contexts / plugins can smuggle scripts of their own
      .replace(/<(iframe|object|embed|applet)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<(iframe|object|embed|applet)\b[^>]*\/?>/gi, '')
  );
}

/** Whether the book ships its own fonts (used for the ``font: 'auto'`` rule). */
export function bookEmbedsFonts(manifest: Array<{ mediaType?: string; href?: string }> | undefined | null): boolean {
  if (!manifest) return false;
  return manifest.some(
    (m) =>
      /font|opentype|truetype|woff/i.test(m.mediaType ?? '') ||
      /\.(otf|ttf|woff2?)$/i.test(m.href ?? ''),
  );
}

