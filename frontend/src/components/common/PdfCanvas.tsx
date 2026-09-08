/**
 * PDF renderer using pdfjs-dist — fully client-side canvas rendering so it does
 * NOT depend on the browser having a built-in PDF viewer (headless Chromium,
 * some corporate browsers, and mobile browsers all fail iframe-PDF in various
 * ways; pdfjs always works).
 *
 * Continuous-scroll model: every page gets a placeholder div sized to its
 * aspect ratio so the scrollbar reflects the whole document up front, but the
 * heavy canvas is only painted for pages within ~1 screen of the viewport
 * (windowed lazy rendering) and cleared once they scroll far away. This keeps
 * memory bounded even for hundred-page PDFs while letting the reader scroll
 * freely and see multiple pages at once when zoomed out.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Drawer, Input, Modal, Progress, Space, Spin, Tooltip, Typography } from 'antd';
import {
  BookFilled,
  BookOutlined,
  ColumnHeightOutlined,
  ColumnWidthOutlined,
  DownloadOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  LeftOutlined,
  RightOutlined,
  SearchOutlined,
  UnorderedListOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import PdfTocPanel from './PdfTocPanel';
import { getPdfOutline, type PdfTocEntry } from '@/utils/pdfOutline';
import { resolveDest, type PdfDest } from '@/utils/pdfDest';
import type { PdfLinkTarget } from '@/utils/pdfLinks';
import { usePdfDocument } from '@/hooks/usePdfDocument';
import { renderPdfPageLayers, type PdfMark, type PdfPageRender } from './pdf/renderPdfPageLayers';
import { buildPdfTextIndex, groupHitsByPage, searchPdfIndex, type PdfSearchHit, type PdfTextIndex } from '@/utils/pdfTextIndex';
import type { PdfReaderApi, PdfSideTab } from '@/utils/pdfReaderApi';
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
import { useAuthStore } from '@/stores/auth';
import EpubSelectionBar, { type SelectionAnchor } from './EpubSelectionBar';
import EpubHighlightCard from './EpubHighlightCard';
import EpubNotesExportModal from './EpubNotesExportModal';
import {
  buildNotesMarkdown,
  buildQuoteMarkdown,
  loadLastHighlightColor,
  normalizeSelectionText,
  notesFilename,
  saveLastHighlightColor,
  swatchHex,
} from '@/utils/epubNotes';
import { isPdfSelector, quadsBounds, quadsToMarks, selectionToPdfSelector, type PdfHighlightSelector } from '@/utils/pdfAnchor';
import { CloseIcon, CopyIcon, OpenInNewIcon } from '@/components/common/actionIcons';
import { useActiveScopes, useShortcut } from '@/shortcuts';
import { prefersReducedMotion } from '@/utils/motionPref';
import { loadPdfPosition, positionKey, savePdfPosition, syncUrlParam } from '@/utils/readerPosition';
import { pickNewer } from '@/utils/positionSync';
import { useServerPosition } from '@/hooks/useServerPosition';
import { message } from '@/utils/notify';
import { paperCanvasBackground, useReaderPaper } from '@/utils/readerPaper';
import { attachPinchZoom } from '@/utils/pinchZoom';
import ReaderPaperPicker from './ReaderPaperPicker';

interface Props {
  url: string;
  height?: number | string;
  /** 'inner' (default): a fixed-height box with its own scrollbar — for modals
   *  and the editor's height-constrained panels. 'page': pages flow into the
   *  document so the whole page scrolls like the Markdown reader, with the
   *  toolbar stuck to the top. The `height` prop is ignored in 'page' mode. */
  scroll?: 'inner' | 'page';
  /** 1-based page to open on (``?page=`` deep link). Wins over the memory. */
  initialPage?: number | null;
  /** Mirror the current page into ``?page=`` via replaceState (reading page). */
  syncUrl?: boolean;
  /** Reading page integration: when given, the outline is handed to the host
   * (site TOC rail / mobile drawer) and the reader renders NO rail of its own. */
  onOutline?: (entries: PdfTocEntry[]) => void;
  onPageChange?: (page: number, pageCount: number) => void;
  /** Host-side jump handle (filled by the reader) for the external outline. */
  jumpRef?: React.MutableRefObject<((entry: PdfTocEntry) => void) | null>;
  /** Owning document — enables per-user page bookmarks. */
  documentId?: number | null;
  /** Search / bookmark api for an external panel (reading page). */
  onReaderApi?: (api: PdfReaderApi) => void;
  /** Ask the host panel to show a tab (Mod+F → search, b → bookmarks). */
  onTabRequest?: (tab: PdfSideTab) => void;
  /** Deep link ``?hl=<id>``: open / flash that highlight once loaded. */
  initialHlId?: number | null;
  /** Document title for the notes export. */
  docTitle?: string;
  /** Whether the notes export may create a document (authors). */
  canCreateDoc?: boolean;
}

/** Inner padding of the scroll container (kept in sync with the body style). */
const PAD = 16;
/** Vertical gap between stacked pages. */
const PAGE_GAP = 16;
/** Render pages within roughly one screen above and below the viewport. */
const RENDER_MARGIN = '100% 0px';
/** A thin band across the viewport centre decides the "current" page. */
const ACTIVE_MARGIN = '-45% 0px -45% 0px';
/** Cap device-pixel-ratio so zoomed-in canvases don't blow up memory. */
const MAX_DPR = 2;

function sortByPage(list: Highlight[]): Highlight[] {
  return [...list].sort((a, b) => {
    const pa = isPdfSelector(a.selector) ? a.selector.page : 0;
    const pb = isPdfSelector(b.selector) ? b.selector.page : 0;
    if (pa !== pb) return pa - pb;
    const ta = isPdfSelector(a.selector) ? quadsBounds(a.selector.quads as never)?.top ?? 0 : 0;
    const tb = isPdfSelector(b.selector) ? quadsBounds(b.selector.quads as never)?.top ?? 0 : 0;
    return tb - ta; // PDF y grows upward: higher top = earlier on the page
  });
}

