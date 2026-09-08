/**
 * Client-side full-text index over a pdf.js document for in-reader search.
 *
 * Why not the browser's Ctrl+F: PdfCanvas renders pages within ±1 screen and
 * drops the rest, so native find silently reports "3 of 3" on a document with
 * 200 matches. We pull every page's text items once (chunked with idle
 * callbacks, cached per document) and search that; a hit carries the page and
 * the item's PDF-space box so the reader can scroll to it and paint a mark.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface PdfTextItem {
  str: string;
  /** PDF user-space box of the glyph run: [x, y(baseline), width, height]. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Offset of `str` in the page's concatenated text. */
  start: number;
}

export interface PdfPageText {
  page: number;
  text: string;
  items: PdfTextItem[];
}

export interface PdfTextIndex {
  pages: PdfPageText[];
  /** True once every page has been read. */
  complete: boolean;
}

export interface PdfSearchHit {
  page: number;
  /** Character offsets into the page text. */
  start: number;
  end: number;
  pre: string;
  match: string;
  post: string;
  /** PDF user-space rectangle of the first item the match touches. */
  rect: [number, number, number, number];
  /** PDF user-space top (for jumpToDest). */
  top: number;
}

const CONTEXT = 32;

/** Flatten pdf.js text content into one string + item boxes. Items ending a
 * line (``hasEOL``) get a newline so words don't glue across lines. */
export function flattenTextContent(
  page: number,
  items: Array<{ str: string; transform: number[]; width: number; height: number; hasEOL?: boolean }>,
): PdfPageText {
  let text = '';
  const out: PdfTextItem[] = [];
  for (const it of items) {
    if (!it.str) {
      if (it.hasEOL) text += '\n';
      continue;
    }
    const [, , , d, e, f] = it.transform; // a b c d e f — e/f = translation
    const h = it.height || Math.abs(d) || 0;
    out.push({ str: it.str, x: e, y: f, w: it.width || 0, h, start: text.length });
    text += it.str;
    text += it.hasEOL ? '\n' : ' ';
  }
  return { page, text, items: out };
}

/** Read every page's text. `onProgress(done, total)` lets a UI show progress;
 * work yields between pages so a 900-page book doesn't freeze the tab. */
export async function buildPdfTextIndex(
  doc: PDFDocumentProxy,
  opts: { onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<PdfTextIndex> {
  const total = doc.numPages;
  const pages: PdfPageText[] = [];
  for (let n = 1; n <= total; n++) {
    if (opts.signal?.aborted) return { pages, complete: false };
    const p = await doc.getPage(n);
    const tc = await p.getTextContent();
    pages.push(flattenTextContent(n, tc.items as never));
    opts.onProgress?.(n, total);
    if (n % 8 === 0) await new Promise<void>((r) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => r()) : setTimeout(r, 0)));
  }
  return { pages, complete: true };
}

function itemAt(items: PdfTextItem[], offset: number): PdfTextItem | null {
  // Binary search for the item whose [start, start+len) contains offset.
  let lo = 0;
  let hi = items.length - 1;
  let best: PdfTextItem | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].start <= offset) {
      best = items[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best;
}

export interface SearchOptions {
  matchCase?: boolean;
  /** Cap per page (a term like "the" would otherwise flood the list). */
  maxPerPage?: number;
}

export function searchPdfIndex(index: PdfTextIndex, query: string, opts: SearchOptions = {}): PdfSearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const { matchCase = false, maxPerPage = 50 } = opts;
  const needle = matchCase ? q : q.toLowerCase();
  const hits: PdfSearchHit[] = [];
  for (const pg of index.pages) {
    const hay = matchCase ? pg.text : pg.text.toLowerCase();
    let from = 0;
    let n = 0;
    for (;;) {
      const i = hay.indexOf(needle, from);
      if (i < 0 || n >= maxPerPage) break;
      const it = itemAt(pg.items, i);
      const rect: [number, number, number, number] = it ? [it.x, it.y, it.x + it.w, it.y + it.h] : [0, 0, 0, 0];
      hits.push({
        page: pg.page,
        start: i,
        end: i + needle.length,
        pre: pg.text.slice(Math.max(0, i - CONTEXT), i).replace(/\n/g, ' '),
        match: pg.text.slice(i, i + needle.length),
        post: pg.text.slice(i + needle.length, i + needle.length + CONTEXT).replace(/\n/g, ' '),
        rect,
        top: it ? it.y + it.h : 0,
      });
      n += 1;
      from = i + needle.length;
    }
  }
  return hits;
}

/** Group hits by page for the sidebar list. */
export function groupHitsByPage(hits: PdfSearchHit[]): Array<{ page: number; hits: PdfSearchHit[] }> {
  const groups: Array<{ page: number; hits: PdfSearchHit[] }> = [];
  for (const h of hits) {
    const g = groups[groups.length - 1];
    if (g && g.page === h.page) g.hits.push(h);
    else groups.push({ page: h.page, hits: [h] });
  }
  return groups;
}
