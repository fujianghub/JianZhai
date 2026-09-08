/**
 * Paint one PDF page as pdf.js's three-layer stack inside a host element:
 *
 *   .jz-pdf-page-inner            (relative box, CSS size = page × cssScale)
 *     ├── <canvas>                (raster, DPR-scaled backing store)
 *     ├── .textLayer.jz-pdf-textlayer   (transparent text → selectable/copyable)
 *     └── .jz-pdf-linklayer       (<a> overlays for /Link annotations)
 *
 * Shared by the continuous-scroll reader (PdfCanvas) and the single-slide PPT
 * reader (PdfPageView) so both get text selection and clickable links from the
 * same code path.
 *
 * Scale contract (mirrors pdf.js's own viewer CSS): the inner box carries
 * `--scale-factor` (our CSS scale) and `--user-unit` (the page's /UserUnit);
 * reader.css derives `--total-scale-factor` from them and sets
 * `--scale-round-x/y`, which pdf.js's `setLayerDimensions` needs to size the
 * text layer. The TextLayer viewport is the *CSS* viewport (scale = cssScale,
 * not × dpr) — pdf.js multiplies by the device pixel ratio internally for its
 * glyph measurements.
 */
import * as pdfjs from 'pdfjs-dist';
import type { PDFPageProxy, PageViewport } from 'pdfjs-dist';
import {
  annotationRectToCss,
  classifyLinkAnnotation,
  type PdfLinkAnnotation,
  type PdfLinkTarget,
} from '@/utils/pdfLinks';
import { registerTextLayer, unregisterTextLayer } from '@/utils/pdfTextSelection';

export interface RenderPdfPageOptions {
  page: PDFPageProxy;
  /** CSS pixels per PDF unit (already includes fit/zoom). */
  cssScale: number;
  /** Device pixel ratio for the canvas backing store (caller caps it). */
  dpr: number;
  /** Element whose children are replaced by the page stack. */
  host: HTMLElement;
  /** Internal link / named-action click handler (external URLs open natively). */
  onLink?: (target: PdfLinkTarget) => void;
  /** Opt out of a layer (thumbnails only need the raster; the PPT reader
   * keeps its server-rendered slide image and wants only text + links —
   * `raster: false` skips the canvas entirely). */
  layers?: { text?: boolean; links?: boolean; raster?: boolean };
  /** Reader paper: `background` is painted by pdf.js under the page content
   * (light papers); `key` lands on `data-paper` so CSS can invert the canvas
   * for the dark paper. */
  paper?: { key: string; background: string | null };
  /** Initial highlight marks (search hits) for this page, PDF user space. */
  marks?: PdfMark[];
}

export interface PdfMark {
  /** [x1, y1, x2, y2] in PDF user space (any corner order). */
  rect: [number, number, number, number];
  className?: string;
  /** Highlight colour (annotation marks) → `--jz-ann` on the element. */
  color?: string;
  /** Extra data-* attributes (e.g. the highlight id for hit-testing). */
  data?: Record<string, string>;
}

export interface PdfPageRender {
  /** The `.jz-pdf-page-inner` box (already appended to `host`). */
  inner: HTMLDivElement;
  /** Resolves when raster + text + links are all painted; rejects on a real
   * error (never on cancellation). */
  done: Promise<void>;
  /** Abort in-flight work and unregister the text layer. Idempotent. */
  cancel: () => void;
  /** Replace the highlight marks (search hits / annotations) on this page. */
  setMarks: (marks: PdfMark[]) => void;
  /** CSS-scale viewport used for this render (for selection → PDF space). */
  viewport: PageViewport;
}

function isCancellation(e: unknown): boolean {
  const name = (e as { name?: string })?.name;
  return name === 'RenderingCancelledException' || name === 'AbortException';
}

function onCopyNormalized(e: ClipboardEvent) {
  const sel = document.getSelection();
  if (!sel || !e.clipboardData) return;
  // pdf.js text items may carry presentation forms / NUL glyphs; normalise
  // like the reference viewer does so pasted text is plain.
  const text = pdfjs.normalizeUnicode(sel.toString()).replace(/\u0000/g, '');
  e.clipboardData.setData('text/plain', text);
  e.preventDefault();
}