export default function PdfCanvas({
  url,
  height = 'min(calc(100vh - 200px), 1100px)',
  scroll = 'inner',
  initialPage = null,
  syncUrl = false,
  onOutline,
  onPageChange,
  jumpRef,
  documentId = null,
  onReaderApi,
  onTabRequest,
  initialHlId = null,
  docTitle = '',
  canCreateDoc = false,
}: Props) {
  useActiveScopes(['reader.pdf']);
  const externalToc = !!onOutline;
  const [paper] = useReaderPaper();
  /** Narrow embeds (phone-width preview, editor side panel) show the internal
   * outline as an overlay drawer instead of a rail eating half the width. */
  const [narrow, setNarrow] = useState(false);
  const [tabReq, setTabReq] = useState<{ tab: PdfSideTab; seq: number } | null>(null);
  const requestTab = (tab: PdfSideTab) => {
    if (externalToc) onTabRequest?.(tab);
    else {
      setTocOpen(true);
      setTabReq({ tab, seq: Date.now() });
    }
  };
  // ── Full-text search (client-side index over pdf.js text content) ──────
  const indexRef = useRef<PdfTextIndex | null>(null);
  const indexDocRef = useRef<PDFDocumentProxy | null>(null);
  const [indexProgress, setIndexProgress] = useState<number | null>(null);
  const marksRef = useRef<Map<number, PdfMark[]>>(new Map());
  // ── Bookmarks (per user, page anchored) ────────────────────────────────
  const loggedIn = useAuthStore((st) => !!st.user);
  // Cross-device position: server row merged with the local memory by time.
  const { remote: serverPos, loaded: serverPosLoaded, push: pushServerPos } = useServerPosition(documentId, loggedIn);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarksLoaded, setBookmarksLoaded] = useState(false);
  // ── Highlights / notes (per user, page + quads anchored) ───────────────
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [highlightsLoaded, setHighlightsLoaded] = useState(false);
  const highlightsRef = useRef<Highlight[]>([]);
  highlightsRef.current = highlights;
  const [selection, setSelection] = useState<{
    anchor: SelectionAnchor;
    selector: PdfHighlightSelector;
    text: string;
  } | null>(null);
  const [card, setCard] = useState<{ h: Highlight; anchor: SelectionAnchor; autoFocusNote?: boolean } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [lastColor, setLastColor] = useState<HighlightColor>(() => loadLastHighlightColor());
  const flashRef = useRef<{ id: number; timer: number } | null>(null);
  const deepLinkDoneRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const { doc, pageCount, baseSize, loading, error: err, progress, reload, passwordPrompt, submitPassword } = usePdfDocument(url);
  const [pwInput, setPwInput] = useState('');
  const ready = !!doc && pageCount > 0;
  /** 1-based page currently centred in the viewport (scroll-tracked). */
  const [page, setPage] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  /** Embedded bookmarks (outline) parsed from the PDF; empty when none. */
  const [outline, setOutline] = useState<PdfTocEntry[]>([]);
  /** Whether the outline sidebar is shown. */
  const [tocOpen, setTocOpen] = useState(false);
  /** Manual zoom multiplier applied on top of the fit mode. */
  const [zoom, setZoom] = useState(1);
  /** Base fit mode: 'width' fills the reader width (page scrolls vertically);
   * 'page' fits the whole page into the viewport (one page per screen). */
  const [fitMode, setFitMode] = useState<'width' | 'page'>('width');
  /** CSS scale mapping intrinsic page units → on-screen pixels. */
  const [cssScale, setCssScale] = useState(0);

  // Per-page render bookkeeping (refs so async work sees current values).
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const cssScaleRef = useRef(0);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const inflight = useRef<Map<number, PdfPageRender | null>>(new Map());
  const done = useRef<Set<number>>(new Set());
  const pageRef = useRef(1);
  /** Skip the very first scale settle so flow mode doesn't auto-scroll the
   * window past the page header on load (reset per document). */
  const scaleInitedRef = useRef(false);

  docRef.current = doc;
  cssScaleRef.current = cssScale;
  pageRef.current = page;

  // Page-flow mode: pages stack in normal document flow and the whole page
  // scrolls. Full-screen always uses its own bounded overlay, never flow.
  const flow = scroll === 'page' && !fullscreen;

  // Fullscreen = the Fullscreen API on the wrapper itself (no portal): AntD
  // popups, the selection bar and the reading page's SelectionAI all keep
  // their container. `overlayRef` is kept as an alias for popup containers.
  const overlayRef = wrapRef;
  useEffect(() => {
    const onChange = () => {
      const fs = document.fullscreenElement === wrapRef.current;
      setFullscreen(fs);
      if (fs) wrapRef.current?.focus();
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
  useShortcut('reader.pdf.fullscreen-exit', () => { if (document.fullscreenElement) void document.exitFullscreen?.(); }, { enabled: fullscreen });

  // Reset per-document view state whenever a new file is loaded (the document
  // itself is loaded by usePdfDocument).
  useEffect(() => {
    setPage(1);
    scaleInitedRef.current = false;
  }, [url]);

  // Parse the embedded outline once the document is ready.
  useEffect(() => {
    if (!doc) {
      setOutline([]);
      return;
    }
    let cancelled = false;
    getPdfOutline(doc).then((entries) => {
      if (!cancelled) setOutline(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [doc]);

  // Auto-open the internal rail on wide layouts only (fullscreen included —
  // a phone in fullscreen must not lose half its width to the rail); narrow
  // layouts keep it closed and open it as a drawer on demand. The reading
  // page (externalToc) owns the outline instead.
  useEffect(() => {
    const el = wrapRef.current;
    const measure = () => setNarrow((el?.clientWidth ?? window.innerWidth) < 880);
    measure();
    const ro = el ? new ResizeObserver(measure) : null;
    if (el && ro) ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [fullscreen]);
  useEffect(() => {
    if (outline.length === 0 || externalToc) {
      setTocOpen(false);
      return;
    }
    const wide = (fullscreen ? window.innerWidth : wrapRef.current?.clientWidth ?? 0) >= 880;
    setTocOpen(wide);
  }, [outline.length, fullscreen, externalToc]);
  useEffect(() => {
    onOutline?.(outline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outline]);
  useEffect(() => {
    onPageChange?.(page, pageCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageCount]);

  // Derive the CSS scale from the live container size and the chosen fit mode.
  // 'width' fills the reader edge-to-edge (no side gutters; the page scrolls
  // vertically). 'page' fits the whole page into the viewport (one page per
  // screen, possibly with side gutters on a wide container). zoom multiplies on
  // top, so zooming out brings several pages into view at once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !baseSize) return;
    const recompute = () => {
      const availW = el.clientWidth - PAD * 2;
      if (availW <= 0) return;
      // In flow mode the container is as tall as the whole document, so "fit
      // page height" must reference the viewport instead (minus rough chrome).
      const availH = flow ? window.innerHeight - 120 : el.clientHeight - PAD * 2;
      const fit =
        fitMode === 'page' && availH > 0
          ? Math.min(availH / baseSize.h, availW / baseSize.w)
          : availW / baseSize.w;
      setCssScale(fit * zoom);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    // Flow's fit-page depends on viewport height, which ResizeObserver on the
    // (document-tall) container won't report.
    window.addEventListener('resize', recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, [baseSize, zoom, fullscreen, fitMode, flow]);

  // Default placeholder dimensions (page-1 aspect at the current scale).
  const pageDims = useMemo(() => {
    if (!baseSize || cssScale <= 0) return null;
    return { w: baseSize.w * cssScale, h: baseSize.h * cssScale };
  }, [baseSize, cssScale]);

  /** Height of the blog's own sticky header (flow mode lives on the reading
   * page, whose `.blog-header` is sticky top:0 z-index:30). The toolbar must
   * stick BELOW it or it slides underneath and becomes unreachable. */
  const stickyHeaderHeight = () => {
    const el = document.querySelector('.blog-header');
    return el instanceof HTMLElement ? el.offsetHeight : 0;
  };

  /** Total sticky chrome (site header + toolbar) overlaying pages in flow mode. */
  const flowToolbarOffset = () => {
    const tb = wrapRef.current?.firstElementChild as HTMLElement | null;
    return stickyHeaderHeight() + (tb?.offsetHeight ?? 0) + 8;
  };

  /** Bring page `n`'s top into view WITHOUT scrollIntoView — that would also
   * scroll every outer ancestor (the window included), which in 'inner' mode
   * yanks the whole page down and pushes the toolbar out of sight. Inner /
   * fullscreen scroll only the container; flow scrolls the window (its own
   * scroller) minus the sticky toolbar. */
  const scrollPageIntoView = (n: number, smooth = true, innerOffsetPx = 0) => {
    const wrap = pageRefs.current.get(n);
    const container = containerRef.current;
    if (!wrap || !container) return;
    const behavior: ScrollBehavior = smooth && !prefersReducedMotion() ? 'smooth' : 'auto';
    if (flow) {
      const top = wrap.getBoundingClientRect().top + window.scrollY - flowToolbarOffset() + innerOffsetPx;
      window.scrollTo({ top: Math.max(0, top), behavior });
    } else {
      const delta = wrap.getBoundingClientRect().top - container.getBoundingClientRect().top;
      container.scrollTo({ top: container.scrollTop + delta - PAD + innerOffsetPx, behavior });
    }
  };

  const clampPage = (n: number) => Math.min(Math.max(1, n), pageCount || n);

  const scrollToPage = (n: number, smooth = true) => {
    if (!pageRefs.current.get(n)) return;
    scrollPageIntoView(n, smooth);
    setPage(clampPage(n));
  };

  /** Jump to a resolved destination: the page plus, when the dest carries a
   * vertical position (XYZ / FitH…), the exact spot inside that page. The
   * position is in PDF user space, so it goes through the target page's
   * viewport at the live scale; a small margin keeps the target line clear of
   * the sticky chrome. Works for pages not yet rendered — placeholders are
   * already laid out at the right size. */
  const jumpToDest = async (dest: PdfDest) => {
    const d = docRef.current;
    const n = clampPage(dest.page);
    if (!d || !pageRefs.current.get(n)) return;
    let offset = 0;
    if (dest.top != null) {
      try {
        const p = await d.getPage(n);
        const vp = p.getViewport({ scale: cssScaleRef.current });
        const [, y] = vp.convertToViewportPoint(dest.left ?? 0, dest.top) as [number, number];
        if (Number.isFinite(y)) offset = Math.max(0, Math.min(vp.height, y) - 8);
      } catch {
        offset = 0;
      }
    }
    scrollPageIntoView(n, true, offset);
    setPage(n);
  };

  if (jumpRef) {
    jumpRef.current = (entry) => {
      if (entry.page != null) void jumpToDest({ page: entry.page, top: entry.top, left: entry.left });
    };
  }

  /** Click handler for /Link overlays painted by renderPdfPageLayers. */
  const handleLink = async (target: PdfLinkTarget) => {
    const d = docRef.current;
    if (!d) return;
    if (target.kind === 'dest') {
      const dest = await resolveDest(d, target.dest);
      if (dest) void jumpToDest(dest);
      return;
    }
    if (target.kind === 'action') {
      const cur = pageRef.current;
      const total = pageCount || cur;
      const next =
        target.name === 'FirstPage' ? 1
        : target.name === 'LastPage' ? total
        : target.name === 'NextPage' ? Math.min(total, cur + 1)
        : Math.max(1, cur - 1);
      scrollToPage(next);
    }
  };

  const ensureIndex = async (): Promise<PdfTextIndex | null> => {
    const d = docRef.current;
    if (!d) return null;
    if (indexRef.current && indexDocRef.current === d) return indexRef.current;
    setIndexProgress(0);
    try {
      const idx = await buildPdfTextIndex(d, { onProgress: (n, t) => setIndexProgress(n / t) });
      indexRef.current = idx;
      indexDocRef.current = d;
      return idx;
    } finally {
      setIndexProgress(null);
    }
  };

  const annMarks = (pageNo: number): PdfMark[] => {
    const out: PdfMark[] = [];
    for (const h of highlightsRef.current) {
      const sel = h.selector;
      if (!isPdfSelector(sel) || sel.page !== pageNo) continue;
      const flash = flashRef.current?.id === h.id ? ' is-flash' : '';
      out.push(
        ...quadsToMarks(sel.quads as never, `jz-pdf-ann is-${h.style}${flash}`).map((m) => ({
          ...m,
          color: swatchHex(h.color),
          data: { hl: String(h.id) },
        })),
      );
    }
    return out;
  };
  const allMarks = (pageNo: number): PdfMark[] => [...(marksRef.current.get(pageNo) ?? []), ...annMarks(pageNo)];
  const applyMarks = (pageNo: number) => {
    const render = inflight.current.get(pageNo);
    render?.setMarks(allMarks(pageNo));
  };
  const repaintAnnotations = () => {
    for (const pageNo of inflight.current.keys()) applyMarks(pageNo);
  };

  const clearSearch = () => {
    const pages = [...marksRef.current.keys()];
    marksRef.current.clear();
    pages.forEach(applyMarks);
  };

  const search = async (query: string, push: (g: { label: string; hits: Array<{ pre: string; match: string; post: string; target: PdfSearchHit }> }) => void) => {
    const idx = await ensureIndex();
    if (!idx) return;
    const hits = searchPdfIndex(idx, query);
    clearSearch();
    for (const g of groupHitsByPage(hits)) {
      marksRef.current.set(g.page, g.hits.map((h) => ({ rect: h.rect })));
      applyMarks(g.page);
      push({ label: `第 ${g.page} 页`, hits: g.hits.map((h) => ({ pre: h.pre, match: h.match, post: h.post, target: h })) });
      // Yield so a long list streams in instead of blocking the panel.
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  };

  const jumpToHit = (hit: PdfSearchHit) => {
    // Mark the current hit distinctly on its page, then scroll to it.
    for (const [pageNo, marks] of marksRef.current) {
      let changed = false;
      for (const m of marks) {
        const cur = pageNo === hit.page && m.rect[0] === hit.rect[0] && m.rect[1] === hit.rect[1] && m.rect[2] === hit.rect[2];
        const next = cur ? 'is-current' : undefined;
        if (m.className !== next) {
          m.className = next;
          changed = true;
        }
      }
      if (changed) applyMarks(pageNo);
    }
    void jumpToDest({ page: hit.page, top: hit.top + 24, left: null });
  };

  useEffect(() => {
    setBookmarks([]);
    setBookmarksLoaded(false);
    if (!documentId || !loggedIn) return;
    let cancelled = false;
    listBookmarks(documentId)
      .then((list) => {
        if (!cancelled) {
          setBookmarks(list.filter((b) => b.page != null));
          setBookmarksLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setBookmarksLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, loggedIn, url]);

  const currentBookmark = bookmarks.find((b) => b.page === page) ?? null;
  const toggleBookmark = async () => {
    if (!documentId || !loggedIn) return;
    const existing = bookmarks.find((b) => b.page === pageRef.current);
    if (existing) {
      setBookmarks((bs) => bs.filter((b) => b.id !== existing.id));
      try {
        await deleteBookmark(existing.id);
      } catch {
        setBookmarks((bs) => [...bs, existing]);
        message.error('删除书签失败');
      }
      return;
    }
    const pageNo = pageRef.current;
    const excerpt = indexRef.current?.pages.find((p) => p.page === pageNo)?.text.trim().slice(0, 100) ?? '';
    try {
      const bm = await createBookmark(documentId, { page: pageNo, excerpt, chapter: `第 ${pageNo} 页` });
      setBookmarks((bs) => [...bs.filter((b) => b.id !== bm.id), bm].sort((a, b) => (a.page ?? 0) - (b.page ?? 0)));
      message.success(`已收藏第 ${pageNo} 页`);
    } catch {
      message.error('添加书签失败');
    }
  };
  const removeBookmark = async (b: Bookmark) => {
    setBookmarks((bs) => bs.filter((x) => x.id !== b.id));
    try {
      await deleteBookmark(b.id);
    } catch {
      setBookmarks((bs) => [...bs, b]);
      message.error('删除书签失败');
    }
  };
  const openBookmark = (b: Bookmark) => {
    if (b.page) void jumpToDest({ page: b.page, top: null, left: null });
  };

  useEffect(() => {
    setHighlights([]);
    setHighlightsLoaded(false);
    deepLinkDoneRef.current = false;
    if (!documentId || !loggedIn) return;
    let cancelled = false;
    listHighlights(documentId)
      .then((list) => {
        if (cancelled) return;
        setHighlights(sortByPage(list.filter((h) => isPdfSelector(h.selector))));
        setHighlightsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setHighlightsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, loggedIn, url]);
  useEffect(() => {
    repaintAnnotations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlights]);

  const stageBox = () => stageRef.current?.getBoundingClientRect() ?? new DOMRect();
  const anchorFromRects = (rects: DOMRect[]): SelectionAnchor | null => {
    const good = rects.filter((r) => r.width > 0 && r.height > 0);
    if (!good.length) return null;
    const sb = stageBox();
    const left = Math.min(...good.map((r) => r.left));
    const top = Math.min(...good.map((r) => r.top));
    const right = Math.max(...good.map((r) => r.right));
    const bottom = Math.max(...good.map((r) => r.bottom));
    return { x: left - sb.left, y: top - sb.top, w: right - left, h: bottom - top };
  };

  // Selection inside the text layer → floating bar (debounced like MdAnnotator).
  useEffect(() => {
    if (!ready) return;
    let timer = 0;
    const evaluate = () => {
      const sel = document.getSelection();
      const container = containerRef.current;
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !container) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const startEl = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement) as Element | null;
      if (!startEl || !container.contains(startEl) || !startEl.closest('.jz-pdf-textlayer')) {
        setSelection(null);
        return;
      }
      const pageEl = startEl.closest('.jz-pdf-page') as HTMLElement | null;
      const pageNo = Number(pageEl?.dataset.page);
      const render = pageNo ? inflight.current.get(pageNo) : null;
      if (!render) {
        setSelection(null);
        return;
      }
      const built = selectionToPdfSelector(range, [{ page: pageNo, el: render.inner, viewport: render.viewport }]);
      const anchor = anchorFromRects(Array.from(range.getClientRects()));
      if (!built || !anchor) {
        setSelection(null);
        return;
      }
      setCard(null);
      setSelection({ anchor, selector: built.selector, text: normalizeSelectionText(sel.toString()) });
    };
    const onChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(evaluate, 160);
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      document.removeEventListener('selectionchange', onChange);
      window.clearTimeout(timer);
    };
  }, [ready]);

  const clearSelection = () => {
    document.getSelection()?.removeAllRanges();
    setSelection(null);
  };
  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success('已复制');
    } catch {
      message.error('复制失败');
    }
  };
  const quoteOf = (text: string, pageNo: number) =>
    buildQuoteMarkdown(text, { title: docTitle, chapter: `第 ${pageNo} 页`, docId: documentId ?? undefined, href: documentId ? `/d/${documentId}?page=${pageNo}` : undefined } as never);
  const addHighlight = async (color: HighlightColor, style: HighlightStyle, withNote = false) => {
    if (!selection || !documentId) return;
    const { selector, text, anchor } = selection;
    try {
      const h = await createHighlight(documentId, {
        selector,
        text,
        chapter: `第 ${selector.page} 页`,
        color,
        style,
      });
      setLastColor(color);
      saveLastHighlightColor(color);
      setHighlights((hs) => sortByPage([...hs, h]));
      clearSelection();
      if (withNote) setCard({ h, anchor, autoFocusNote: true });
    } catch {
      message.error('划线失败');
    }
  };
  const patchHighlight = async (h: Highlight, patch: Partial<Pick<Highlight, 'color' | 'style' | 'note'>>) => {
    const prev = h;
    const next = { ...h, ...patch };
    setHighlights((hs) => hs.map((x) => (x.id === h.id ? next : x)));
    setCard((c) => (c && c.h.id === h.id ? { ...c, h: next } : c));
    try {
      const saved = await updateHighlight(h.id, patch);
      setHighlights((hs) => hs.map((x) => (x.id === h.id ? saved : x)));
      if (patch.color) {
        setLastColor(patch.color);
        saveLastHighlightColor(patch.color);
      }
    } catch {
      setHighlights((hs) => hs.map((x) => (x.id === h.id ? prev : x)));
      message.error('保存失败');
    }
  };
  const removeHighlight = async (h: Highlight) => {
    setHighlights((hs) => hs.filter((x) => x.id !== h.id));
    setCard(null);
    try {
      await deleteHighlight(h.id);
    } catch {
      setHighlights((hs) => sortByPage([...hs, h]));
      message.error('删除失败');
    }
  };
  const flashHighlight = (h: Highlight) => {
    if (flashRef.current) window.clearTimeout(flashRef.current.timer);
    flashRef.current = { id: h.id, timer: window.setTimeout(() => { flashRef.current = null; repaintAnnotations(); }, 1800) };
    repaintAnnotations();
  };
  const cardAnchorFor = (h: Highlight): SelectionAnchor | null => {
    const sel = h.selector;
    if (!isPdfSelector(sel)) return null;
    const el = containerRef.current?.querySelector(`.jz-pdf-ann[data-hl="${h.id}"]`);
    if (!el) return null;
    return anchorFromRects([el.getBoundingClientRect()]);
  };
  const openHighlight = (h: Highlight) => {
    const sel = h.selector;
    if (!isPdfSelector(sel)) return;
    const b = quadsBounds(sel.quads as never);
    void jumpToDest({ page: sel.page, top: b ? b.top + 24 : null, left: null });
    flashHighlight(h);
    window.setTimeout(() => {
      const anchor = cardAnchorFor(h);
      if (anchor) setCard({ h, anchor });
    }, 700);
  };
  // Click on a painted highlight (marks are pointer-events:none so the text
  // layer stays selectable — hit-test by geometry instead).
  const onStageClick = (e: React.MouseEvent) => {
    if (selection) return;
    const target = e.target as Element;
    if (target.closest('.jz-epub-selbar, .jz-epub-hlcard, a, button')) return;
    const container = containerRef.current;
    if (!container) return;
    const x = e.clientX;
    const y = e.clientY;
    for (const el of Array.from(container.querySelectorAll<HTMLElement>('.jz-pdf-ann'))) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        const h = highlightsRef.current.find((hh) => String(hh.id) === el.dataset.hl);
        if (h) {
          const anchor = anchorFromRects([r]);
          if (anchor) setCard({ h, anchor });
        }
        return;
      }
    }
    setCard(null);
  };
  useEffect(() => {
    if (!ready || !highlightsLoaded || !initialHlId || deepLinkDoneRef.current) return;
    const h = highlights.find((x) => x.id === initialHlId);
    if (!h) return;
    deepLinkDoneRef.current = true;
    openHighlight(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, highlightsLoaded, initialHlId]);
  const contextText = () => {
    const idx = indexRef.current;
    const cur = pageRef.current;
    if (idx) {
      return idx.pages
        .filter((p) => Math.abs(p.page - cur) <= 1)
        .map((p) => p.text)
        .join('\n\n');
    }
    return Array.from(containerRef.current?.querySelectorAll('.jz-pdf-textlayer') ?? [])
      .map((el) => el.textContent ?? '')
      .join('\n\n');
  };

  const readerApi: PdfReaderApi = {
    currentPage: page,
    pageCount,
    search,
    clearSearch,
    jumpToHit,
    indexProgress,
    bookmarks,
    bookmarksLoaded,
    loggedIn,
    currentBookmark,
    toggleBookmark,
    removeBookmark,
    openBookmark,
    highlights,
    highlightsLoaded,
    openHighlight,
    openExport: () => setExportOpen(true),
    contextText,
  };
  useEffect(() => {
    onReaderApi?.(readerApi);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageCount, indexProgress, bookmarks, bookmarksLoaded, loggedIn, doc, highlights, highlightsLoaded]);

  // ── Keyboard (registry-driven) ─────────────────────────────────────────
  useShortcut('reader.pdf.prev', () => scrollToPage(pageRef.current - 1), { enabled: ready });
  useShortcut('reader.pdf.prev-alt', () => scrollToPage(pageRef.current - 1), { enabled: ready });
  useShortcut('reader.pdf.next', () => scrollToPage(pageRef.current + 1), { enabled: ready });
  useShortcut('reader.pdf.next-alt', () => scrollToPage(pageRef.current + 1), { enabled: ready });
  useShortcut('reader.pdf.first', () => scrollToPage(1), { enabled: ready });
  useShortcut('reader.pdf.last', () => scrollToPage(pageCount), { enabled: ready });
  useShortcut('reader.pdf.zoom-in', () => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2))), { enabled: ready });
  useShortcut('reader.pdf.zoom-out', () => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2))), { enabled: ready });
  useShortcut('reader.pdf.zoom-reset', () => setZoom(1), { enabled: ready });
  useShortcut('reader.pdf.toc', () => (externalToc ? onTabRequest?.('toc') : setTocOpen((v) => !v)), { enabled: ready && outline.length > 0 });
  useShortcut('reader.pdf.find', () => requestTab('search'), { enabled: ready });
  useShortcut('reader.pdf.bookmark', () => void toggleBookmark(), { enabled: ready && loggedIn && !!documentId });

  // ── Touch: pinch + double-tap zoom (drives the same ratio-anchored setZoom) ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !ready) return;
    return attachPinchZoom(el, {
      getZoom: () => zoomRef.current,
      setZoom: (z) => setZoom(z),
      isTextTarget: (t) => t instanceof Element && !!t.closest('.jz-pdf-textlayer, .jz-pdf-link'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fullscreen, flow]);

  // ── Position memory + deep link + URL sync ─────────────────────────────
  // Memory is per file (url sans query): {page, offset-in-page}. A ``?page=``
  // deep link wins over it; otherwise a dismissible pill offers to resume
  // (never auto-jumps — same contract as the Markdown reader's pill).
  const posKey = positionKey(url);
  const [resume, setResume] = useState<{ page: number; offset: number } | null>(null);
  const restoredRef = useRef(false);
  useEffect(() => {
    restoredRef.current = false;
    setResume(null);
  }, [url]);
  useEffect(() => {
    if (!ready || cssScale <= 0 || restoredRef.current || !serverPosLoaded) return;
    restoredRef.current = true;
    if (initialPage && initialPage >= 1) {
      // Wait a frame so placeholders have their final size.
      requestAnimationFrame(() => void jumpToDest({ page: initialPage, top: null, left: null }));
      return;
    }
    const pick = pickNewer(loadPdfPosition(posKey), serverPos && serverPos.page ? serverPos : null);
    const saved = pick ? { page: pick.value.page ?? 0, offset: pick.value.offset ?? 0 } : null;
    if (saved && saved.page > 1 && saved.page <= pageCount) {
      setResume({ page: saved.page, offset: saved.offset });
      const t = window.setTimeout(() => setResume(null), 12000);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, cssScale, initialPage, pageCount, posKey, serverPosLoaded]);

  const resumeFromMemory = () => {
    const r = resume;
    setResume(null);
    if (!r) return;
    const wrap = pageRefs.current.get(r.page);
    const h = wrap?.getBoundingClientRect().height ?? 0;
    scrollPageIntoView(r.page, true, Math.max(0, r.offset * h));
    setPage(r.page);
  };

  // Save {page, offset} (debounced) and mirror ?page= as the reader moves.
  useEffect(() => {
    // Nothing is written before the resume decision (server / local merge)
    // — a mount-time write would out-date the server row from elsewhere.
    if (!ready || !scaleInitedRef.current || !restoredRef.current) return;
    const t = window.setTimeout(() => {
      const wrap = pageRefs.current.get(page);
      let offset = 0;
      if (wrap) {
        const rect = wrap.getBoundingClientRect();
        const chrome = flow ? flowToolbarOffset() : (containerRef.current?.getBoundingClientRect().top ?? 0) + PAD;
        offset = rect.height > 0 ? Math.min(1, Math.max(0, (chrome - rect.top) / rect.height)) : 0;
      }
      savePdfPosition(posKey, { page, offset });
      pushServerPos({ page, offset });
      if (syncUrl) syncUrlParam('page', page > 1 ? page : null);
    }, 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, ready, posKey, syncUrl]);

  const copyPageLink = useCallback(async () => {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('page', String(pageRef.current));
      await navigator.clipboard.writeText(u.toString());
      message.success(`已复制第 ${pageRef.current} 页链接`);
    } catch {
      message.error('复制失败');
    }
  }, []);

  // Windowed lazy rendering + scroll-driven current-page tracking. Recreated
  // whenever the document or scale changes; cleanup cancels in-flight renders
  // and drops every canvas so a zoom change fully repaints at the new scale.
  useEffect(() => {
    const container = containerRef.current;
    if (!doc || !container || cssScale <= 0 || pageCount === 0) return;

    // Flow mode scrolls the viewport, so observe against it (null root) rather
    // than the inner box.
    const root = flow ? null : container;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

    const clearPage = (n: number) => {
      inflight.current.get(n)?.cancel();
      inflight.current.delete(n);
      done.current.delete(n);
      const wrap = pageRefs.current.get(n);
      if (wrap) wrap.innerHTML = '';
    };

    const renderPage = async (n: number) => {
      if (done.current.has(n) || inflight.current.has(n)) return;
      const wrap = pageRefs.current.get(n);
      if (!wrap) return;
      inflight.current.set(n, null); // reserve the slot so we don't double-render
      try {
        const p = await docRef.current!.getPage(n);
        if (!inflight.current.has(n)) return; // cleared while loading
        // The inner box's own CSS size dictates the wrapper's final height, so
        // a page whose size differs from page 1 self-corrects without us
        // writing to wrap.style (React owns that and would clobber it on the
        // next scroll-driven re-render).
        const render = renderPdfPageLayers({
          page: p,
          cssScale: cssScaleRef.current,
          dpr,
          host: wrap,
          onLink: (target) => void handleLink(target),
          paper: { key: paper.key, background: paperCanvasBackground(paper) },
          marks: allMarks(n),
        });
        inflight.current.set(n, render);
        await render.done;
        if (inflight.current.get(n) === render) done.current.add(n);
      } catch {
        inflight.current.delete(n);
      }
    };

    // Window observer: render pages near the viewport, drop the far ones.
    const renderObs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const n = Number((entry.target as HTMLElement).dataset.page);
          if (!n) continue;
          if (entry.isIntersecting) void renderPage(n);
          else clearPage(n);
        }
      },
      { root, rootMargin: RENDER_MARGIN, threshold: 0 },
    );

    // Active observer: the first page crossing the viewport centre wins.
    const visible = new Set<number>();
    const activeObs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const n = Number((entry.target as HTMLElement).dataset.page);
          if (!n) continue;
          if (entry.isIntersecting) visible.add(n);
          else visible.delete(n);
        }
        if (visible.size > 0) setPage(Math.min(...visible));
      },
      { root, rootMargin: ACTIVE_MARGIN, threshold: 0 },
    );

    pageRefs.current.forEach((wrap) => {
      renderObs.observe(wrap);
      activeObs.observe(wrap);
    });

    return () => {
      renderObs.disconnect();
      activeObs.disconnect();
      inflight.current.forEach((render) => render?.cancel());
      inflight.current.clear();
      done.current.clear();
      pageRefs.current.forEach((wrap) => {
        wrap.innerHTML = '';
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, cssScale, pageCount, fullscreen, flow, paper.key]);

  // In-place zoom: keep the content point being read fixed across a zoom /
  // resize repaint (cssScale only changes on those, never on plain scrolling)
  // by scaling the scroll offset with the scale ratio. Never scrollIntoView
  // here — it also scrolls the window in 'inner' mode (toolbar pushed out of
  // view) and snapping to the page top loses the intra-page position anyway.
  const prevScaleRef = useRef(0);
  const prevContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (cssScale <= 0) return;
    const container = containerRef.current;
    const prevScale = prevScaleRef.current;
    const sameContainer = prevContainerRef.current === container;
    prevScaleRef.current = cssScale;
    prevContainerRef.current = container;
    // Don't anchor on the first settle — only on later zoom / resize repaints —
    // so flow mode doesn't yank the window down to the PDF on initial load.
    if (!scaleInitedRef.current) {
      scaleInitedRef.current = true;
      return;
    }
    if (!container) return;
    if (!sameContainer || prevScale <= 0) {
      // Fullscreen toggle swapped the scroll container: ratio math is
      // meaningless there, so snap the current page into the (new) view.
      scrollPageIntoView(pageRef.current, false);
      return;
    }
    const ratio = cssScale / prevScale;
    if (ratio === 1) return;
    if (flow) {
      // Anchor the content point sitting just below the sticky toolbar. The
      // container's document position is scale-independent, so only the
      // offset inside it scales.
      const containerTop = container.getBoundingClientRect().top + window.scrollY;
      const tbH = flowToolbarOffset();
      const offset = window.scrollY + tbH - containerTop;
      if (offset > 0) {
        window.scrollTo({ top: containerTop + offset * ratio - tbH, behavior: 'auto' });
      }
    } else {
      container.scrollTop = PAD + (container.scrollTop - PAD) * ratio;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cssScale]);

  const toolbar = (
    <Space
      style={{
        marginBottom: 8,
        padding: '4px 12px',
        background: 'var(--jz-surface-2)',
        borderRadius: 6,
        width: '100%',
        justifyContent: 'space-between',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        // Stay reachable (page nav / zoom / fit / toc) while the page scrolls.
        // top must clear the blog's sticky header (z-index 30) — at top:0 the
        // toolbar slides underneath it and the zoom controls become invisible.
        ...(flow ? { position: 'sticky', top: stickyHeaderHeight(), zIndex: 5 } : null),
      }}
    >
      <Space>
        {outline.length > 0 && !externalToc && (
          <Tooltip title={tocOpen ? '隐藏目录' : '显示目录'}>
            <Button
              size="small"
              type={tocOpen ? 'primary' : 'default'}
              icon={<UnorderedListOutlined />}
              onClick={() => setTocOpen((v) => !v)}
              aria-label="切换目录"
            />
          </Tooltip>
        )}
        <Button
          size="small"
          icon={<LeftOutlined />}
          aria-label="上一页"
          title="上一页"
          disabled={page <= 1}
          onClick={() => scrollToPage(page - 1)}
        />
        <Typography.Text style={{ minWidth: 60, textAlign: 'center', display: 'inline-block' }}>
          {page} / {pageCount || '?'}
        </Typography.Text>
        <Button
          size="small"
          icon={<RightOutlined />}
          aria-label="下一页"
          title="下一页"
          disabled={page >= pageCount}
          onClick={() => scrollToPage(page + 1)}
        />
      </Space>
      <Space>
        <Tooltip title={fitMode === 'width' ? '当前适宽，点击切换为适页高' : '当前适页高，点击切换为适宽'}>
          <Button
            size="small"
            icon={fitMode === 'width' ? <ColumnWidthOutlined /> : <ColumnHeightOutlined />}
            onClick={() => setFitMode((m) => (m === 'width' ? 'page' : 'width'))}
          >
            {fitMode === 'width' ? '适宽' : '适页高'}
          </Button>
        </Tooltip>
        <Tooltip title="缩小">
          <Button
            size="small"
            icon={<ZoomOutOutlined />}
            aria-label="缩小"
            disabled={zoom <= 0.5}
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
          />
        </Tooltip>
        <Typography.Text data-testid="pdf-zoom" style={{ minWidth: 48, textAlign: 'center', display: 'inline-block' }}>
          {Math.round(zoom * 100)}%
        </Typography.Text>
        <Tooltip title="放大">
          <Button
            size="small"
            icon={<ZoomInOutlined />}
            aria-label="放大"
            disabled={zoom >= 3}
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))}
          />
        </Tooltip>
        <Tooltip title="在文档中查找 (Mod+F)">
          <Button size="small" icon={<SearchOutlined />} aria-label="在文档中查找" onClick={() => requestTab('search')} />
        </Tooltip>
        {loggedIn && documentId && (
          <Tooltip title={currentBookmark ? '取消本页书签 (b)' : '收藏本页 (b)'}>
            <Button
              size="small"
              type={currentBookmark ? 'primary' : 'default'}
              icon={currentBookmark ? <BookFilled /> : <BookOutlined />}
              aria-label={currentBookmark ? '取消本页书签' : '收藏本页'}
              aria-pressed={!!currentBookmark}
              onClick={() => void toggleBookmark()}
            />
          </Tooltip>
        )}
        <ReaderPaperPicker popupContainer={() => overlayRef.current ?? wrapRef.current ?? document.body} />
        <Tooltip title={fullscreen ? '退出全屏 (Esc)' : '全屏阅读'}>
          <Button
            size="small"
            icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={toggleFullscreen}
          >
            {fullscreen ? '退出全屏' : '全屏'}
          </Button>
        </Tooltip>
        {syncUrl && (
          <Tooltip title="复制当前页链接（?page=N）">
            <Button size="small" icon={<CopyIcon />} aria-label="复制当前页链接" onClick={() => void copyPageLink()} />
          </Tooltip>
        )}
        <Tooltip title="在新标签页用浏览器打开（原生 PDF 阅读器）">
          <Button
            size="small"
            icon={<OpenInNewIcon />}
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            在新标签打开
          </Button>
        </Tooltip>
        <Button
          size="small"
          icon={<DownloadOutlined />}
          href={url}
          download
        >
          下载原文件
        </Button>
      </Space>
    </Space>
  );

  const body = (
    <div
      ref={containerRef}
      style={
        flow
          ? {
              // Flow into the page: no fixed height / inner scrollbar, so the
              // whole document scrolls like the Markdown reader.
              width: '100%',
              padding: `0 ${PAD}px`,
              // A zoom repaint resizes every placeholder and clears/redraws the
              // canvases; the browser's native scroll anchoring "compensates"
              // through several layout passes and ends up dragging the scroll
              // to 0. Opt the whole subtree out so only our ratio-anchoring
              // effect moves the scroll.
              overflowAnchor: 'none',
              touchAction: 'pan-x pan-y',
            }
          : {
              width: '100%',
              height: fullscreen ? 'calc(100vh - 64px)' : height,
              overflow: 'auto',
              padding: PAD,
              background: 'var(--jz-surface-2)',
              borderRadius: 8,
              overflowAnchor: 'none',
              touchAction: 'pan-x pan-y',
            }
      }
    >
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
        <div
          key={n}
          id={`pdf-page-${n}`}
          data-page={n}
          className="jz-pdf-page"
          ref={(el) => {
            if (el) pageRefs.current.set(n, el);
            else pageRefs.current.delete(n);
          }}
          style={{
            width: pageDims ? pageDims.w : '80%',
            // minHeight (not height): the painted canvas dictates the final
            // height so a non-uniform page grows to fit instead of clipping.
            minHeight: pageDims ? pageDims.h : 600,
            margin: `0 auto ${PAGE_GAP}px`,
            background: paper.dark ? '#111' : paper.bg ?? '#fff',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          }}
        />
      ))}
    </div>
  );

  const tocPanel =
    !externalToc && ready ? (
      <PdfTocPanel
        entries={outline}
        currentPage={page}
        onJump={(entry) => {
          if (entry.page != null) void jumpToDest({ page: entry.page, top: entry.top, left: entry.left });
          if (narrow) setTocOpen(false);
        }}
        onClose={() => setTocOpen(false)}
        sticky={flow && !narrow}
        reader={readerApi}
        tabRequest={tabReq}
      />
    ) : null;
  // Wide: inline rail. Narrow: overlay drawer inside the reader box (never a
  // half-width column on a phone). Reading page: none — the host owns it.
  const sidebar = tocPanel && tocOpen && !narrow ? tocPanel : null;
  const drawer =
    tocPanel && narrow ? (
      <Drawer
        open={tocOpen}
        placement="right"
        width={280}
        getContainer={false}
        rootStyle={{ position: 'absolute' }}
        styles={{ body: { padding: 0 } }}
        closable={false}
        onClose={() => setTocOpen(false)}
        title={null}
      >
        {tocPanel}
      </Drawer>
    ) : null;

  // Canvas column on the left, outline rail on the right (mirrors the MD reader).
  // In flow mode the rail sticks (align-start) instead of stretching the row.
  const stageSize = { w: stageRef.current?.clientWidth ?? 0, h: stageRef.current?.clientHeight ?? 0 };
  const popupContainer = () => wrapRef.current ?? document.body;
  const content = (
    <div
      ref={stageRef}
      className="jz-pdf-stage"
      onClick={onStageClick}
      style={{ display: 'flex', gap: 12, alignItems: flow ? 'flex-start' : 'stretch', minHeight: 0, position: 'relative' }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>{body}</div>
      {sidebar}
      {drawer}
      {selection && (
        <EpubSelectionBar
          anchor={selection.anchor}
          stageWidth={stageSize.w}
          stageHeight={stageSize.h}
          canHighlight={loggedIn && !!documentId}
          lastColor={lastColor}
          onCopy={() => { void copyText(selection.text); clearSelection(); }}
          onHighlight={(color, style) => void addHighlight(color, style)}
          onNote={() => void addHighlight(lastColor, 'highlight', true)}
          onQuote={() => { void copyText(quoteOf(selection.text, selection.selector.page)); clearSelection(); }}
          popupContainer={popupContainer}
        />
      )}
      {card && (
        <EpubHighlightCard
          highlight={card.h}
          anchor={card.anchor}
          stageWidth={stageSize.w}
          stageHeight={stageSize.h}
          autoFocusNote={card.autoFocusNote}
          onChangeStyle={(patch) => void patchHighlight(card.h, patch)}
          onSaveNote={(note) => patchHighlight(card.h, { note })}
          onCopy={() => void copyText(card.h.text)}
          onQuote={() => void copyText(quoteOf(card.h.text, isPdfSelector(card.h.selector) ? card.h.selector.page : pageRef.current))}
          onDelete={() => void removeHighlight(card.h)}
          onClose={() => setCard(null)}
          popupContainer={popupContainer}
        />
      )}
      <EpubNotesExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        markdown={exportOpen ? buildNotesMarkdown({ title: docTitle, docId: documentId ?? undefined, highlights } as never) : ''}
        filename={notesFilename(docTitle || 'pdf')}
        title={docTitle}
        canCreateDoc={canCreateDoc}
        popupContainer={popupContainer}
      />
    </div>
  );

  // Streaming load feedback: pdf.js reports Range-chunk progress, so a big
  // file shows a percentage instead of an indefinite spinner (mirrors the
  // EPUB reader's download bar). Errors carry a cache-busting retry.
  const status = (
    <>
      <Modal
        open={!!passwordPrompt}
        title="该 PDF 已加密"
        okText="打开"
        cancelText="取消"
        onOk={() => {
          submitPassword(pwInput);
          setPwInput('');
        }}
        onCancel={() => {
          submitPassword('');
          setPwInput('');
        }}
        getContainer={() => overlayRef.current ?? wrapRef.current ?? document.body}
      >
        <p style={{ marginTop: 0 }}>{passwordPrompt?.wrong ? '密码不正确，请重试。' : '请输入打开密码。'}</p>
        <Input.Password value={pwInput} onChange={(e) => setPwInput(e.target.value)} onPressEnter={() => { submitPassword(pwInput); setPwInput(''); }} autoFocus aria-label="PDF 密码" />
      </Modal>
      {err && (
        <Alert
          type="error"
          showIcon
          message={`PDF 加载失败：${err}`}
          action={
            <Button size="small" onClick={reload}>
              重试
            </Button>
          }
        />
      )}
      {resume && (
        <div className="jz-resume-pill" role="status" data-testid="pdf-resume">
          <button type="button" className="jz-resume-pill-btn" onClick={resumeFromMemory}>
            继续上次阅读 · 第 {resume.page} / {pageCount} 页
          </button>
          <button type="button" className="jz-resume-pill-close" aria-label="关闭续读提示" onClick={() => setResume(null)}>
            <CloseIcon />
          </button>
        </div>
      )}
      {loading && !err && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }} data-testid="pdf-loading">
          {progress != null ? (
            <div style={{ width: 220, textAlign: 'center' }}>
              <Progress percent={progress} size="small" status="active" />
              <div style={{ color: 'var(--jz-text-muted)', marginTop: 4, fontSize: 'var(--jz-fs-xs)' }}>
                加载 PDF {progress}%
              </div>
            </div>
          ) : (
            <Spin>
              <div style={{ color: 'var(--jz-text-muted)', marginTop: 8 }}>加载 PDF 中...</div>
            </Spin>
          )}
        </div>
      )}
    </>
  );

  return (
    <div ref={wrapRef} className="jz-pdf-wrap" tabIndex={-1} data-fullscreen={fullscreen ? 'true' : undefined} style={{ outline: 'none' }}>
      {toolbar}
      {status}
      {content}
    </div>
  );
}
