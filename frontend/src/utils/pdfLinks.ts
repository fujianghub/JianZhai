/**
 * Pure helpers for turning pdf.js link annotations into clickable overlays.
 *
 * `page.getAnnotations()` yields loosely-typed objects; a `Link` annotation
 * carries one of: `url` (external, already sanitised by pdf.js — `unsafeUrl`
 * is the raw fallback), `dest` (GoTo inside the document), or a named
 * `action` (`NextPage` etc.). Everything else (JavaScript, GoToR, Launch…) is
 * ignored: we never execute embedded actions.
 */
import type { PageViewport } from 'pdfjs-dist';
import type { RawPdfDest } from './pdfDest';

export type PdfNamedAction = 'FirstPage' | 'LastPage' | 'NextPage' | 'PrevPage';

export type PdfLinkTarget =
  | { kind: 'url'; url: string }
  | { kind: 'dest'; dest: string | unknown[] }
  | { kind: 'action'; name: PdfNamedAction };

export interface PdfLinkAnnotation {
  subtype?: string;
  rect?: number[];
  url?: string;
  unsafeUrl?: string;
  dest?: RawPdfDest;
  action?: string;
}

const NAMED_ACTIONS = new Set<string>(['FirstPage', 'LastPage', 'NextPage', 'PrevPage']);
const SAFE_URL = /^(https?|mailto):/i;

export function classifyLinkAnnotation(a: PdfLinkAnnotation): PdfLinkTarget | null {
  if (!a || a.subtype !== 'Link') return null;
  const url = a.url || a.unsafeUrl;
  if (url && SAFE_URL.test(url)) return { kind: 'url', url };
  if (a.dest && (typeof a.dest === 'string' || (Array.isArray(a.dest) && a.dest.length > 0))) {
    return { kind: 'dest', dest: a.dest };
  }
  if (a.action && NAMED_ACTIONS.has(a.action)) return { kind: 'action', name: a.action as PdfNamedAction };
  return null;
}

export interface CssBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Map a PDF user-space `rect` (x1 y1 x2 y2, any corner order) to CSS px
 * inside the page box at the viewport's scale. */
export function annotationRectToCss(
  rect: number[],
  viewport: Pick<PageViewport, 'convertToViewportRectangle'>,
): CssBox | null {
  if (!Array.isArray(rect) || rect.length < 4) return null;
  const r = viewport.convertToViewportRectangle(rect) as number[];
  const left = Math.min(r[0], r[2]);
  const top = Math.min(r[1], r[3]);
  const width = Math.abs(r[2] - r[0]);
  const height = Math.abs(r[3] - r[1]);
  if (!Number.isFinite(left + top + width + height) || width <= 0 || height <= 0) return null;
  return { left, top, width, height };
}
