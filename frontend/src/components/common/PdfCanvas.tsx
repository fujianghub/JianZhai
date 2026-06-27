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
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Alert, Button, Space, Spin, Tooltip, Typography } from 'antd';
import {
  ColumnHeightOutlined,
  ColumnWidthOutlined,
  DownloadOutlined,
  ExportOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  LeftOutlined,
  RightOutlined,
  UnorderedListOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import * as pdfjs from 'pdfjs-dist';
import type { RenderTask } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import PdfTocPanel from './PdfTocPanel';
import { getPdfOutline, type PdfTocEntry } from '@/utils/pdfOutline';

interface Props {
  url: string;
  height?: number | string;
  /** 'inner' (default): a fixed-height box with its own scrollbar — for modals
   *  and the editor's height-constrained panels. 'page': pages flow into the
   *  document so the whole page scrolls like the Markdown reader, with the
   *  toolbar stuck to the top. The `height` prop is ignored in 'page' mode. */
  scroll?: 'inner' | 'page';
}

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

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

export default function PdfCanvas({
  url,
  height = 'min(calc(100vh - 200px), 1100px)',
  scroll = 'inner',
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  /** 1-based page currently centred in the viewport (scroll-tracked). */
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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
  /** Page 1's intrinsic size at scale 1; used to size every placeholder. */
  const [baseSize, setBaseSize] = useState<{ w: number; h: number } | null>(null);
  /** CSS scale mapping intrinsic page units → on-screen pixels. */
  const [cssScale, setCssScale] = useState(0);

  // Per-page render bookkeeping (refs so async work sees current values).
  const docRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const cssScaleRef = useRef(0);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const inflight = useRef<Map<number, RenderTask | null>>(new Map());
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

  // Lock body scroll while the fullscreen overlay is up, and exit on ESC.
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [fullscreen]);

  // Fetch through the same-origin URL so the request rides the Vite dev proxy
  // (which bridges /media → the HTTP backend). Going direct to http://…:8002
  // breaks under `pnpm dev:https` (HTTPS page → HTTP fetch = mixed-content
  // block → "Failed to fetch") and from LAN devices (their localhost ≠ the
  // dev host). The proxy's old concurrent-response scrambling is already fixed
  // by the keep-alive-off agent in vite.config. Append a per-mount nonce to
  // defeat any stale `(204)` entry the browser disk cache might still hold.
  const fetchUrl = useMemo(() => {
    return url + (url.includes('?') ? '&' : '?') + '_=' + Date.now();
  }, [url]);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjs.getDocument> | null = null;
    setLoading(true);
    setErr(null);
    setDoc(null);
    setPage(1);
    setBaseSize(null);
    scaleInitedRef.current = false;
    (async () => {
      try {
        // Fetch the bytes ourselves so we control credentials exactly, then
        // hand the ArrayBuffer to pdf.js — its internal XHR layer was flaky
        // here (surfaced "Failed to fetch" even on a clean 200). Same-origin
        // request, so the session cookie rides along for the auth gate.
        const resp = await fetch(fetchUrl, {
          credentials: 'include',
        });
        if (cancelled) return;
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const buf = await resp.arrayBuffer();
        if (cancelled) return;
        if (buf.byteLength === 0) {
          throw new Error('服务器返回空内容，请刷新重试');
        }
        loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf) });
        const d = await loadingTask.promise;
        if (cancelled) {
          void d.destroy();
          return;
        }
        setDoc(d);
        setPageCount(d.numPages);
        // Page 1's size seeds every placeholder's aspect ratio (most PDFs are
        // uniform; a per-page mismatch is corrected when that page renders).
        const first = await d.getPage(1);
        if (cancelled) return;
        const vp = first.getViewport({ scale: 1 });
        setBaseSize({ w: vp.width, h: vp.height });
        setLoading(false);
      } catch (e: unknown) {
        if (cancelled) return;
        setErr((e as Error)?.message || 'PDF 加载失败');
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      loadingTask?.destroy?.();
    };
  }, [fetchUrl]);

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

  // Auto-open the sidebar on wide layouts (full-screen always counts as wide);
  // collapse it on narrow embeds (a phone-width preview, the editor side panel).
  useEffect(() => {
    if (outline.length === 0) {
      setTocOpen(false);
      return;
    }
    if (fullscreen) {
      setTocOpen(true);
    } else {
      const w = wrapRef.current?.clientWidth ?? 0;
      setTocOpen(w >= 880);
    }
  }, [outline.length, fullscreen]);

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

  const scrollToPage = (n: number, smooth = true) => {
    const wrap = pageRefs.current.get(n);
    if (wrap) {
      wrap.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
      setPage(Math.min(Math.max(1, n), pageCount || n));
    }
  };

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
      const task = inflight.current.get(n);
      task?.cancel?.();
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
        const cs = cssScaleRef.current;
        const base = p.getViewport({ scale: 1 });
        const cssW = base.width * cs;
        const cssH = base.height * cs;
        const viewport = p.getViewport({ scale: cs * dpr });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        // The canvas's own CSS size dictates the wrapper's final height, so a
        // page whose size differs from page 1 self-corrects without us writing
        // to wrap.style (React owns that and would clobber it on the next
        // scroll-driven re-render).
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto';
        canvas.style.background = '#fff';
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          inflight.current.delete(n);
          return;
        }
        if (!inflight.current.has(n)) return; // cleared while preparing
        wrap.innerHTML = '';
        wrap.appendChild(canvas);
        const task = p.render({ canvasContext: ctx, viewport, canvas });
        inflight.current.set(n, task);
        await task.promise;
        done.current.add(n);
      } catch (e: unknown) {
        if ((e as { name?: string })?.name !== 'RenderingCancelledException') {
          inflight.current.delete(n);
        }
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
      inflight.current.forEach((task) => task?.cancel?.());
      inflight.current.clear();
      done.current.clear();
      pageRefs.current.forEach((wrap) => {
        wrap.innerHTML = '';
      });
    };
  }, [doc, cssScale, pageCount, fullscreen, flow]);

  // Keep the reader anchored to the current page across a zoom / resize repaint
  // (cssScale only changes on those, never on plain scrolling).
  useEffect(() => {
    if (cssScale <= 0) return;
    // Don't anchor on the first settle — only on later zoom / resize repaints —
    // so flow mode doesn't yank the window down to the PDF on initial load.
    if (!scaleInitedRef.current) {
      scaleInitedRef.current = true;
      return;
    }
    const wrap = pageRefs.current.get(pageRef.current);
    if (wrap) wrap.scrollIntoView({ behavior: 'auto', block: 'start' });
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
        ...(flow ? { position: 'sticky', top: 0, zIndex: 5 } : null),
      }}
    >
      <Space>
        {outline.length > 0 && (
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
          disabled={page <= 1}
          onClick={() => scrollToPage(page - 1)}
        />
        <Typography.Text style={{ minWidth: 60, textAlign: 'center', display: 'inline-block' }}>
          {page} / {pageCount || '?'}
        </Typography.Text>
        <Button
          size="small"
          icon={<RightOutlined />}
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
            disabled={zoom <= 0.5}
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
          />
        </Tooltip>
        <Typography.Text style={{ minWidth: 48, textAlign: 'center', display: 'inline-block' }}>
          {Math.round(zoom * 100)}%
        </Typography.Text>
        <Tooltip title="放大">
          <Button
            size="small"
            icon={<ZoomInOutlined />}
            disabled={zoom >= 3}
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))}
          />
        </Tooltip>
        <Tooltip title={fullscreen ? '退出全屏 (Esc)' : '全屏阅读'}>
          <Button
            size="small"
            icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={() => setFullscreen((v) => !v)}
          >
            {fullscreen ? '退出全屏' : '全屏'}
          </Button>
        </Tooltip>
        <Tooltip title="在新标签页用浏览器打开（原生 PDF 阅读器）">
          <Button
            size="small"
            icon={<ExportOutlined />}
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
            }
          : {
              width: '100%',
              height: fullscreen ? 'calc(100vh - 64px)' : height,
              overflow: 'auto',
              padding: PAD,
              background: 'var(--jz-surface-2)',
              borderRadius: 8,
            }
      }
    >
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
        <div
          key={n}
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
            background: '#fff',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          }}
        />
      ))}
    </div>
  );

  const sidebar =
    outline.length > 0 && tocOpen ? (
      <PdfTocPanel
        entries={outline}
        currentPage={page}
        onJump={(pg) => scrollToPage(pg)}
        onClose={() => setTocOpen(false)}
        sticky={flow}
      />
    ) : null;

  // Canvas column on the left, outline rail on the right (mirrors the MD reader).
  // In flow mode the rail sticks (align-start) instead of stretching the row.
  const content = (
    <div style={{ display: 'flex', gap: 12, alignItems: flow ? 'flex-start' : 'stretch', minHeight: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>{body}</div>
      {sidebar}
    </div>
  );

  if (fullscreen) {
    return createPortal(
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2000,
          background: 'var(--jz-bg-app, #0b0d11)',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {toolbar}
        {err && <Alert type="error" message={`PDF 加载失败：${err}`} showIcon />}
        {loading && !err && (
          <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
            <Spin />
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0 }}>{content}</div>
      </div>,
      document.body,
    );
  }

  return (
    <div ref={wrapRef}>
      {toolbar}
      {err && <Alert type="error" message={`PDF 加载失败：${err}`} showIcon />}
      {loading && !err && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
          <Spin>
            <div style={{ color: 'var(--jz-text-muted)', marginTop: 8 }}>加载 PDF 中...</div>
          </Spin>
        </div>
      )}
      {content}
    </div>
  );
}