export function renderPdfPageLayers(opts: RenderPdfPageOptions): PdfPageRender {
  const { page, cssScale, dpr, host, onLink } = opts;
  const wantText = opts.layers?.text !== false;
  const wantLinks = opts.layers?.links !== false;
  const wantRaster = opts.layers?.raster !== false;

  // `getViewport` folds the page's /UserUnit into `scale`, so these CSS sizes
  // already match what the text layer computes from --scale-factor × --user-unit.
  const viewport = page.getViewport({ scale: cssScale });
  const cssW = viewport.width;
  const cssH = viewport.height;

  const inner = document.createElement('div');
  inner.className = 'jz-pdf-page-inner';
  inner.style.width = `${cssW}px`;
  inner.style.height = `${cssH}px`;
  inner.style.setProperty('--scale-factor', String(cssScale));
  inner.style.setProperty('--user-unit', String(page.userUnit || 1));
  if (opts.paper) inner.dataset.paper = opts.paper.key;

  // Mark layer sits between the raster and the (transparent) text layer so
  // selection / links stay interactive above it.
  const markLayer = document.createElement('div');
  markLayer.className = 'jz-pdf-hl-layer';
  const setMarks = (marks: PdfMark[]) => {
    markLayer.replaceChildren();
    for (const m of marks) {
      const box = annotationRectToCss(m.rect, viewport);
      if (!box) continue;
      const el = document.createElement('div');
      el.className = 'jz-pdf-mark' + (m.className ? ` ${m.className}` : '');
      el.style.left = `${box.left}px`;
      el.style.top = `${box.top}px`;
      el.style.width = `${box.width}px`;
      el.style.height = `${box.height}px`;
      if (m.color) el.style.setProperty('--jz-ann', m.color);
      if (m.data) for (const [k, v] of Object.entries(m.data)) el.dataset[k] = v;
      markLayer.append(el);
    }
  };

  let task: ReturnType<PDFPageProxy['render']> | null = null;
  let rasterDone: Promise<void> = Promise.resolve();
  if (wantRaster) {
    const canvas = document.createElement('canvas');
    const renderViewport = page.getViewport({ scale: cssScale * dpr });
    canvas.width = renderViewport.width;
    canvas.height = renderViewport.height;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.className = 'jz-pdf-canvas';
    inner.append(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      host.replaceChildren(inner);
      return { inner, done: Promise.reject(new Error('canvas 2d context unavailable')), cancel: () => {}, setMarks, viewport };
    }
    task = page.render({
      canvasContext: ctx,
      viewport: renderViewport,
      canvas,
      ...(opts.paper?.background ? { background: opts.paper.background } : {}),
    });
    rasterDone = task.promise.catch((e) => {
      if (!isCancellation(e)) throw e;
    });
  }
  inner.append(markLayer);
  if (opts.marks?.length) setMarks(opts.marks);
  host.replaceChildren(inner);

  let cancelled = false;
  let textLayer: pdfjs.TextLayer | null = null;
  let textDiv: HTMLDivElement | null = null;

  const textDone = (async () => {
    if (!wantText) return;
    textDiv = document.createElement('div');
    textDiv.className = 'textLayer jz-pdf-textlayer';
    inner.append(textDiv);
    textLayer = new pdfjs.TextLayer({
      textContentSource: page.streamTextContent({ includeMarkedContent: true, disableNormalization: true }),
      container: textDiv,
      viewport,
    });
    try {
      await textLayer.render();
    } catch (e) {
      if (!isCancellation(e)) throw e;
      return;
    }
    if (cancelled) return;
    const end = document.createElement('div');
    end.className = 'endOfContent';
    textDiv.append(end);
    registerTextLayer(textDiv, end);
    textDiv.addEventListener('copy', onCopyNormalized);
  })();

  const linksDone = (async () => {
    if (!wantLinks) return;
    let annots: PdfLinkAnnotation[];
    try {
      annots = (await page.getAnnotations({ intent: 'display' })) as PdfLinkAnnotation[];
    } catch {
      return; // a broken annotation dict shouldn't hide the page
    }
    if (cancelled) return;
    const items: Array<{ box: NonNullable<ReturnType<typeof annotationRectToCss>>; target: PdfLinkTarget }> = [];
    for (const a of annots) {
      const target = classifyLinkAnnotation(a);
      if (!target || !a.rect) continue;
      const box = annotationRectToCss(a.rect, viewport);
      if (box) items.push({ box, target });
    }
    if (items.length === 0) return;
    const layer = document.createElement('div');
    layer.className = 'jz-pdf-linklayer';
    for (const { box, target } of items) {
      const a = document.createElement('a');
      a.className = 'jz-pdf-link';
      a.style.left = `${box.left}px`;
      a.style.top = `${box.top}px`;
      a.style.width = `${box.width}px`;
      a.style.height = `${box.height}px`;
      if (target.kind === 'url') {
        a.href = target.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.title = target.url;
        a.dataset.jzLink = 'url';
      } else {
        a.href = '#';
        a.dataset.jzLink = target.kind;
        a.title = target.kind === 'action' ? target.name : '跳转到文档内位置';
        a.addEventListener('click', (e) => {
          e.preventDefault();
          onLink?.(target);
        });
      }
      layer.append(a);
    }
    inner.append(layer);
  })();

  const done = Promise.all([rasterDone, textDone, linksDone]).then(() => undefined);

  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    task?.cancel();
    textLayer?.cancel();
    if (textDiv) {
      textDiv.removeEventListener('copy', onCopyNormalized);
      unregisterTextLayer(textDiv);
    }
  };

  return { inner, done, cancel, setMarks, viewport };
}
