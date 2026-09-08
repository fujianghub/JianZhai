/**
 * Resolve a pdf.js destination (outline bookmark / GoTo link target) into a
 * page number plus an optional position inside that page.
 *
 * A `dest` comes in two shapes:
 *   - a named destination (string) → resolved via `doc.getDestination(name)`
 *     into the explicit form below
 *   - an explicit array `[pageRef, {name: 'XYZ'|'FitH'|…}, ...args]` — the
 *     first element is a page reference `{num, gen}` (resolved through
 *     `doc.getPageIndex`), or, in some generators' output, a plain 0-based
 *     page index
 *
 * The fit-mode args are in PDF user space (origin bottom-left, y grows up), so
 * callers convert `top`/`left` through the target page's viewport
 * (`viewport.convertToViewportPoint`) before scrolling. Modes that don't carry
 * a vertical position (`Fit`, `FitB`, `FitV`, `FitBV`) resolve with
 * `top = null`, meaning "page top".
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface PdfDest {
  /** 1-based target page. */
  page: number;
  /** Vertical position in PDF user space, or null for "top of page". */
  top: number | null;
  /** Horizontal position in PDF user space, or null when not given. */
  left: number | null;
}

export type RawPdfDest = string | unknown[] | null | undefined;

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Pull `top`/`left` out of an explicit destination's fit-mode arguments. */
export function destPosition(explicit: unknown[]): Pick<PdfDest, 'top' | 'left'> {
  const mode = (explicit[1] as { name?: string } | undefined)?.name;
  switch (mode) {
    case 'XYZ':
      // [ref, {XYZ}, left, top, zoom]
      return { left: num(explicit[2]), top: num(explicit[3]) };
    case 'FitH':
    case 'FitBH':
      // [ref, {FitH}, top]
      return { left: null, top: num(explicit[2]) };
    case 'FitR':
      // [ref, {FitR}, left, bottom, right, top]
      return { left: num(explicit[2]), top: num(explicit[5]) };
    default:
      return { left: null, top: null };
  }
}

export async function resolveDest(doc: PDFDocumentProxy, dest: RawPdfDest): Promise<PdfDest | null> {
  try {
    if (!dest) return null;
    const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || explicit.length === 0) return null;
    const ref = explicit[0];
    let index: number;
    if (typeof ref === 'number') {
      if (!Number.isInteger(ref) || ref < 0) return null;
      index = ref;
    } else {
      index = await doc.getPageIndex(ref as Parameters<typeof doc.getPageIndex>[0]);
    }
    return { page: index + 1, ...destPosition(explicit) };
  } catch {
    return null;
  }
}
