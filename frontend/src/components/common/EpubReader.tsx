/**
 * EPUB reader built on the vendored foliate-js (``src/vendor/foliate-js``).
 *
 * The book is fetched as bytes (same-origin, cookies included — same reason as
 * ``PdfCanvas``) and handed to a ``<foliate-view>`` custom element that parses
 * the container in the browser and renders each chapter inside a ``blob:``
 * iframe: paginated (CSS multi-column, 1–2 columns) or scrolled, switchable
 * without reloading.
 *
 * 简斋's reading experience is layered on top the Readium-CSS way — the
 * publisher's stylesheet stays in charge and a *user* sheet is injected into
 * every chapter: theme colours always (the page must match the site theme),
 * typography only for the knobs the reader has turned. On top of that each
 * chapter is *normalised* once at load: publisher boxes / frames are tagged so
 * the user sheet can restyle them to the theme instead of deleting them, and
 * the publisher's font families are re-targeted by *role* (楷 → 文楷, 黑 →
 * sans, 宋 → the chosen body face, monospace → the site mono) so a font switch
 * keeps the typographic intent — and never turns code into a serif.
 *
 * Everything that decorates the chapter avoids mutating its DOM (pseudo-element
 * copy button, CSS Custom Highlight API for syntax colour, data attributes for
 * boxes / wide tables): foliate's reading positions are CFI node paths, and
 * injected nodes would silently shift every saved position.
 *
 * Page turns animate through the View Transitions API — the stage is named
 * ``jz-epub-page`` for the duration and ``<html data-jz-turn/-dir>`` selects the
 * keyframes (slide / cover / fade / vertical / 3D flip). Browsers without VT
 * fall back to foliate's own slide.
 *
 * Progress, chapter, running heads, remaining time and per-book position memory
 * (CFI + fraction fallback) all derive from foliate's ``relocate`` event.
 *
 * Full-screen uses the Fullscreen API on the *same* wrapper element rather than
 * a portal: moving the element would re-parent the chapter iframe, which makes
 * browsers reload it and throws the paginator's state away. Every AntD popup
 * (settings, selects, tooltips, dialogs) is therefore rendered *inside* the
 * wrapper — anything portalled to ``body`` is invisible while full-screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Button,
  Divider,
  Drawer,
  Image,
  Modal,
  Popover,
  Progress,
  Segmented,
  Select,
  Slider,
  Space,
  Spin,
  Tooltip,
  Typography,
} from 'antd';
import { message } from '@/utils/notify';
import {
  BookFilled,
  BookOutlined,
  CloseOutlined,
  ControlOutlined,
  DownloadOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  LeftOutlined,
  MinusOutlined,
  PlusOutlined,
  RedoOutlined,
  ReloadOutlined,
  RightOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import '@/vendor/foliate-js/view.js';
import type {
  FoliateAnnotation,
  FoliateBook,
  FoliateDrawAnnotationDetail,
  FoliateRelocateDetail,
  FoliateShowAnnotationDetail,
  View as FoliateView,
} from '@/vendor/foliate-js/view.js';
import { FootnoteHandler, type FootnoteRenderDetail } from '@/vendor/foliate-js/footnotes.js';
import { Overlayer } from '@/vendor/foliate-js/overlayer.js';
import EpubSidebar, { type EpubSearchGroup, type EpubSideTab } from './EpubSidebar';
import EpubSelectionBar, { type SelectionAnchor } from './EpubSelectionBar';
import EpubHighlightCard from './EpubHighlightCard';
import EpubNotesExportModal from './EpubNotesExportModal';
import { isLightTheme, useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import {
  createBookmark,
  createHighlight,
  deleteBookmark,
  deleteHighlight,
  listBookmarks,
  listHighlights,
  updateHighlight,
  type Bookmark,
  type Highlight,
  type HighlightColor,
  type HighlightStyle,
} from '@/api/reading';
import { listPublicPosts } from '@/api/blog';
import type { PublicPost } from '@/types';
import { createComment } from '@/api/comments';
import {
  buildCommentFromHighlight,
  buildNotesMarkdown,
  buildQuoteMarkdown,
  loadLastHighlightColor,
  normalizeSelectionText,
  notesFilename,
  saveLastHighlightColor,
  swatchHex,
} from '@/utils/epubNotes';
import { ARTICLE_FONT_PRESETS, loadArticleFont, saveArticleFont, stackFor, useArticleFontPresets } from '@/utils/articleFont';
import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEPS,
  LINE_HEIGHT_OPTIONS,
  clampScale,
  loadReaderLayout,
  saveReaderLayout,
  stepFontScale,
  type ReaderLayout,
} from '@/utils/readerLayout';
import { FONT_STACK_KAI, FONT_STACK_MONO, FONT_STACK_SANS } from '@/utils/fontStacks';
import { decorativeMotionEnabled, prefersReducedMotion } from '@/utils/motionPref';
import { sanitizeHtml } from '@/utils/markdown';
import {
  DEFAULT_EPUB_PREFS,
  EPUB_PAPERS,
  EPUB_TURN_OPTIONS,
  RAIL_WIDTH_MAX,
  RAIL_WIDTH_MIN,
  USER_SHEET_MARKER,
  addCalibration,
  bookEmbedsFonts,
  bytesPerPage,
  estimateTocPages,
  buildEpubUserCss,
  buildFontMappingCss,
  clampRailWidth,
  classifyFontFamily,
  defaultFlowFor,
  epubPositionKey,
  flattenEpubToc,
  formatEpubProgress,
  formatMinutes,
  legacyEpubFontKey,
  loadEpubPosition,
  markEpubDone,
  loadEpubPrefs,
  paperFor,
  pickActiveTocId,
  resolveColumns,
  saveEpubPosition,
  saveEpubPrefs,
  stripEpubScripts,
  tokenSpansFromHast,
  type EpubFlow,
  type EpubPaperKey,
  type EpubPrefs,
  type EpubTocEntry,
  type EpubTocPrefs,
  type EpubTurn,
  type PageCalibration,
  type HastNode,
  type PublisherFontRule,
} from '@/utils/epubReader';

const { Text } = Typography;

interface Props {
  url: string;
  /** Box height in 'inner' mode (modals, editor panels). */
  height?: number | string;
  /** 'page': the reader is the article on the reading page and sizes to the
   *  viewport (minus site chrome). 'inner' (default): a fixed-height box. */
  scroll?: 'inner' | 'page';
  /** Fallback title when the book carries none. */
  title?: string;
  /** Document the book belongs to — enables highlights / notes (persisted
   * per user). Without it the selection bar only offers copy / search / quote. */
  documentId?: number | null;
  /** Open at this CFI instead of the remembered position (deep link
   * ``/d/:id?cfi=``), flashing the target once. */
  initialCfi?: string | null;
  /** KB slug — the 读完页 lists other books of the same shelf. */
  kbSlug?: string | null;
}

/** Column gap as a percentage of the page (Readium uses ~6–8%). */
const GAP = '6%';
/** Height of the running head / foot bands in paginated mode. */
const MARGIN_PX = 44;
/** Optimal measure for CJK body text at 100% (~40–45 characters). */
const MAX_INLINE_SIZE_PX = 720;
/** Sidebar rail vs. drawer breakpoint (book column + rail). */
const RAIL_MIN_WIDTH = 960;
/** Paginated mode: clicking this fraction of the page edge turns the page. */
const EDGE_TURN_FRACTION = 0.18;
/** Elements that may be publisher "boxes" (tips, 知识点框, sidebars). */
const BOX_SELECTOR = 'div, aside, section, article, blockquote, figure, p, ul, ol, dl';
/** Copy hit zone inside a <pre> (matches the pseudo-element button's box). */
const COPY_ZONE = { w: 72, h: 30 };
/** Wheel: accumulated delta that turns a page, and the lockout after a turn. */
const WHEEL_THRESHOLD = 48;
const WHEEL_LOCK_MS = 420;
/** Full-screen chrome hides after this much pointer idleness. */
const CHROME_IDLE_MS = 2600;
/** Syntax highlight: skip very short snippets and unsure guesses. */
const HL_MIN_CHARS = 16;
const HL_MIN_RELEVANCE = 4;
const HL_MAX_BLOCKS = 400;
const HL_LANGS = ['bash', 'shell', 'python', 'javascript', 'typescript', 'json', 'yaml', 'xml', 'sql', 'c', 'cpp', 'java', 'go', 'ini', 'diff', 'markdown', 'css'];

const supportsViewTransitions = () =>
  typeof document !== 'undefined' && typeof (document as Document & { startViewTransition?: unknown }).startViewTransition === 'function';

type Turn = 'next' | 'prev' | 'jump';

function languageMapText(x: unknown): string {
  if (!x) return '';
  if (typeof x === 'string') return x;
  if (typeof x === 'object') {
    const o = x as Record<string, unknown>;
    if (typeof o.name === 'string') return o.name;
    if (o.name && typeof o.name === 'object') return languageMapText(o.name);
    const first = Object.values(o)[0];
    return typeof first === 'string' ? first : '';
  }
  return '';
}

