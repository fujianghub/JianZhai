/**
 * PDF highlight anchors: a selection on the pdf.js text layer becomes
 * `{kind:'pdf', page, quads}` in PDF user space (same shape as PDF's own
 * /QuadPoints), which survives zoom / fit / device changes; drawing maps the
 * quads back through the page viewport. Pure functions, unit-tested with a
 * fake viewport.
 */
import type { PdfMark } from '@/components/common/pdf/renderPdfPageLayers';

/** One quad = [x1,y1, x2,y2, x3,y3, x4,y4] (TL, TR, BL, BR) in PDF space. */
export type PdfQuad = [number, number, number, number, number, number, number, number];

export interface PdfHighlightSelector {
  kind: 'pdf';
  page: number;
  quads: PdfQuad[];
}

export interface ViewportLike {
  convertToPdfPoint(x: number, y: number): number[];
  convertToViewportRectangle(rect: number[]): number[];
}

export interface CssRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Merge client rects that sit on the same line (pdf.js emits one rect per
 * text span; a selected line becomes several adjoining boxes). */
export function mergeLineRects(rects: CssRect[], tol = 2): CssRect[] {
  const out: CssRect[] = [];
  for (const r of rects) {
    if (r.width <= 0 || r.height <= 0) continue;
    const last = out[out.length - 1];
    if (last && Math.abs(last.top - r.top) <= tol && Math.abs(last.height - r.height) <= tol * 2 && r.left <= last.left + last.width + 6) {
      const right = Math.max(last.left + last.width, r.left + r.width);
      last.left = Math.min(last.left, r.left);
      last.width = right - last.left;
    } else out.push({ ...r });
  }
  return out;
}

/** CSS rects (relative to the page box) → PDF-space quads. */
export function cssRectsToQuads(rects: CssRect[], viewport: ViewportLike): PdfQuad[] {
  return rects.map((r) => {
    const [x1, y1] = viewport.convertToPdfPoint(r.left, r.top);
    const [x2, y2] = viewport.convertToPdfPoint(r.left + r.width, r.top + r.height);
    // PDF y grows upward: y1 (from CSS top) is the larger value.
    const top = Math.max(y1, y2);
    const bottom = Math.min(y1, y2);
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    return [left, top, right, top, left, bottom, right, bottom];
  });
}

/** Quads → marks for the highlight layer. */
export function quadsToMarks(quads: PdfQuad[], className: string): PdfMark[] {
  return quads.map((q) => ({
    rect: [Math.min(q[0], q[4]), Math.min(q[5], q[1]), Math.max(q[2], q[6]), Math.max(q[1], q[5])],
    className,
  }));
}

/** Bounding box (PDF space) of a set of quads — for "jump to highlight". */
export function quadsBounds(quads: PdfQuad[]): { left: number; top: number; right: number; bottom: number } | null {
  if (!quads.length) return null;
  let left = Infinity, right = -Infinity, top = -Infinity, bottom = Infinity;
  for (const q of quads) {
    for (let i = 0; i < 8; i += 2) {
      left = Math.min(left, q[i]);
      right = Math.max(right, q[i]);
      top = Math.max(top, q[i + 1]);
      bottom = Math.min(bottom, q[i + 1]);
    }
  }
  return { left, top, right, bottom };
}

export function isPdfSelector(sel: unknown): sel is PdfHighlightSelector {
  const s = sel as PdfHighlightSelector | null;
  return !!s && s.kind === 'pdf' && typeof s.page === 'number' && Array.isArray(s.quads) && s.quads.length > 0;
}

/** Build the anchor for a live selection: keep only rects inside the first
 * page the selection touches (a cross-page drag is anchored to its first
 * page — one highlight per page is the deliberate scope). */
export function selectionToPdfSelector(
  range: Range,
  pages: Array<{ page: number; el: Element; viewport: ViewportLike }>,
): { selector: PdfHighlightSelector; rects: CssRect[] } | null {
  const clientRects = Array.from(range.getClientRects());
  for (const { page, el, viewport } of pages) {
    const box = el.getBoundingClientRect();
    const inside = clientRects
      .filter((r) => r.width > 0 && r.height > 0 && r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1)
      .map((r) => ({ left: r.left - box.left, top: r.top - box.top, width: r.width, height: r.height }));
    if (!inside.length) continue;
    const merged = mergeLineRects(inside);
    return { selector: { kind: 'pdf', page, quads: cssRectsToQuads(merged, viewport) }, rects: merged };
  }
  return null;
}
