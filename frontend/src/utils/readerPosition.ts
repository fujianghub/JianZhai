/**
 * Per-file reading position memory for the PDF and PPT readers (localStorage).
 *
 * Mirrors utils/epubReader.ts's position store: keyed by the attachment URL
 * without its query (the derived/upload path is uuid-stable), newest-200
 * pruning, and a plain `{…, t}` record. The Markdown reader keeps its own
 * percent-based store (utils/readingPosition.ts) — a page number is the right
 * unit here, a scroll fraction is not (zoom / fit changes the page height).
 */

export interface PdfPosition {
  /** 1-based page. */
  page: number;
  /** 0–1 fraction inside the page (from the sticky chrome down). */
  offset: number;
  t: number;
}

export interface PptxPosition {
  /** 0-based active slide. */
  slide: number;
  t: number;
}

export const POSITION_MAX_ENTRIES = 200;
const K_PDF = 'jz-pdf-pos:v1';
const K_PPTX = 'jz-pptx-pos:v1';

/** Storage key for a media URL: strip the query so retries / nonces don't
 * fork the memory. */
export function positionKey(url: string): string {
  const q = url.indexOf('?');
  return q >= 0 ? url.slice(0, q) : url;
}

function readMap<T>(storageKey: string): Record<string, T> {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, T>) : {};
  } catch {
    return {};
  }
}

function writeMap<T>(storageKey: string, map: Record<string, T>): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    /* quota / private mode — memory is a convenience */
  }
}

/** Keep the newest `max` entries by `t`. */
export function prunePositions<T extends { t: number }>(map: Record<string, T>, max = POSITION_MAX_ENTRIES): Record<string, T> {
  const keys = Object.keys(map);
  if (keys.length <= max) return map;
  keys.sort((a, b) => (map[b].t || 0) - (map[a].t || 0));
  const out: Record<string, T> = {};
  for (const k of keys.slice(0, max)) out[k] = map[k];
  return out;
}

export function savePdfPosition(key: string, pos: { page: number; offset: number }, now = Date.now()): void {
  if (!key || !(pos.page >= 1)) return;
  const map = readMap<PdfPosition>(K_PDF);
  map[key] = { page: Math.floor(pos.page), offset: Math.min(1, Math.max(0, pos.offset || 0)), t: now };
  writeMap(K_PDF, prunePositions(map));
}

export function loadPdfPosition(key: string): PdfPosition | null {
  const rec = readMap<PdfPosition>(K_PDF)[key];
  return rec && rec.page >= 1 ? rec : null;
}

export function clearPdfPosition(key: string): void {
  const map = readMap<PdfPosition>(K_PDF);
  if (key in map) {
    delete map[key];
    writeMap(K_PDF, map);
  }
}

export function savePptxPosition(key: string, slide: number, now = Date.now()): void {
  if (!key || !(slide >= 0)) return;
  const map = readMap<PptxPosition>(K_PPTX);
  map[key] = { slide: Math.floor(slide), t: now };
  writeMap(K_PPTX, prunePositions(map));
}

export function loadPptxPosition(key: string): PptxPosition | null {
  const rec = readMap<PptxPosition>(K_PPTX)[key];
  return rec && rec.slide >= 0 ? rec : null;
}

/** Replace `?page=` / `?slide=` in the address bar without a navigation so a
 * reload / shared link lands on the same spot. */
export function syncUrlParam(name: string, value: string | number | null): void {
  try {
    const url = new URL(window.location.href);
    if (value == null || value === '') url.searchParams.delete(name);
    else url.searchParams.set(name, String(value));
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* non-browser / opaque origins */
  }
}