function contributorsText(x: unknown): string {
  if (Array.isArray(x)) return x.map(languageMapText).filter(Boolean).join('、');
  return languageMapText(x);
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

/** Publisher ``font-family`` declarations from the chapter's own sheets (ours skipped). */
function harvestPublisherFontRules(doc: Document): PublisherFontRule[] {
  const rules: PublisherFontRule[] = [];
  const walk = (list: CSSRuleList) => {
    for (const r of Array.from(list)) {
      const sr = r as CSSStyleRule;
      if (sr.style && sr.style.fontFamily && sr.selectorText) {
        rules.push({ selector: sr.selectorText, family: sr.style.fontFamily });
      }
      const gr = r as CSSGroupingRule;
      if (gr.cssRules) walk(gr.cssRules);
    }
  };
  for (const sheet of Array.from(doc.styleSheets)) {
    const node = sheet.ownerNode as Element | null;
    if (node?.getAttribute?.('data-jz')) continue;
    if (node?.tagName === 'STYLE' && (node.textContent ?? '').includes(USER_SHEET_MARKER)) continue;
    try {
      walk(sheet.cssRules);
    } catch {
      /* cross-origin sheet — none expected inside a blob: chapter */
    }
  }
  return rules;
}

/**
 * Tag publisher boxes / frames and inline font roles once per chapter so the
 * user sheet can restyle them. Runs at ``load`` — the user sheet is already
 * applied then, but it no longer touches block backgrounds / borders, so the
 * computed values are the publisher's.
 */
function normalizeChapter(doc: Document) {
  const win = doc.defaultView;
  if (!win || !doc.body) return;
  for (const el of Array.from(doc.body.querySelectorAll<HTMLElement>(BOX_SELECTOR))) {
    const cs = win.getComputedStyle(el);
    const bg = cs.backgroundColor;
    if (bg && bg !== 'transparent' && !/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)/.test(bg)) {
      // XHTML chapters report lowercase tag names — compare localName.
      const onlyPre = el.children.length === 1 && el.firstElementChild?.localName === 'pre';
      el.setAttribute('data-jz-box', onlyPre ? 'code' : '');
    }
    const bordered = ['Top', 'Right', 'Bottom', 'Left'].some(
      (side) =>
        cs.getPropertyValue(`border-${side.toLowerCase()}-style`) !== 'none' &&
        parseFloat(cs.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0,
    );
    if (bordered && el.localName !== 'table') el.setAttribute('data-jz-frame', '');
  }
  for (const el of Array.from(doc.body.querySelectorAll<HTMLElement>('[style*="font-family" i]'))) {
    const role = classifyFontFamily(el.style.fontFamily);
    if (role !== 'other') el.setAttribute('data-jz-font', role);
  }
  // Tables wider than the column get clipped in paginated mode; mark them so
  // the reader can offer a zoom dialog.
  const colW = parseFloat(win.getComputedStyle(doc.documentElement).columnWidth) || doc.documentElement.clientWidth;
  for (const table of Array.from(doc.body.querySelectorAll<HTMLTableElement>('table'))) {
    if (colW > 0 && table.scrollWidth > colW - 4) {
      table.setAttribute('data-jz-wide', '');
      table.setAttribute('title', '点击查看完整表格');
    }
  }
}

/**
 * The site's self-hosted faces (Noto Serif SC, 思源黑体, 文楷, JetBrains Mono, …)
 * are declared by ``@font-face`` in the *parent* document; a chapter iframe has
 * its own document and never sees them, so every preset silently fell back to
 * system fonts inside the book. Collect the parent's ``@font-face`` rules for
 * the families our stacks reference, with ``url()``s made absolute (a blob:
 * document cannot resolve root-relative URLs), and inject them per chapter.
 */
let siteFontFacesCss: string | null = null;
function collectSiteFontFaces(): string {
  if (siteFontFacesCss != null) return siteFontFacesCss;
  const wanted = new Set<string>();
  const addStack = (stack: string) =>
    stack.split(',').forEach((f) => {
      const name = f.trim().replace(/^["']|["']$/g, '').toLowerCase();
      if (name) wanted.add(name);
    });
  ARTICLE_FONT_PRESETS.forEach((p) => addStack(p.stack));
  [FONT_STACK_KAI, FONT_STACK_SANS, FONT_STACK_MONO].forEach(addStack);
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet
    }
    const base = sheet.href || document.baseURI;
    for (const r of Array.from(rules)) {
      const ff = r as CSSFontFaceRule;
      if (ff.type !== CSSRule.FONT_FACE_RULE) continue;
      const family = (ff.style.getPropertyValue('font-family') || '').trim().replace(/^["']|["']$/g, '').toLowerCase();
      if (!wanted.has(family)) continue;
      out.push(
        ff.cssText.replace(/url\((['"]?)([^'")]+)\1\)/g, (_m, q: string, u: string) => {
          if (/^(data|blob|https?):/i.test(u)) return `url(${q}${u}${q})`;
          try {
            return `url(${q}${new URL(u, base).href}${q})`;
          } catch {
            return `url(${q}${u}${q})`;
          }
        }),
      );
    }
  }
  siteFontFacesCss = out.join('\n');
  return siteFontFacesCss;
}

function injectSiteFonts(doc: Document) {
  if (!doc.head || doc.head.querySelector('style[data-jz="fonts"]')) return;
  const css = collectSiteFontFaces();
  if (!css) return;
  const el = doc.createElement('style');
  el.setAttribute('data-jz', 'fonts');
  el.textContent = css;
  doc.head.prepend(el);
}

type LowlightApi = {
  highlightAuto: (value: string, opts?: { subset?: string[] }) => HastNode & { data?: { language?: string; relevance?: number } };
};
let lowlightPromise: Promise<LowlightApi | null> | null = null;
function loadLowlight(): Promise<LowlightApi | null> {
  if (!lowlightPromise) {
    lowlightPromise = import('lowlight')
      .then((m) => m.createLowlight(m.common) as unknown as LowlightApi)
      .catch(() => null);
  }
  return lowlightPromise;
}

/**
 * Colour code blocks with the CSS Custom Highlight API: token ranges are
 * registered on the chapter window's ``CSS.highlights`` and painted by the
 * ``::highlight(jz-hl-*)`` rules in the user sheet. Zero DOM mutation.
 */
async function highlightChapterCode(doc: Document) {
  const win = doc.defaultView as (Window & { Highlight?: new (...r: Range[]) => unknown; CSS?: { highlights?: Map<string, unknown> } }) | null;
  if (!win?.Highlight || !win.CSS?.highlights) return;
  const pres = Array.from(doc.body.querySelectorAll('pre')).slice(0, HL_MAX_BLOCKS);
  if (!pres.length) return;
  const low = await loadLowlight();
  if (!low || !doc.defaultView) return; // chapter unloaded meanwhile
  const byClass = new Map<string, Range[]>();
  for (const pre of pres) {
    const text = pre.textContent ?? '';
    if (text.trim().length < HL_MIN_CHARS) continue;
    let tree: ReturnType<LowlightApi['highlightAuto']>;
    try {
      tree = low.highlightAuto(text, { subset: HL_LANGS });
    } catch {
      continue;
    }
    if ((tree.data?.relevance ?? 0) < HL_MIN_RELEVANCE) continue;
    const spans = tokenSpansFromHast(tree);
    if (!spans.length) continue;
    // Map text offsets → (text node, offset) across the <pre>'s text nodes.
    const walker = doc.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
    const nodes: Array<{ node: Text; start: number }> = [];
    let off = 0;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      nodes.push({ node: n as Text, start: off });
      off += (n as Text).data.length;
    }
    const locate = (pos: number): [Text, number] | null => {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const { node, start } = nodes[i];
        if (pos >= start && pos <= start + node.data.length) return [node, pos - start];
      }
      return null;
    };
    for (const sp of spans) {
      const a = locate(sp.start);
      const b = locate(sp.end);
      if (!a || !b) continue;
      const range = doc.createRange();
      try {
        range.setStart(a[0], a[1]);
        range.setEnd(b[0], b[1]);
      } catch {
        continue;
      }
      const list = byClass.get(sp.cls) ?? [];
      list.push(range);
      byClass.set(sp.cls, list);
    }
  }
  for (const [cls, ranges] of byClass) {
    win.CSS.highlights.set(`jz-hl-${cls}`, new win.Highlight(...ranges));
  }
}

/** Selection / highlight rect mapped from the chapter iframe to the stage. */
function anchorFromRange(range: Range, stage: HTMLElement | null): SelectionAnchor | null {
  const doc = range.startContainer.ownerDocument;
  const frame = doc?.defaultView?.frameElement;
  if (!frame || !stage) return null;
  const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
  const bound = range.getBoundingClientRect();
  const first = rects[0] ?? bound;
  const last = rects[rects.length - 1] ?? bound;
  const fr = frame.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  return {
    x: fr.left + bound.left - sr.left,
    y: fr.top + first.top - sr.top,
    w: bound.width,
    h: Math.max(first.height, last.bottom - first.top),
  };
}

/** Milliseconds the deep-link / note-jump flash outline stays visible. */
const FLASH_MS = 1800;

/** Extra gap between the text and an underline / squiggly (the overlayer
 * draws on the rects' bottom edge, which hugs CJK descenders). */
const UNDERLINE_GAP = 3;
type DrawFn = (rects: DOMRect[] | DOMRectList, options?: Record<string, unknown>) => SVGElement;
function offsetUnderline(fn: DrawFn, vertical: boolean): DrawFn {
  return (rects, options) => {
    const shifted = Array.from(rects as ArrayLike<DOMRect>).map(
      (r) =>
        ({
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height,
          right: vertical ? r.right + UNDERLINE_GAP : r.right,
          bottom: vertical ? r.bottom : r.bottom + UNDERLINE_GAP,
        }) as DOMRect,
    );
    return fn(shifted, options);
  };
}

export default function EpubReader({
  url,
  height = 'min(calc(100vh - 200px), 1100px)',
  scroll = 'inner',
  title,
  documentId = null,
  initialCfi = null,
  kbSlug = null,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const bookRef = useRef<FoliateBook | null>(null);
  const docRef = useRef<Document | null>(null);
  const fontRulesRef = useRef<WeakMap<Document, PublisherFontRule[]>>(new WeakMap());
  const footnoteHostRef = useRef<HTMLDivElement | null>(null);
  const footnoteViewRef = useRef<FoliateView | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  /** Flattened TOC + the spine index each entry resolves to (for the
   * top-of-page active-chapter heuristic; see ``pickActiveTocId``). */
  const tocRef = useRef<EpubTocEntry[]>([]);
  const tocSectionRef = useRef<number[]>([]);
  const sectionFractionsRef = useRef<number[]>([]);
  const searchGenRef = useRef<AsyncGenerator<unknown> | null>(null);
  const railWidthRef = useRef(0);
  /** TOC entry the reader just clicked: it stays highlighted while its anchor
   * is still on the visible page (the top-of-page heuristic alone would flip
   * to the chapter title when a short section shares the chapter's first page). */
  const clickedTocRef = useRef<EpubTocEntry | null>(null);
  const prefsRef = useRef<EpubPrefs>(loadEpubPrefs());
  const turningRef = useRef(false);
  const wheelAccRef = useRef(0);
  const wheelLockRef = useRef(0);
  const chromeTimerRef = useRef<number | null>(null);
  const fullscreenRef = useRef(false);
  const presetsRef = useRef<Array<{ key: string; stack: string }>>([]);
  /* ── Highlights / notes ─────────────────────────────────────────────── */
  const authUser = useAuthStore((s) => s.user);
  /** Source of truth for overlay replay (the ``create-overlay`` listener
   * lives in the open effect and must see the latest list). */
  const highlightsRef = useRef<Highlight[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [highlightsLoaded, setHighlightsLoaded] = useState(false);
  /** Chapter label of the page in view (stored with each new highlight). */
  const chapterRef = useRef('');
  const pointerDownRef = useRef(false);
  const lastPageCfiRef = useRef('');
  const pendingFocusRef = useRef<number | null>(null);
  const [selection, setSelection] = useState<{ text: string; cfi: string; anchor: SelectionAnchor; chapter: string } | null>(null);
  const [card, setCard] = useState<{ id: number; anchor: SelectionAnchor; focusNote?: boolean } | null>(null);
  const [lastColor, setLastColor] = useState<HighlightColor>(() => loadLastHighlightColor());
  const [searchRequest, setSearchRequest] = useState<{ query: string; seq: number } | null>(null);
  const [tabRequest, setTabRequest] = useState<{ tab: EpubSideTab; seq: number } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  /* ── Bookmarks / 读完页 (批次 C) ─────────────────────────────────────── */
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarksLoaded, setBookmarksLoaded] = useState(false);
  const bookmarksRef = useRef<Bookmark[]>([]);
  const pageRangeRef = useRef<Range | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishDoneAt, setFinishDoneAt] = useState<number | null>(null);
  const [related, setRelated] = useState<PublicPost[] | null>(null);

  const [loading, setLoading] = useState(true);
  const [download, setDownload] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [bookTitle, setBookTitle] = useState('');
  const [bookAuthor, setBookAuthor] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [embedsFonts, setEmbedsFonts] = useState(false);
  const [toc, setToc] = useState<EpubTocEntry[]>([]);
  const [activeTocId, setActiveTocId] = useState<number | null>(null);
  const [progress, setProgress] = useState<FoliateRelocateDetail | null>(null);
  const [chapterPages, setChapterPages] = useState<{ page: number; pages: number } | null>(null);
  const [sliderValue, setSliderValue] = useState<number | null>(null);
  const [prefs, setPrefs] = useState<EpubPrefs>(() => prefsRef.current);
  /** Shared with the Markdown reader (same localStorage keys): body font,
   * font scale and line-height. A book and an article render alike, and a
   * change made in either place follows the reader to the other. */
  const [layout, setLayout] = useState<ReaderLayout>(() => loadReaderLayout());
  const [readerFont, setReaderFont] = useState<string>(() => {
    // One-time migration of the first EPUB batch's private font choice.
    const legacy = legacyEpubFontKey();
    if (legacy) saveArticleFont(legacy);
    return loadArticleFont();
  });
  const [railWidth, setRailWidth] = useState(() => prefsRef.current.railWidth);
  const [resizing, setResizing] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [wide, setWide] = useState(true);
  const [stageWidth, setStageWidth] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [focus, setFocus] = useState(() => typeof document !== 'undefined' && document.body.classList.contains('jz-reader-focus'));
  const [footnote, setFootnote] = useState<{ href: string } | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [wideTable, setWideTable] = useState<string | null>(null);
  const [history, setHistory] = useState({ back: false, forward: false });
  /** Bytes-per-page calibration from the sections actually rendered — drives
   * the estimated page numbers in the TOC. */
  const [calib, setCalib] = useState<PageCalibration>({ bytes: 0, pages: 0 });
  const calibSectionsRef = useRef<Set<number>>(new Set());
  const sectionSizesRef = useRef<number[]>([]);
  const [resumed, setResumed] = useState(false);
  const themeMode = useThemeStore((s) => s.mode);
  const fontPresets = useArticleFontPresets();
  railWidthRef.current = railWidth;
  prefsRef.current = prefs;
  fullscreenRef.current = fullscreen;
  presetsRef.current = fontPresets;

  // Follow changes made on an article page in another tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === 'jz-article-font') setReaderFont(loadArticleFont());
      if (!e.key || e.key.startsWith('jz-reader-')) setLayout(loadReaderLayout());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const positionKey = useMemo(() => epubPositionKey(url), [url]);
  const fetchUrl = useMemo(() => url + (url.includes('?') ? '&' : '?') + '_=' + Date.now(), [url]);

  const effectiveFlow: EpubFlow = prefs.flow === 'auto' ? defaultFlowFor(wide ? 1200 : 600) : prefs.flow;
  const columns = resolveColumns(prefs.columns, stageWidth);
  const paper = paperFor(prefs.paper);
  const popupContainer = () => wrapRef.current ?? document.body;

  /* ── Full-screen (same element, Fullscreen API) ─────────────────────── */
  useEffect(() => {
    const onChange = () => {
      const fs = document.fullscreenElement === wrapRef.current;
      setFullscreen(fs);
      setChromeHidden(false);
      viewRef.current?.toggleAttribute('autohide-cursor', fs);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) void document.exitFullscreen?.();
    else void el.requestFullscreen?.();
  };
  /** Show the chrome and re-arm the idle timer (full-screen only). */
  const pokeChrome = useCallback(() => {
    if (!fullscreenRef.current) return;
    setChromeHidden(false);
    if (chromeTimerRef.current) window.clearTimeout(chromeTimerRef.current);
    chromeTimerRef.current = window.setTimeout(() => {
      // Keep the chrome while a popup (settings / select) is open in it.
      if (wrapRef.current?.querySelector('.ant-popover:not(.ant-popover-hidden), .ant-select-open')) return;
      setChromeHidden(true);
    }, CHROME_IDLE_MS);
  }, []);
  useEffect(() => {
    if (!fullscreen) {
      if (chromeTimerRef.current) window.clearTimeout(chromeTimerRef.current);
      setChromeHidden(false);
      return;
    }
    pokeChrome();
    return () => {
      if (chromeTimerRef.current) window.clearTimeout(chromeTimerRef.current);
    };
  }, [fullscreen, pokeChrome]);

  /* ── Width tracking (rail vs. drawer, auto flow, auto columns) ──────── */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWide(el.clientWidth >= RAIL_MIN_WIDTH);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => setStageWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── Focus mode (reading page hides its chrome → the book gets the room) ── */
  useEffect(() => {
    if (scroll !== 'page') return;
    const mo = new MutationObserver(() => setFocus(document.body.classList.contains('jz-reader-focus')));
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, [scroll]);

  /* ── User stylesheet: theme colours + typography ─────────────────────── */
  const applyStyles = useCallback(() => {
    const view = viewRef.current;
    const host = wrapRef.current;
    if (!view?.renderer || !host) return;
    const cs = getComputedStyle(host);
    const read = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    const themeDark = !isLightTheme(themeMode);
    const dark = paper.bg ? paper.dark : themeDark;
    // The article reader's font (same stack the .markdown-preview body uses).
    const fontFamily = prefs.publisherFont ? null : stackFor(readerFont);
    // Books size like articles: --jz-fs-read (16.5px) × the shared reader scale.
    const baseFontPx = parseFloat(read('--jz-fs-read', '16.5px')) || 16.5;
    const roles = { kai: FONT_STACK_KAI, hei: FONT_STACK_SANS, mono: FONT_STACK_MONO };
    const css = buildEpubUserCss({
      // Opaque pre-composited surface; --jz-surface is translucent glass.
      bg: paper.bg ?? read('--jz-cell-surface', read('--jz-surface', themeDark ? '#14161b' : '#fdfbf7')),
      fg: paper.fg ?? read('--jz-text', themeDark ? '#e6e6e6' : '#222'),
      accent: read('--jz-accent', '#02b377'),
      muted: paper.bg ? (paper.dark ? '#8a8f99' : '#7a7368') : read('--jz-text-muted', '#888'),
      dark,
      fontFamily,
      roles,
      baseFontPx,
      fontScale: layout.fontScale,
      lineHeight: layout.lineHeight,
      justify: prefs.justify,
      indent: prefs.indent,
    });
    view.renderer.setStyles(css);
    footnoteViewRef.current?.renderer?.setStyles?.(css);
    // Per-chapter role mapping: publisher families → site stacks (only while
    // the body font is overridden; "出版社原样" leaves every face alone).
    const doc = docRef.current;
    if (doc?.head) {
      let el = doc.head.querySelector<HTMLStyleElement>('style[data-jz="font-map"]');
      if (!el) {
        el = doc.createElement('style');
        el.setAttribute('data-jz', 'font-map');
        doc.head.append(el);
      }
      if (fontFamily) {
        let rules = fontRulesRef.current.get(doc);
        if (!rules) {
          rules = harvestPublisherFontRules(doc);
          fontRulesRef.current.set(doc, rules);
        }
        el.textContent = buildFontMappingCss(rules, { body: fontFamily, ...roles });
      } else {
        el.textContent = '';
      }
    }
  }, [themeMode, prefs, paper, layout, readerFont]);

  const applyLayout = useCallback(() => {
    const r = viewRef.current?.renderer;
    if (!r) return;
    r.setAttribute('flow', effectiveFlow);
    r.setAttribute('gap', GAP);
    r.setAttribute('margin', `${MARGIN_PX}px`);
    r.setAttribute('max-inline-size', `${MAX_INLINE_SIZE_PX}px`);
    r.setAttribute('max-column-count', String(columns));
    // foliate's own scroll animation is only the fallback for browsers without
    // View Transitions; with VT the turn is animated by the snapshot pair.
    const nativeSlide = prefs.turn !== 'none' && !supportsViewTransitions() && decorativeMotionEnabled();
    if (nativeSlide) r.setAttribute('animated', '');
    else r.removeAttribute('animated');
  }, [effectiveFlow, columns, prefs.turn]);

  useEffect(() => {
    applyStyles();
  }, [applyStyles]);
  useEffect(() => {
    applyLayout();
  }, [applyLayout]);

  /* ── Page-turn animation (View Transitions) ─────────────────────────── */
  const withTurn = useCallback((dir: Turn, fn: () => Promise<unknown> | unknown) => {
    const anim: EpubTurn = prefsRef.current.turn;
    const stage = stageRef.current;
    const scrolled = viewRef.current?.renderer?.getAttribute('flow') === 'scrolled';
    if (anim === 'none' || scrolled || !stage || !supportsViewTransitions() || prefersReducedMotion() || turningRef.current) {
      void fn();
      return;
    }
    const root = document.documentElement;
    const startVT = (document as Document & { startViewTransition: (cb: () => Promise<void>) => { finished: Promise<void> } })
      .startViewTransition;
    turningRef.current = true;
    stage.style.viewTransitionName = 'jz-epub-page';
    root.dataset.jzTurn = dir === 'jump' ? 'fade' : anim;
    root.dataset.jzTurnDir = dir;
    const done = () => {
      stage.style.viewTransitionName = '';
      delete root.dataset.jzTurn;
      delete root.dataset.jzTurnDir;
      turningRef.current = false;
    };
    try {
      const vt = startVT.call(document, async () => {
        await fn();
      });
      vt.finished.then(done, done);
    } catch {
      done();
      void fn();
    }
  }, []);
  const turnNext = useCallback(() => withTurn('next', () => viewRef.current?.goRight()), [withTurn]);
  const turnPrev = useCallback(() => withTurn('prev', () => viewRef.current?.goLeft()), [withTurn]);
  const jumpTo = useCallback((target: string | number | { fraction: number }) => withTurn('jump', () => viewRef.current?.goTo(target)), [withTurn]);

  /* ── Running heads / feet ───────────────────────────────────────────── */
  const updateMarginals = useCallback(
    (detail: FoliateRelocateDetail) => {
      const r = viewRef.current?.renderer;
      if (!r) return;
      const chapter = (detail.tocItem?.label ?? '').trim();
      const pct = `${Math.round((detail.fraction ?? 0) * 100)}%`;
      const heads = r.heads ?? [];
      const feet = r.feet ?? [];
      const page = typeof r.page === 'number' ? r.page : null;
      const pages = typeof r.pages === 'number' && r.pages > 2 ? r.pages - 2 : null;
      const pageText = page != null && pages != null ? `本章 ${Math.min(Math.max(page, 1), pages)} / ${pages} 页` : '';
      const left = formatMinutes(detail.time?.section);
      heads.forEach((el, i) => {
        el.textContent = heads.length > 1 ? (i === 0 ? bookTitle || title || '' : chapter) : chapter || bookTitle || '';
      });
      feet.forEach((el, i) => {
        const right = [pct, left ? `本章剩约 ${left}` : ''].filter(Boolean).join(' · ');
        el.textContent = feet.length > 1 ? (i === 0 ? pageText : right) : [pageText, right].filter(Boolean).join(' · ');
      });
      setChapterPages(page != null && pages != null ? { page: Math.min(Math.max(page, 1), pages), pages } : null);
      const idx = detail.section?.current;
      if (pages != null && typeof idx === 'number' && !calibSectionsRef.current.has(idx)) {
        const size = sectionSizesRef.current[idx] ?? 0;
        if (size > 0) {
          calibSectionsRef.current.add(idx);
          setCalib((c) => addCalibration(c, size, pages));
        }
      }
    },
    [bookTitle, title],
  );

  /* ── Open the book ──────────────────────────────────────────────────── */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let coverObjectUrl: string | null = null;
    setLoading(true);
    setDownload(null);
    setErr(null);
    setProgress(null);
    setChapterPages(null);
    setToc([]);
    setActiveTocId(null);
    setResumed(false);
    setFootnote(null);
    setLightbox(null);
    setWideTable(null);
    setHistory({ back: false, forward: false });

    const view = document.createElement('foliate-view') as FoliateView;
    view.className = 'jz-epub-view';
    if (fullscreenRef.current) view.setAttribute('autohide-cursor', '');
    host.replaceChildren(view);
    viewRef.current = view;

    const footnotes = new FootnoteHandler();
    footnotes.addEventListener('before-render', (e) => {
      const { view: fv } = (e as CustomEvent<{ view: FoliateView }>).detail;
      fv.addEventListener('load', (le) => injectSiteFonts((le as CustomEvent<{ doc: Document }>).detail.doc));
      fv.renderer.setAttribute('flow', 'scrolled');
      fv.renderer.setAttribute('gap', '4%');
      fv.renderer.setAttribute('margin', '8px');
      fv.renderer.setAttribute('max-inline-size', '600px');
    });
    footnotes.addEventListener('render', (e) => {
      const detail = (e as CustomEvent<FootnoteRenderDetail>).detail;
      const fhost = footnoteHostRef.current;
      if (!fhost || cancelled) return;
      footnoteViewRef.current?.close();
      footnoteViewRef.current = detail.view;
      detail.view.className = 'jz-epub-footnote-view';
      fhost.replaceChildren(detail.view);
      setFootnote({ href: detail.href });
      requestAnimationFrame(() => applyStyles());
    });

    // Top-of-page chapter: compare each of this section's TOC anchors with the
    // visible range start. foliate's tocItem is only the fallback.
    const resolveActiveToc = (detail: FoliateRelocateDetail): number | null => {
      const fallback = typeof detail.tocItem?.id === 'number' ? detail.tocItem.id : null;
      const book = bookRef.current;
      const range = detail.range;
      const index = detail.section?.current;
      if (!book || !range || typeof index !== 'number') return fallback;
      const doc = range.startContainer.ownerDocument;
      if (!doc) return fallback;
      const clicked = clickedTocRef.current;
      if (clicked) {
        const ci = tocRef.current.indexOf(clicked);
        let keep = false;
        if (ci >= 0 && tocSectionRef.current[ci] === index && clicked.href) {
          try {
            const target = book.resolveHref(clicked.href).anchor(doc);
            if (target) {
              const node = target instanceof Range ? target.startContainer : target;
              const offset = target instanceof Range ? target.startOffset : 0;
              keep = range.comparePoint(node, offset) === 0;
            }
          } catch {
            keep = false;
          }
        }
        if (keep && clicked.id != null) return clicked.id;
        clickedTocRef.current = null;
      }
      const compare = (entry: EpubTocEntry): number | null => {
        if (!entry.href) return null;
        try {
          const target = book.resolveHref(entry.href).anchor(doc);
          if (!target) return null;
          const probe = doc.createRange();
          if (target instanceof Range) probe.setStart(target.startContainer, target.startOffset);
          else probe.setStartBefore(target);
          probe.collapse(true);
          return probe.compareBoundaryPoints(Range.START_TO_START, range);
        } catch {
          return null;
        }
      };
      return pickActiveTocId(tocRef.current, tocSectionRef.current, index, compare, fallback);
    };

    const onRelocate = (e: Event) => {
      const detail = (e as CustomEvent<FoliateRelocateDetail>).detail;
      if (cancelled) return;
      setLoading(false);
      setProgress(detail);
      setSliderValue(null);
      const activeId = resolveActiveToc(detail);
      setActiveTocId(activeId);
      chapterRef.current = (tocRef.current.find((en) => en.id === activeId)?.title ?? detail.tocItem?.label ?? '').trim();
      pageRangeRef.current = detail.range ?? null;
      // The paginator relocates several times after a chapter loads (fonts,
      // ResizeObserver); only a real page change drops the selection bar,
      // and an open card follows its highlight instead of closing.
      if (detail.cfi !== lastPageCfiRef.current) {
        lastPageCfiRef.current = detail.cfi;
        setSelection(null);
      }
      refreshCard();
      updateMarginals(detail);
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        saveEpubPosition(positionKey, { cfi: detail.cfi, fraction: detail.fraction ?? 0 });
      }, 400);
    };

    /** Re-anchor the open card to its highlight in the rendered chapter, or
     * close it when the highlight is off-page / in another chapter. */
    const refreshCard = () => {
      setCard((prev) => {
        if (!prev) return prev;
        const h = highlightsRef.current.find((x) => x.id === prev.id);
        const content = view.renderer?.getContents?.()[0];
        const stage = stageRef.current;
        if (!h || !content?.doc || !stage) return null;
        try {
          const { index, anchor } = view.resolveCFI(h.cfi);
          if (index !== content.index) return null;
          const r = anchor(content.doc);
          if (!(r instanceof Range)) return null;
          const a = anchorFromRange(r, stage);
          if (!a) return null;
          if (a.y + a.h < 0 || a.y > stage.clientHeight || a.x + a.w < 0 || a.x > stage.clientWidth) return null;
          return { ...prev, anchor: a };
        } catch {
          return null;
        }
      });
    };

    const onHistory = () => {
      if (cancelled) return;
      setHistory({ back: !!view.history?.canGoBack, forward: !!view.history?.canGoForward });
    };

    const keyNav = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Escape') {
        // Closes the selection bar / highlight card wherever focus sits
        // (segmented tab inputs, the note field, the chapter iframe).
        setSelection(null);
        setCard(null);
        return;
      }
      if (isTypingTarget(e.target)) return;
      const v = viewRef.current;
      if (!v) return;
      const r = v.renderer;
      switch (e.key) {
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          if (e.shiftKey) withTurn('jump', () => r.prevSection?.());
          else turnPrev();
          break;
        case 'ArrowRight':
        case 'PageDown':
          e.preventDefault();
          if (e.shiftKey) withTurn('jump', () => r.nextSection?.());
          else turnNext();
          break;
        case ' ':
          e.preventDefault();
          if (e.shiftKey) withTurn('prev', () => v.prev());
          else withTurn('next', () => v.next());
          break;
        case 'Home':
          e.preventDefault();
          withTurn('jump', () => r.firstSection?.());
          break;
        case 'End':
          e.preventDefault();
          withTurn('jump', () => r.lastSection?.());
          break;
        default:
      }
    };

    const copyPre = (pre: HTMLElement) => {
      const text = pre.textContent ?? '';
      const mark = () => {
        pre.setAttribute('data-jz-copied', '');
        window.setTimeout(() => pre.removeAttribute('data-jz-copied'), 1500);
      };
      const fallbackCopy = () => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.append(ta);
        ta.select();
        try {
          if (document.execCommand('copy')) mark();
        } finally {
          ta.remove();
        }
      };
      // The click happened inside the chapter iframe, so *that* document holds
      // focus and the user activation — the parent's clipboard call would be
      // rejected with "Document is not focused". Same-origin blob: frame, so
      // its navigator.clipboard is ours to use; parent + execCommand fall back.
      const frameClipboard = pre.ownerDocument.defaultView?.navigator.clipboard;
      const attempt = (clip: Clipboard | undefined, next: () => void) => {
        if (clip?.writeText) clip.writeText(text).then(mark, next);
        else next();
      };
      attempt(frameClipboard, () => attempt(navigator.clipboard, fallbackCopy));
    };

    const onWheel = (ev: WheelEvent) => {
      const v = viewRef.current;
      if (!v || v.renderer.getAttribute('flow') === 'scrolled') return;
      if (ev.ctrlKey) return; // pinch-zoom gesture
      const now = performance.now();
      if (now < wheelLockRef.current) return;
      const delta = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
      wheelAccRef.current += delta;
      if (Math.abs(wheelAccRef.current) < WHEEL_THRESHOLD) return;
      const dir = wheelAccRef.current > 0 ? 1 : -1;
      wheelAccRef.current = 0;
      wheelLockRef.current = now + WHEEL_LOCK_MS;
      if (dir > 0) turnNext();
      else turnPrev();
    };

    const onLoad = (e: Event) => {
      const { doc, index } = (e as CustomEvent<{ doc: Document; index: number }>).detail;
      docRef.current = doc;
      injectSiteFonts(doc);
      normalizeChapter(doc);
      // Style slots exist now; (re)write the role mapping for this chapter.
      applyStyles();
      void highlightChapterCode(doc);
      doc.addEventListener('keydown', keyNav);
      doc.addEventListener('wheel', onWheel, { passive: true });
      doc.addEventListener('mousemove', pokeChrome, { passive: true });
      // Text selection → floating bar. The selection lives in the chapter
      // document (the parent never sees it), so listen there and map the
      // range rect through the iframe element. Debounced: selectionchange
      // fires per character while dragging; the bar appears on release.
      let selTimer = 0;
      const readSelection = () => {
        window.clearTimeout(selTimer);
        selTimer = window.setTimeout(() => {
          if (cancelled || pointerDownRef.current) return;
          const sel = doc.getSelection();
          const raw = sel?.toString() ?? '';
          if (!sel || sel.isCollapsed || !raw.trim()) {
            setSelection(null);
            return;
          }
          const range = sel.getRangeAt(0);
          const anchor = anchorFromRange(range, stageRef.current);
          if (!anchor) return;
          let cfi = '';
          let chapter = '';
          try {
            cfi = view.getCFI(index, range);
            // Chapter of the *selection* (a spine section can hold several
            // TOC entries), falling back to the page-top chapter.
            chapter = (view.getProgressOf?.(index, range)?.tocItem?.label ?? '').trim();
          } catch {
            cfi = '';
          }
          setCard(null);
          setSelection({ text: normalizeSelectionText(raw), cfi, anchor, chapter: chapter || chapterRef.current });
        }, 160);
      };
      doc.addEventListener('selectionchange', readSelection);
      doc.addEventListener('pointerdown', () => {
        pointerDownRef.current = true;
      });
      doc.addEventListener('pointerup', () => {
        pointerDownRef.current = false;
        readSelection();
      });
      doc.addEventListener('pointercancel', () => {
        pointerDownRef.current = false;
      });
      doc.addEventListener('click', (ev) => {
        const target = ev.target as Element | null;
        // A click on an existing highlight is foliate's (``show-annotation``
        // opens the card); anywhere else closes it and never turns the page.
        const overlayer = view.renderer?.getContents?.()[0]?.overlayer as Overlayer | undefined;
        const [hitKey] = overlayer?.hitTest?.(ev) ?? [];
        if (hitKey) return;
        setCard(null);
        // Code block: the pseudo-element "复制" button lives in the top-right
        // corner; a click landing there copies the block.
        const pre = target?.closest?.('pre') as HTMLElement | null;
        if (pre) {
          const r = pre.getBoundingClientRect();
          if (ev.clientX >= r.right - COPY_ZONE.w && ev.clientY <= r.top + COPY_ZONE.h) {
            ev.preventDefault();
            copyPre(pre);
            return;
          }
        }
        const table = target?.closest?.('table[data-jz-wide]');
        if (table) {
          ev.preventDefault();
          setWideTable(sanitizeHtml(table.outerHTML));
          return;
        }
        const img = target?.closest?.('img');
        if (img && !img.closest('a')) {
          // Zoom the illustration in the parent page (blob: URL is same-origin).
          ev.preventDefault();
          const src = (img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src;
          if (src) setLightbox(src);
          return;
        }
        const v = viewRef.current;
        const hostEl = hostRef.current;
        if (!v || !hostEl) return;
        if (target?.closest?.('a, button, input, textarea, select, audio, video')) return;
        if (doc.getSelection()?.toString()) return;
        const frame = doc.defaultView?.frameElement;
        if (!frame) return;
        const fr = frame.getBoundingClientRect();
        const hr = hostEl.getBoundingClientRect();
        const x = (fr.left + ev.clientX - hr.left) / hr.width;
        if (v.renderer.getAttribute('flow') === 'scrolled') {
          if (fullscreenRef.current) setChromeHidden((h) => !h);
          return;
        }
        // Edge taps turn pages in paginated mode (Apple Books / Readest). The
        // iframe's clientX is in its own (column-scrolled) space, so map through
        // frameElement to the host's viewport box. Centre taps toggle the
        // full-screen chrome.
        if (x < EDGE_TURN_FRACTION) turnPrev();
        else if (x > 1 - EDGE_TURN_FRACTION) turnNext();
        else if (fullscreenRef.current) setChromeHidden((h) => !h);
      });
    };

    const onLink = (e: Event) => {
      const book = bookRef.current;
      if (!book) return;
      footnotes.handle(book, e as CustomEvent)?.catch(() => {
        /* not a footnote after all — default navigation already ran */
      });
    };

    // ── Highlights: replay per chapter, draw by colour/style, open the card
    // on click. foliate keeps one chapter alive at a time and recreates the
    // overlay on every chapter load, so the host replays from its own list.
    const annoOf = (h: Highlight): FoliateAnnotation => ({ value: h.cfi, id: h.id, color: h.color, style: h.style });
    const onCreateOverlay = () => {
      for (const h of highlightsRef.current) view.addAnnotation(annoOf(h)).catch(() => undefined);
    };
    const onDrawAnnotation = (e: Event) => {
      const { draw, annotation, doc } = (e as CustomEvent<FoliateDrawAnnotationDetail>).detail;
      if (annotation.kind === 'flash') {
        const accent = getComputedStyle(wrapRef.current ?? document.documentElement).getPropertyValue('--jz-accent').trim() || '#10b981';
        draw(Overlayer.outline, { color: accent, width: 3, radius: 4 });
        return;
      }
      const color = swatchHex(String(annotation.color ?? ''));
      if (annotation.style === 'underline' || annotation.style === 'squiggly') {
        const writingMode = doc?.body ? getComputedStyle(doc.body).writingMode : undefined;
        const vertical = writingMode === 'vertical-rl' || writingMode === 'vertical-lr';
        const base = annotation.style === 'squiggly' ? Overlayer.squiggly : Overlayer.underline;
        draw(offsetUnderline(base, vertical), { color, width: 2, writingMode });
      } else draw(Overlayer.highlight, { color });
    };
    const onShowAnnotation = (e: Event) => {
      const { value, range } = (e as CustomEvent<FoliateShowAnnotationDetail>).detail;
      if (cancelled) return;
      const h = highlightsRef.current.find((x) => x.cfi === value);
      if (!h) return;
      const anchor = anchorFromRange(range, stageRef.current);
      if (!anchor) return;
      setSelection(null);
      setCard({ id: h.id, anchor, focusNote: pendingFocusRef.current === h.id });
      pendingFocusRef.current = null;
    };
    view.addEventListener('create-overlay', onCreateOverlay);
    view.addEventListener('draw-annotation', onDrawAnnotation);
    view.addEventListener('show-annotation', onShowAnnotation);
    view.addEventListener('relocate', onRelocate);
    view.addEventListener('load', onLoad);
    view.addEventListener('link', onLink);
    view.history?.addEventListener('index-change', onHistory);
    window.addEventListener('keydown', keyNav);

    (async () => {
      try {
        const resp = await fetch(fetchUrl, { credentials: 'include' });
        if (cancelled) return;
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        // Stream so a 30 MB book shows download progress instead of a blank spinner.
        let blob: Blob;
        const total = Number(resp.headers.get('content-length')) || 0;
        if (resp.body && total > 0) {
          const reader = resp.body.getReader();
          const chunks: Uint8Array[] = [];
          let received = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (cancelled) {
              await reader.cancel();
              return;
            }
            chunks.push(value);
            received += value.byteLength;
            setDownload(Math.min(99, Math.round((received / total) * 100)));
          }
          blob = new Blob(chunks as BlobPart[], { type: 'application/epub+zip' });
        } else {
          blob = await resp.blob();
        }
        if (cancelled) return;
        setDownload(null);
        if (blob.size === 0) throw new Error('服务器返回空内容，请刷新重试');
        const name = decodeURIComponent(url.split('?')[0].split('/').pop() || 'book.epub');
        const file = new File([blob], name, { type: 'application/epub+zip' });
        await view.open(file);
        if (cancelled) return;
        const book = view.book;
        bookRef.current = book;
        // Defence in depth: the backend scrubs at upload; scrub again here for
        // books stored before that existed.
        book.transformTarget?.addEventListener('data', (ev) => {
          const d = (ev as CustomEvent<{ data: unknown; type: string; name: string }>).detail;
          if (/html|xml/i.test(d.type) && !/svg/i.test(d.type)) {
            d.data = Promise.resolve(d.data).then((x) => (typeof x === 'string' ? stripEpubScripts(x) : x));
          }
        });
        setBookTitle(languageMapText(book.metadata?.title));
        setBookAuthor(contributorsText(book.metadata?.author));
        setEmbedsFonts(bookEmbedsFonts(book.resources?.manifest));
        const entries = flattenEpubToc(book.toc);
        tocRef.current = entries;
        tocSectionRef.current = entries.map((en) => {
          if (!en.href) return -1;
          try {
            return book.resolveHref(en.href).index;
          } catch {
            return -1;
          }
        });
        setToc(entries);
        sectionFractionsRef.current = view.getSectionFractions();
        sectionSizesRef.current = book.sections.map((sec) => (sec.linear !== 'no' && sec.size > 0 ? sec.size : 0));
        calibSectionsRef.current = new Set();
        setCalib({ bytes: 0, pages: 0 });
        book
          .getCover?.()
          .then((c) => {
            if (cancelled || !c) return;
            coverObjectUrl = URL.createObjectURL(c);
            setCoverUrl(coverObjectUrl);
          })
          .catch(() => undefined);

        applyLayout();
        applyStyles();

        const saved = loadEpubPosition(positionKey);
        const deepLink = initialCfi && /^epubcfi\(/.test(initialCfi) ? initialCfi : null;
        await view.init({ lastLocation: deepLink ?? saved?.cfi ?? null });
        if (cancelled) return;
        if (deepLink) {
          flashCfi(deepLink);
        } else if (saved) {
          const got = view.lastLocation?.fraction ?? 0;
          if (Math.abs(got - saved.fraction) > 0.03) await view.goToFraction(saved.fraction);
          setResumed(true);
        }
        onHistory();
        setLoading(false);
      } catch (e: unknown) {
        if (cancelled) return;
        setErr((e as Error)?.message || 'EPUB 加载失败');
        setLoading(false);
        setDownload(null);
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', keyNav);
      view.removeEventListener('create-overlay', onCreateOverlay);
      view.removeEventListener('draw-annotation', onDrawAnnotation);
      view.removeEventListener('show-annotation', onShowAnnotation);
      view.removeEventListener('relocate', onRelocate);
      view.removeEventListener('load', onLoad);
      view.removeEventListener('link', onLink);
      view.history?.removeEventListener('index-change', onHistory);
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      searchGenRef.current?.return?.(undefined);
      footnoteViewRef.current?.close();
      footnoteViewRef.current = null;
      try {
        view.close();
      } catch {
        /* never opened */
      }
      view.remove();
      viewRef.current = null;
      bookRef.current = null;
      docRef.current = null;
      tocRef.current = [];
      tocSectionRef.current = [];
      sectionFractionsRef.current = [];
      clickedTocRef.current = null;
      if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
      setCoverUrl(null);
    };
    // Re-open only when the URL changes; style/layout effects handle the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUrl]);

  /* ── Highlights: load + replay ──────────────────────────────────────── */
  const annoFor = (h: Highlight): FoliateAnnotation => ({ value: h.cfi, id: h.id, color: h.color, style: h.style });
  /** The view only resolves CFIs once a book is open; before that (list
   * fetched first) the ``create-overlay`` replay covers it. */
  const openView = () => {
    const v = viewRef.current;
    return v?.book ? v : null;
  };
  const drawHighlight = (h: Highlight) => openView()?.addAnnotation(annoFor(h)).catch(() => undefined);
  const undrawHighlight = (h: Highlight) => openView()?.deleteAnnotation(annoFor(h)).catch(() => undefined);
  const commitHighlights = (next: Highlight[]) => {
    highlightsRef.current = next;
    setHighlights(next);
  };
  /** Outline ``cfi`` briefly (deep link / note jump). The overlay key is the
   * CFI itself, so a highlight at the same CFI is redrawn afterwards. */
  const flashCfi = (cfi: string) => {
    const v = openView();
    if (!v) return;
    const anno: FoliateAnnotation = { value: cfi, kind: 'flash' };
    v.addAnnotation(anno).catch(() => undefined);
    window.setTimeout(() => {
      const cur = viewRef.current;
      if (cur !== v) return;
      v.deleteAnnotation(anno).catch(() => undefined);
      const h = highlightsRef.current.find((x) => x.cfi === cfi);
      if (h) void drawHighlight(h);
    }, FLASH_MS);
  };

  const userId = authUser?.id ?? null;
  useEffect(() => {
    commitHighlights([]);
    setHighlightsLoaded(false);
    setCard(null);
    if (!documentId || !userId) return;
    let cancelled = false;
    listHighlights(documentId)
      .then((list) => {
        if (cancelled) return;
        commitHighlights(list);
        setHighlightsLoaded(true);
        // The current chapter's overlay may already exist (book opened first).
        for (const h of list) void drawHighlight(h);
      })
      .catch(() => {
        if (!cancelled) setHighlightsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, userId, fetchUrl]);

  const commitBookmarks = (next: Bookmark[]) => {
    bookmarksRef.current = next;
    setBookmarks(next);
  };
  useEffect(() => {
    commitBookmarks([]);
    setBookmarksLoaded(false);
    setFinishOpen(false);
    setRelated(null);
    if (!documentId || !userId) return;
    let cancelled = false;
    listBookmarks(documentId)
      .then((list) => {
        if (cancelled) return;
        commitBookmarks(list);
        setBookmarksLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setBookmarksLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, userId, fetchUrl]);

  // Auto-open the rail on wide layouts once the TOC is known (like PdfCanvas).
  useEffect(() => {
    if (toc.length === 0) return;
    setSideOpen(wide);
  }, [toc.length, wide]);

  // Keep running heads in sync when the title arrives after the first relocate.
  useEffect(() => {
    if (progress) updateMarginals(progress);
  }, [bookTitle, progress, updateMarginals]);

  /* ── Handlers ───────────────────────────────────────────────────────── */
  const updatePrefs = (patch: Partial<EpubPrefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      saveEpubPrefs(next);
      return next;
    });
  };
  const updateLayout = (patch: Partial<ReaderLayout>) => {
    setLayout((l) => {
      const next = { ...l, ...patch };
      saveReaderLayout(next);
      return next;
    });
  };
  const chooseFont = (key: string) => {
    if (key === 'publisher') {
      updatePrefs({ publisherFont: true });
      return;
    }
    saveArticleFont(key);
    setReaderFont(key);
    if (prefs.publisherFont) updatePrefs({ publisherFont: false });
  };
  const resetPrefs = () => {
    const next = { ...DEFAULT_EPUB_PREFS, railWidth };
    setPrefs(next);
    saveEpubPrefs(next);
    // Shared with the article reader: size / line-height back to the defaults,
    // font back to the first preset (same as the article page's reset).
    const lay = loadReaderLayout();
    updateLayout({ fontScale: 1, lineHeight: LINE_HEIGHT_OPTIONS[1].value, measure: lay.measure, longImageLimit: lay.longImageLimit });
    chooseFont(ARTICLE_FONT_PRESETS[0].key);
  };
  const jumpHref = (href: string) => {
    clickedTocRef.current = tocRef.current.find((e) => e.href === href) ?? null;
    jumpTo(href);
    if (!wide) setSideOpen(false);
  };
  const jumpCfi = (cfi: string) => {
    jumpTo(cfi);
    if (!wide) setSideOpen(false);
  };
  const closeFootnote = () => {
    footnoteViewRef.current?.close();
    footnoteViewRef.current = null;
    footnoteHostRef.current?.replaceChildren();
    setFootnote(null);
  };
  const runSearch = async (query: string, push: (g: EpubSearchGroup) => void) => {
    const view = viewRef.current;
    if (!view) return;
    searchGenRef.current?.return?.(undefined);
    // Hits outline in the site accent instead of foliate's default red.
    const accent = getComputedStyle(wrapRef.current ?? document.documentElement).getPropertyValue('--jz-accent').trim() || '#10b981';
    const gen = view.search({ query, matchCase: false, matchDiacritics: false, matchWholeWords: false, drawOptions: { color: accent } });
    searchGenRef.current = gen;
    try {
      for await (const r of gen) {
        if (r === 'done') break;
        if (r.subitems?.length) {
          push({
            label: r.label ?? '',
            hits: r.subitems.map((s) => ({ cfi: s.cfi, pre: s.excerpt.pre, match: s.excerpt.match, post: s.excerpt.post })),
          });
        }
      }
    } finally {
      if (searchGenRef.current === gen) searchGenRef.current = null;
    }
  };
  const clearSearch = () => {
    searchGenRef.current?.return?.(undefined);
    searchGenRef.current = null;
    viewRef.current?.clearSearch();
  };

  const jumpSearchHit = (cfi: string) => {
    jumpCfi(cfi);
    flashCfi(cfi);
  };

  const pageBookmark = progress?.cfi ? bookmarks.find((b) => b.cfi === progress.cfi) ?? null : null;
  const toggleBookmark = async () => {
    if (!documentId || !progress?.cfi) return;
    const existing = pageBookmark;
    if (existing) {
      commitBookmarks(bookmarksRef.current.filter((b) => b.id !== existing.id));
      try {
        await deleteBookmark(existing.id);
      } catch {
        commitBookmarks([...bookmarksRef.current, existing]);
        message.error('删除书签失败');
      }
      return;
    }
    const excerpt = (pageRangeRef.current?.toString() ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
    try {
      const b = await createBookmark(documentId, { cfi: progress.cfi, chapter: chapterRef.current.slice(0, 200), excerpt });
      if (!bookmarksRef.current.some((x) => x.id === b.id)) commitBookmarks([...bookmarksRef.current, b]);
    } catch {
      message.error('书签保存失败');
    }
  };
  const removeBookmark = async (b: Bookmark) => {
    commitBookmarks(bookmarksRef.current.filter((x) => x.id !== b.id));
    try {
      await deleteBookmark(b.id);
    } catch {
      commitBookmarks([...bookmarksRef.current, b]);
      message.error('删除书签失败');
    }
  };

  /** First TOC entry of a later spine section — the 章末卡 headline. */
  const nextChapterTitle = useMemo(() => {
    const cur = progress?.section?.current;
    if (cur == null) return '';
    let best: { sec: number; title: string } | null = null;
    tocRef.current.forEach((en, i) => {
      const sec = tocSectionRef.current[i];
      if (sec > cur && (best == null || sec < best.sec)) best = { sec, title: en.title };
    });
    return (best as { sec: number; title: string } | null)?.title ?? '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  const openFinish = () => {
    setFinishDoneAt(markEpubDone(positionKey));
    setFinishOpen(true);
    if (related === null) {
      if (kbSlug) {
        listPublicPosts({ kb: kbSlug, doc_format: 'epub' })
          .then((list) => setRelated(list.filter((p) => p.id !== documentId).slice(0, 6)))
          .catch(() => setRelated([]));
      } else setRelated([]);
    }
  };

  /* ── Selection bar / highlight card actions ─────────────────────────── */
  const canHighlight = !!documentId && !!userId && !viewRef.current?.isFixedLayout;
  const bookTitleText = bookTitle || title || '';
  const copyText = async (text: string, ok = '已复制') => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(ok);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.append(ta);
      ta.select();
      try {
        if (document.execCommand('copy')) message.success(ok);
        else message.error('复制失败');
      } finally {
        ta.remove();
      }
    }
  };
  const quoteOf = (text: string, cfi: string, chapter = chapterRef.current) =>
    buildQuoteMarkdown(text, { title: bookTitleText, author: bookAuthor, chapter, docId: documentId, cfi });
  const finishSelection = () => {
    viewRef.current?.deselect();
    setSelection(null);
  };
  const addHighlight = async (color: HighlightColor, style: HighlightStyle, withNote = false) => {
    if (!selection || !documentId) return;
    if (!selection.cfi) {
      message.error('无法定位这段文字');
      return;
    }
    const anchor = selection.anchor;
    try {
      const h = await createHighlight(documentId, {
        cfi: selection.cfi,
        text: selection.text,
        chapter: selection.chapter.slice(0, 200),
        color,
        style,
      });
      if (highlightsRef.current.length === 0) setTabRequest({ tab: 'notes', seq: Date.now() });
      commitHighlights([...highlightsRef.current, h]);
      saveLastHighlightColor(color);
      setLastColor(color);
      finishSelection();
      await drawHighlight(h);
      if (withNote) setCard({ id: h.id, anchor, focusNote: true });
    } catch {
      message.error('划线保存失败');
    }
  };
  const patchHighlight = async (id: number, patch: { color?: HighlightColor; style?: HighlightStyle; note?: string }) => {
    const cur = highlightsRef.current.find((h) => h.id === id);
    if (!cur) return;
    const next = { ...cur, ...patch };
    commitHighlights(highlightsRef.current.map((h) => (h.id === id ? next : h)));
    if (patch.color || patch.style) {
      await undrawHighlight(cur);
      await drawHighlight(next);
    }
    try {
      const saved = await updateHighlight(id, patch);
      commitHighlights(highlightsRef.current.map((h) => (h.id === id ? saved : h)));
    } catch {
      commitHighlights(highlightsRef.current.map((h) => (h.id === id ? cur : h)));
      if (patch.color || patch.style) {
        await undrawHighlight(next);
        await drawHighlight(cur);
      }
      message.error('保存失败');
    }
  };
  const removeHighlight = async (id: number) => {
    const cur = highlightsRef.current.find((h) => h.id === id);
    if (!cur) return;
    setCard(null);
    commitHighlights(highlightsRef.current.filter((h) => h.id !== id));
    await undrawHighlight(cur);
    try {
      await deleteHighlight(id);
    } catch {
      commitHighlights([...highlightsRef.current, cur]);
      await drawHighlight(cur);
      message.error('删除失败');
    }
  };
  const openHighlight = (h: Highlight) => {
    pendingFocusRef.current = null;
    withTurn('jump', () => openView()?.showAnnotation(annoFor(h)).catch(() => undefined));
    if (!wide) setSideOpen(false);
  };
  const commentHighlight = async (h: Highlight) => {
    if (!documentId) return;
    try {
      await createComment(documentId, buildCommentFromHighlight(h));
      message.success('已发到本书评论');
    } catch {
      message.error('发送失败');
    }
  };
  const searchSelection = () => {
    if (!selection) return;
    const q = selection.text.slice(0, 80);
    setSearchRequest({ query: q, seq: Date.now() });
    setSideOpen(true);
    finishSelection();
  };
  const cardHighlight = card ? highlights.find((h) => h.id === card.id) ?? null : null;
  const notesMarkdown = useMemo(
    () => (exportOpen ? buildNotesMarkdown({ title: bookTitleText, author: bookAuthor, docId: documentId, highlights }) : ''),
    [exportOpen, bookTitleText, bookAuthor, documentId, highlights],
  );

  /** Chapter label for a whole-book fraction (slider tooltip), sync via the
   * section boundaries foliate computed at open. */
  const chapterAtFraction = (f: number): string => {
    const fr = sectionFractionsRef.current;
    if (fr.length < 2) return '';
    let idx = 0;
    for (let i = 0; i < fr.length - 1; i++) if (f >= fr[i]) idx = i;
    const sections = tocSectionRef.current;
    let best = -1;
    for (let i = 0; i < sections.length; i++) if (sections[i] >= 0 && sections[i] <= idx) best = i;
    return best >= 0 ? tocRef.current[best].title : '';
  };

  /* ── Rail resize (drag the divider) ─────────────────────────────────── */
  const onGripPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const grip = e.currentTarget;
    const startX = e.clientX;
    const start = railWidthRef.current;
    setResizing(true);
    grip.setPointerCapture(e.pointerId);
    let frame = 0;
    const onMove = (ev: PointerEvent) => {
      const next = clampRailWidth(start + ev.clientX - startX);
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setRailWidth(next);
      });
    };
    const onUp = () => {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onUp);
      grip.removeEventListener('pointercancel', onUp);
      setResizing(false);
      if (frame) cancelAnimationFrame(frame);
      updatePrefs({ railWidth: railWidthRef.current });
    };
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
    grip.addEventListener('pointercancel', onUp);
  };
  const onGripKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = clampRailWidth(railWidthRef.current + delta);
    setRailWidth(next);
    updatePrefs({ railWidth: next });
  };

  /* ── Toolbar ────────────────────────────────────────────────────────── */
  const pct = Math.round((sliderValue ?? progress?.fraction ?? 0) * 100);
  const chapterLabel = (progress?.tocItem?.label ?? '').trim();
  const progressText = formatEpubProgress({
    fraction: progress?.fraction,
    section: progress?.section,
    tocLabel: chapterLabel,
  });
  const sectionLeft = formatMinutes(progress?.time?.section);
  const totalLeft = formatMinutes(progress?.time?.total);
  const timeTitle = [sectionLeft ? `本章剩约 ${sectionLeft}` : '', totalLeft ? `全书剩约 ${totalLeft}` : ''].filter(Boolean).join(' · ');

  const fontOptions = useMemo(
    () => [
      ...fontPresets.map((p) => ({
        value: p.key,
        label: (
          <span style={{ fontFamily: p.stack }} className="jz-epub-font-option">
            {p.label}
          </span>
        ),
        plain: p.label,
      })),
      { value: 'publisher', label: <span>出版社原样（不覆盖书籍字体）</span>, plain: '出版社原样' },
    ],
    [fontPresets],
  );
  const fontValue = prefs.publisherFont ? 'publisher' : readerFont;
  const minScale = FONT_SCALE_STEPS[0];
  const maxScale = FONT_SCALE_STEPS[FONT_SCALE_STEPS.length - 1];

  const settings = (
    <div style={{ width: 288 }} className="jz-reader-layout-pop jz-epub-settings">
      <SettingsSection title="版式">
        <Segmented
          block
          size="small"
          value={prefs.flow}
          onChange={(v) => updatePrefs({ flow: v as EpubPrefs['flow'] })}
          options={[
            { label: '自动', value: 'auto' },
            { label: '翻页', value: 'paginated' },
            { label: '滚动', value: 'scrolled' },
          ]}
        />
      </SettingsSection>
      {effectiveFlow === 'paginated' && (
        <SettingsSection title="栏数">
          <Segmented
            block
            size="small"
            value={String(prefs.columns)}
            onChange={(v) => updatePrefs({ columns: v === 'auto' ? 'auto' : (Number(v) as 1 | 2) })}
            options={[
              { label: `自动（当前 ${columns} 栏）`, value: 'auto' },
              { label: '单栏', value: '1' },
              { label: '双栏', value: '2' },
            ]}
          />
        </SettingsSection>
      )}
      {effectiveFlow === 'paginated' && (
        <SettingsSection title="翻页动画">
          <Segmented
            block
            size="small"
            value={prefs.turn}
            onChange={(v) => updatePrefs({ turn: v as EpubTurn })}
            options={EPUB_TURN_OPTIONS.map((o) => ({ label: o.label, value: o.value, title: o.hint }))}
          />
          {!supportsViewTransitions() && (
            <Text type="secondary" style={{ fontSize: 'var(--jz-fs-2xs)', display: 'block', marginTop: 4 }}>
              当前浏览器不支持页面过渡，仅「滑动」有动画
            </Text>
          )}
        </SettingsSection>
      )}
      <SettingsSection title="纸色">
        <Segmented
          block
          size="small"
          value={prefs.paper}
          onChange={(v) => updatePrefs({ paper: v as EpubPaperKey })}
          options={EPUB_PAPERS.map((p) => ({
            value: p.key,
            label: (
              <span className="jz-epub-paper-option">
                <i style={{ background: p.bg ?? 'var(--jz-cell-surface, var(--jz-surface))', borderColor: p.fg ?? 'var(--jz-border)' }} />
                {p.label}
              </span>
            ),
          }))}
        />
      </SettingsSection>
      <SettingsSection title="字号（与文章阅读页共用）">
        <div className="jz-rl-stepper">
          <Button
            size="small"
            shape="circle"
            icon={<MinusOutlined />}
            disabled={layout.fontScale <= minScale + 1e-6}
            onClick={() => updateLayout({ fontScale: stepFontScale(layout.fontScale, -1) })}
            aria-label="减小字号"
          />
          <span className="jz-rl-pct">{Math.round(layout.fontScale * 100)}%</span>
          <Button
            size="small"
            shape="circle"
            icon={<PlusOutlined />}
            disabled={layout.fontScale >= maxScale - 1e-6}
            onClick={() => updateLayout({ fontScale: stepFontScale(layout.fontScale, 1) })}
            aria-label="增大字号"
          />
        </div>
        <Slider
          className="jz-rl-slider"
          min={FONT_SCALE_MIN * 100}
          max={FONT_SCALE_MAX * 100}
          step={5}
          value={Math.round(layout.fontScale * 100)}
          onChange={(v) => updateLayout({ fontScale: clampScale((v as number) / 100) })}
          marks={{ 100: '100%' }}
          tooltip={{ formatter: (v) => `${v}%`, getPopupContainer: popupContainer }}
        />
      </SettingsSection>
      <SettingsSection title="行距（与文章阅读页共用）">
        <Segmented
          block
          size="small"
          value={layout.lineHeight}
          onChange={(v) => updateLayout({ lineHeight: v as number })}
          options={LINE_HEIGHT_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
        />
      </SettingsSection>
      <SettingsSection title="字体（与文章阅读页共用）">
        <Select
          size="small"
          style={{ width: '100%' }}
          value={fontValue}
          onChange={chooseFont}
          options={fontOptions}
          optionLabelProp="plain"
          popupMatchSelectWidth={false}
          getPopupContainer={popupContainer}
          listHeight={320}
        />
        <Text type="secondary" style={{ fontSize: 'var(--jz-fs-2xs)', display: 'block', marginTop: 4, lineHeight: 1.5 }}>
          {prefs.publisherFont
            ? '按出版社原始字体显示；选任一字体即覆盖'
            : embedsFonts
              ? '本书内嵌了自己的字体，已用所选字体覆盖；选「出版社原样」可恢复'
              : '与文章阅读页同一份选择与效果；书中楷体、黑体、代码分别映射为文楷、黑体、等宽'}
        </Text>
      </SettingsSection>
      <SettingsSection title="首行缩进">
        <Segmented
          block
          size="small"
          value={prefs.indent}
          onChange={(v) => updatePrefs({ indent: v as EpubPrefs['indent'] })}
          options={[
            { label: '跟随书籍', value: 'book' },
            { label: '无（同文章页）', value: 'none' },
          ]}
        />
      </SettingsSection>
      <SettingsSection title="对齐">
        <Segmented
          block
          size="small"
          value={prefs.justify ? 'justify' : 'start'}
          onChange={(v) => updatePrefs({ justify: v === 'justify' })}
          options={[
            { label: '两端对齐', value: 'justify' },
            { label: '靠左', value: 'start' },
          ]}
        />
      </SettingsSection>
      <Divider style={{ margin: '10px 0 8px' }} />
      <Button size="small" type="text" block icon={<ReloadOutlined />} onClick={resetPrefs} className="jz-rl-reset">
        恢复默认排版
      </Button>
    </div>
  );

  const tip = (t: string) => ({ title: t, getPopupContainer: popupContainer });

  const toolbar = (
    <div className="jz-epub-toolbar" onMouseMove={pokeChrome}>
      <div className="jz-epub-tb-group">
        <Tooltip {...tip(sideOpen ? '隐藏目录' : '目录 / 搜索')}>
          <Button
            size="small"
            type={sideOpen ? 'primary' : 'default'}
            icon={<UnorderedListOutlined />}
            onClick={() => setSideOpen((v) => !v)}
            aria-label="切换目录"
          />
        </Tooltip>
      </div>
      {(history.back || history.forward) && (
        <div className="jz-epub-tb-group">
          <Tooltip {...tip('返回跳转前的位置')}>
            <Button size="small" icon={<UndoOutlined />} disabled={!history.back} onClick={() => viewRef.current?.history.back()} aria-label="后退" />
          </Tooltip>
          <Tooltip {...tip('前进')}>
            <Button size="small" icon={<RedoOutlined />} disabled={!history.forward} onClick={() => viewRef.current?.history.forward()} aria-label="前进" />
          </Tooltip>
        </div>
      )}
      <div className="jz-epub-tb-group">
        <Tooltip {...tip('上一章 (Shift+←)')}>
          <Button
            size="small"
            icon={<StepBackwardOutlined />}
            onClick={() => withTurn('jump', () => viewRef.current?.renderer?.prevSection?.())}
            aria-label="上一章"
          />
        </Tooltip>
        <Tooltip {...tip('上一页 (←)')}>
          <Button size="small" icon={<LeftOutlined />} onClick={turnPrev} aria-label="上一页" />
        </Tooltip>
        <Tooltip {...tip('下一页 (→)')}>
          <Button size="small" icon={<RightOutlined />} onClick={turnNext} aria-label="下一页" />
        </Tooltip>
        <Tooltip {...tip('下一章 (Shift+→)')}>
          <Button
            size="small"
            icon={<StepForwardOutlined />}
            onClick={() => withTurn('jump', () => viewRef.current?.renderer?.nextSection?.())}
            aria-label="下一章"
          />
        </Tooltip>
      </div>
      <div className="jz-epub-progress">
        <Slider
          className="jz-epub-slider"
          min={0}
          max={1000}
          value={Math.round((sliderValue ?? progress?.fraction ?? 0) * 1000)}
          onChange={(v) => setSliderValue((v as number) / 1000)}
          onChangeComplete={(v) => {
            setSliderValue(null);
            jumpTo({ fraction: (v as number) / 1000 });
          }}
          tooltip={{
            getPopupContainer: popupContainer,
            formatter: (v) => {
              const f = ((v as number) ?? 0) / 1000;
              const ch = chapterAtFraction(f);
              return `${Math.round(f * 100)}%${ch ? ` · ${ch}` : ''}`;
            },
          }}
          disabled={loading || !!err}
        />
        <Text type="secondary" className="jz-epub-progress-text" title={[progressText, timeTitle].filter(Boolean).join(' · ')}>
          {sliderValue != null
            ? `${pct}%`
            : progressText
              ? progressText +
                (chapterPages && effectiveFlow === 'paginated' ? ` · 本章 ${chapterPages.page}/${chapterPages.pages} 页` : '') +
                (sectionLeft ? ` · 剩约 ${sectionLeft}` : '')
              : loading
                ? '加载中…'
                : ''}
          {resumed && sliderValue == null && progress && (
            <span className="jz-epub-resumed" title="已回到上次阅读位置">
              · 续读
            </span>
          )}
        </Text>
      </div>
      <div className="jz-epub-tb-group">
        {documentId != null && userId != null && (
          <Tooltip {...tip(pageBookmark ? '移除本页书签' : '为本页添加书签')}>
            <Button
              size="small"
              type={pageBookmark ? 'primary' : 'default'}
              icon={pageBookmark ? <BookFilled /> : <BookOutlined />}
              onClick={() => void toggleBookmark()}
              disabled={loading || !!err || !progress?.cfi}
              aria-label={pageBookmark ? '移除本页书签' : '添加书签'}
              aria-pressed={!!pageBookmark}
            />
          </Tooltip>
        )}
        <Popover content={settings} trigger="click" placement="bottomRight" getPopupContainer={popupContainer}>
          <Tooltip {...tip('排版：版式 / 翻页动画 / 纸色 / 字号 / 字体')}>
            <Button size="small" icon={<ControlOutlined />} aria-label="排版设置">
              排版
            </Button>
          </Tooltip>
        </Popover>
        <Tooltip {...tip(fullscreen ? '退出全屏 (Esc)' : '全屏阅读')}>
          <Button
            size="small"
            icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={toggleFullscreen}
            aria-label={fullscreen ? '退出全屏' : '全屏'}
          />
        </Tooltip>
        <Tooltip {...tip('下载原文件')}>
          <Button size="small" icon={<DownloadOutlined />} href={url} download aria-label="下载原文件" />
        </Tooltip>
      </div>
    </div>
  );

  const tocPages = useMemo(() => {
    const totalBytes = sectionSizesRef.current.reduce((a, b) => a + b, 0);
    return estimateTocPages(toc, tocSectionRef.current, sectionFractionsRef.current, totalBytes, bytesPerPage(calib));
    // toc changes when the book opens (refs are filled just before setToc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toc, calib]);
  const updateTocPrefs = (patch: Partial<EpubTocPrefs>) => updatePrefs({ toc: { ...prefs.toc, ...patch } });

  const sidebar = (
    <EpubSidebar
      entries={toc}
      activeId={activeTocId}
      onJump={jumpHref}
      onClose={() => setSideOpen(false)}
      title={bookTitle || title}
      author={bookAuthor}
      coverUrl={coverUrl}
      progress={progress ? { fraction: progress.fraction ?? 0, section: progress.section ?? null } : null}
      tocPrefs={prefs.toc}
      onTocPrefsChange={updateTocPrefs}
      pageOf={tocPages.pages}
      totalPages={tocPages.total}
      popupContainer={popupContainer}
      readerFontStack={stackFor(readerFont)}
      onSearch={runSearch}
      onClearSearch={clearSearch}
      onJumpToCfi={jumpCfi}
      searchRequest={searchRequest}
      tabRequest={tabRequest}
      onJumpToSearchHit={jumpSearchHit}
      bookmarks={
        documentId
          ? {
              items: bookmarks,
              loaded: bookmarksLoaded,
              loggedIn: !!userId,
              onOpen: (b) => {
                jumpCfi(b.cfi);
                flashCfi(b.cfi);
              },
              onDelete: (b) => void removeBookmark(b),
            }
          : null
      }
      notes={
        documentId
          ? {
              highlights,
              loaded: highlightsLoaded,
              loggedIn: !!userId,
              onOpen: openHighlight,
              onExport: () => setExportOpen(true),
            }
          : null
      }
    />
  );

  const boxHeight: CSSProperties['height'] = fullscreen
    ? '100vh'
    : scroll === 'page'
      ? focus
        ? 'max(480px, calc(100vh - 72px))'
        : 'max(480px, calc(100vh - 150px))'
      : height;

  return (
    <div
      ref={wrapRef}
      className={
        'jz-epub-reader' +
        (fullscreen ? ' is-fullscreen' : '') +
        (fullscreen && chromeHidden ? ' is-chrome-hidden' : '') +
        (loading ? ' is-loading' : '') +
        (resizing ? ' is-resizing' : '')
      }
      style={{ height: boxHeight, ...(paper.bg ? { background: paper.bg } : null) }}
      data-flow={effectiveFlow}
      data-columns={columns}
      data-turn={prefs.turn}
      data-paper={prefs.paper}
      data-dark={(paper.key === 'theme' ? !isLightTheme(themeMode) : paper.dark) ? '' : undefined}
      onMouseMove={pokeChrome}
    >
      {toolbar}
      {err && (
        <Alert
          type="error"
          showIcon
          message={`EPUB 加载失败：${err}`}
          action={
            <Button size="small" icon={<DownloadOutlined />} href={url} download>
              下载原文件
            </Button>
          }
          style={{ margin: '0 0 8px' }}
        />
      )}
      <div className="jz-epub-body">
        {sideOpen && wide && (
          <>
            <div className="jz-epub-rail" style={{ width: railWidth, flexBasis: railWidth }}>
              {sidebar}
            </div>
            <div
              className="jz-epub-grip"
              role="separator"
              aria-orientation="vertical"
              aria-label="拖动调整目录宽度"
              aria-valuenow={railWidth}
              aria-valuemin={RAIL_WIDTH_MIN}
              aria-valuemax={RAIL_WIDTH_MAX}
              tabIndex={0}
              title="拖动调整目录宽度"
              onPointerDown={onGripPointerDown}
              onKeyDown={onGripKeyDown}
            />
          </>
        )}
        <div ref={stageRef} className="jz-epub-stage">
          <div ref={hostRef} className="jz-epub-host" />
          {loading && !err && (
            <div className="jz-epub-loading" style={paper.bg ? { background: paper.bg } : undefined}>
              {download != null ? (
                <div style={{ width: 220, textAlign: 'center' }}>
                  <Progress percent={download} size="small" status="active" />
                  <div style={{ color: 'var(--jz-text-muted)', marginTop: 4, fontSize: 'var(--jz-fs-xs)' }}>下载电子书 {download}%</div>
                </div>
              ) : (
                <Spin>
                  <div style={{ color: 'var(--jz-text-muted)', marginTop: 8 }}>解析电子书中…</div>
                </Spin>
              )}
            </div>
          )}
          <div className={'jz-epub-footnote' + (footnote ? ' is-open' : '')} role="dialog" aria-label="脚注">
            <div className="jz-epub-footnote-head">
              <Text type="secondary" style={{ fontSize: 'var(--jz-fs-xs)' }}>
                注释
              </Text>
              <Space size={4}>
                {footnote && (
                  <Button
                    type="text"
                    size="small"
                    onClick={() => {
                      const href = footnote.href;
                      closeFootnote();
                      jumpTo(href);
                    }}
                  >
                    跳转到原文
                  </Button>
                )}
                <Button type="text" size="small" icon={<CloseOutlined />} onClick={closeFootnote} aria-label="关闭注释" />
              </Space>
            </div>
            <div ref={footnoteHostRef} className="jz-epub-footnote-body" />
          </div>
          {(() => {
            const isPaginated = effectiveFlow === 'paginated';
            const atChapterEnd =
              isPaginated && !loading && !err && chapterPages != null && chapterPages.pages > 0 && chapterPages.page >= chapterPages.pages;
            const secCur = progress?.section?.current;
            const secTotal = progress?.section?.total ?? 0;
            const isLastSection = secCur != null && secTotal > 0 && secCur >= secTotal - 1;
            if (!atChapterEnd || finishOpen) return null;
            return (
              <div className="jz-epub-nextcard">
                {isLastSection ? (
                  <button type="button" onClick={openFinish}>
                    已到全书末页 · 读完这本书 →
                  </button>
                ) : (
                  <button type="button" onClick={() => withTurn('jump', () => viewRef.current?.renderer?.nextSection?.())}>
                    下一章{nextChapterTitle ? ` · ${nextChapterTitle}` : ''} →
                  </button>
                )}
              </div>
            );
          })()}
          {finishOpen && (
            <div className="jz-epub-finish" role="dialog" aria-label="全书读完">
              <div className="jz-epub-finish-card">
                <div className="jz-epub-finish-seal" aria-hidden>
                  终
                </div>
                <div className="jz-epub-finish-title">《{bookTitleText || '这本书'}》读完了</div>
                <Text type="secondary" className="jz-epub-finish-meta">
                  {finishDoneAt ? `完成于 ${new Date(finishDoneAt).toLocaleDateString()}` : ''}
                  {highlights.length ? ` · ${highlights.length} 条划线` : ''}
                  {bookmarks.length ? ` · ${bookmarks.length} 个书签` : ''}
                </Text>
                <Space wrap style={{ justifyContent: 'center', marginTop: 12 }}>
                  {documentId != null && userId != null && highlights.length > 0 && (
                    <Button type="primary" onClick={() => setExportOpen(true)}>
                      导出读书笔记
                    </Button>
                  )}
                  <Button onClick={() => setFinishOpen(false)}>回到书里</Button>
                </Space>
                {related && related.length > 0 && (
                  <div className="jz-epub-finish-related">
                    <div className="jz-epub-finish-related-title">同一书架还有</div>
                    <ul>
                      {related.map((p) => (
                        <li key={p.id}>
                          <Link to={`/posts/${encodeURIComponent(p.slug)}${kbSlug ? `?kb=${encodeURIComponent(kbSlug)}` : ''}`}>{p.title}</Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
          {selection && (
            <EpubSelectionBar
              anchor={selection.anchor}
              stageWidth={stageRef.current?.clientWidth ?? 0}
              stageHeight={stageRef.current?.clientHeight ?? 0}
              canHighlight={canHighlight}
              lastColor={lastColor}
              popupContainer={popupContainer}
              onCopy={() => {
                void copyText(selection.text);
                finishSelection();
              }}
              onHighlight={(color, style) => void addHighlight(color, style)}
              onNote={() => void addHighlight(lastColor, 'highlight', true)}
              onSearch={searchSelection}
              onQuote={() => {
                void copyText(quoteOf(selection.text, selection.cfi, selection.chapter), '已复制引用（Markdown）');
                finishSelection();
              }}
            />
          )}
          {card && cardHighlight && (
            <EpubHighlightCard
              key={cardHighlight.id}
              highlight={cardHighlight}
              anchor={card.anchor}
              stageWidth={stageRef.current?.clientWidth ?? 0}
              stageHeight={stageRef.current?.clientHeight ?? 0}
              autoFocusNote={card.focusNote}
              popupContainer={popupContainer}
              onChangeStyle={(patch) => void patchHighlight(cardHighlight.id, patch)}
              onSaveNote={(note) => patchHighlight(cardHighlight.id, { note })}
              onCopy={() => void copyText(cardHighlight.text)}
              onQuote={() => void copyText(quoteOf(cardHighlight.text, cardHighlight.cfi, cardHighlight.chapter), '已复制引用（Markdown）')}
              onComment={documentId ? () => void commentHighlight(cardHighlight) : undefined}
              onDelete={() => void removeHighlight(cardHighlight.id)}
              onClose={() => setCard(null)}
            />
          )}
        </div>
      </div>
      <EpubNotesExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        markdown={notesMarkdown}
        filename={notesFilename(bookTitleText)}
        title={bookTitleText}
        canCreateDoc={!!authUser?.is_staff}
        popupContainer={popupContainer}
      />
      {!wide && (
        <Drawer
          open={sideOpen}
          onClose={() => setSideOpen(false)}
          placement="left"
          width={300}
          styles={{ body: { padding: 8 } }}
          getContainer={popupContainer}
          rootStyle={{ position: 'absolute' }}
          title={null}
          closable={false}
        >
          {sidebar}
        </Drawer>
      )}
      {/* Illustration zoom — AntD's previewer, driven programmatically from
          clicks inside the chapter iframe. */}
      <Image
        style={{ display: 'none' }}
        src={lightbox ?? undefined}
        alt=""
        preview={{
          visible: !!lightbox,
          src: lightbox ?? undefined,
          onVisibleChange: (v) => {
            if (!v) setLightbox(null);
          },
          getContainer: popupContainer,
        }}
      />
      {/* Over-wide tables open at full width (paginated columns clip them). */}
      <Modal
        open={!!wideTable}
        onCancel={() => setWideTable(null)}
        footer={null}
        width="min(96vw, 1400px)"
        getContainer={popupContainer}
        title="完整表格"
        destroyOnHidden
        className="jz-epub-table-modal"
      >
        {wideTable && (
          <div className="markdown-preview jz-epub-table-zoom" style={{ overflow: 'auto', maxHeight: '78vh' }} dangerouslySetInnerHTML={{ __html: wideTable }} />
        )}
      </Modal>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="jz-rl-section">
      <div className="jz-rl-label">{title}</div>
      {children}
    </div>
  );
}
