/**
 * One PDF page rendered with pdf.js's three-layer stack (raster + selectable
 * text + clickable links) at "fit container width × zoom". Used by the PPT
 * reader to replace its main-slide <img> with a text-selectable page while
 * keeping the thumbnail rail / notes shell untouched.
 *
 * `placeholder` (the legacy slide image) stays on screen until the first paint
 * lands, so switching slides never flashes an empty box; if the page can't be
 * painted the placeholder simply remains.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { renderPdfPageLayers } from './pdf/renderPdfPageLayers';
import { resolveDest, type PdfDest } from '@/utils/pdfDest';
import type { PdfLinkTarget, PdfNamedAction } from '@/utils/pdfLinks';
import { paperCanvasBackground, useReaderPaper } from '@/utils/readerPaper';

/** Cap device-pixel-ratio so zoomed-in canvases don't blow up memory. */
const MAX_DPR = 2;

interface Props {
  doc: PDFDocumentProxy;
  /** 1-based page to show. */
  pageNumber: number;
  /** Multiplier on top of fit-to-width (1 = fill the container). */
  zoom?: number;
  /** In-document link clicked (already resolved to page + position). */
  onInternalLink?: (dest: PdfDest) => void;
  /** Named page-navigation action clicked (NextPage / PrevPage / …). */
  onAction?: (name: PdfNamedAction) => void;
  /** Shown until the page paints (and kept if painting fails). */
  placeholder?: ReactNode;
  /**
   * `canvas` (default): pdf.js paints the page. `image`: the placeholder IS
   * the page (a server-rendered slide image) and pdf.js only lays the text +
   * link layers over it — no canvas at all. The PPT reader uses this so the
   * pixels match its thumbnails / poppler exactly (pdf.js rendering the
   * LibreOffice-embedded font subsets differs per platform and was read as
   * 「乱码」), and the image gets the paper tint via CSS.
   */
  visual?: 'canvas' | 'image';
  className?: string;
  style?: CSSProperties;
}

export default function PdfPageView({
  doc,
  pageNumber,
  zoom = 1,
  onInternalLink,
  onAction,
  placeholder,
  visual = 'canvas',
  className,
  style,
}: Props) {
  const imageMode = visual === 'image';
  const outerRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [ready, setReady] = useState(false);
  const linkRef = useRef({ onInternalLink, onAction });
  linkRef.current = { onInternalLink, onAction };
  const [paper] = useReaderPaper();

  // Track the available width (the container is the flex child that scrolls).
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || width <= 0) return;
    let cancelled = false;
    let cancelRender: (() => void) | null = null;
    setReady(false);
    (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const cssScale = (width * zoom) / base.width;
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const handleLink = async (target: PdfLinkTarget) => {
          if (target.kind === 'dest') {
            const dest = await resolveDest(doc, target.dest);
            if (dest) linkRef.current.onInternalLink?.(dest);
          } else if (target.kind === 'action') {
            linkRef.current.onAction?.(target.name);
          }
        };
        const render = renderPdfPageLayers({
          page,
          cssScale,
          dpr,
          host,
          onLink: (t) => void handleLink(t),
          paper: { key: paper.key, background: paperCanvasBackground(paper) },
          ...(imageMode ? { layers: { raster: false } } : {}),
        });
        cancelRender = render.cancel;
        await render.done;
        if (!cancelled) setReady(true);
      } catch {
        /* keep the placeholder */
      }
    })();
    return () => {
      cancelled = true;
      cancelRender?.();
      host.replaceChildren();
    };
  }, [doc, pageNumber, width, zoom, paper.key, imageMode]);

  if (imageMode) {
    // The image defines the box (width × zoom, same aspect as the PDF page);
    // the transparent layer stack sits on top of it.
    const bg = paperCanvasBackground(paper);
    return (
      <div
        ref={outerRef}
        className={'jz-pdf-pageview is-image' + (className ? ` ${className}` : '')}
        data-paper={paper.key}
        style={{ position: 'relative', width: '100%', ...style }}
      >
        <div className="jz-pdf-pageview-visual" style={{ width: width > 0 ? width * zoom : '100%', background: bg ?? undefined }}>
          {placeholder}
        </div>
        <div ref={hostRef} className="jz-pdf-page" data-page={pageNumber} style={{ position: 'absolute', top: 0, left: 0 }} />
      </div>
    );
  }

  return (
    <div
      ref={outerRef}
      className={'jz-pdf-pageview' + (className ? ` ${className}` : '')}
      style={{ position: 'relative', width: '100%', ...style }}
    >
      <div
        ref={hostRef}
        className="jz-pdf-page"
        data-page={pageNumber}
        style={{ visibility: ready ? 'visible' : 'hidden', minHeight: ready ? undefined : 1 }}
      />
      {!ready && placeholder != null && (
        <div style={{ position: 'absolute', inset: 0 }}>{placeholder}</div>
      )}
    </div>
  );
}
