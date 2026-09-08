/** EPUB highlights (+ notes) and bookmarks — private per user, anchored by
 * EPUB CFI. Backend: ``apps/reading``. */
import { apiClient, ensureCsrf, readCookie } from './client';

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple' | 'red' | 'orange';
export type HighlightStyle = 'highlight' | 'underline' | 'squiggly';

/** TextQuote-style anchor for Markdown highlights (see utils/textAnchor.ts). */
export interface HighlightTextSelector {
  quote: string;
  prefix?: string;
  suffix?: string;
  heading?: string;
}

/** PDF anchor: one page + PDF user-space quads (see utils/pdfAnchor.ts). */
export interface HighlightPdfSelector {
  kind: 'pdf';
  page: number;
  quads: number[][];
}

export type HighlightSelector = HighlightTextSelector | HighlightPdfSelector;

export interface Highlight {
  id: number;
  document: number;
  /** EPUB anchor; empty string for Markdown / PDF highlights. */
  cfi: string;
  /** Markdown (TextQuote) or PDF (quads) anchor; null for EPUB highlights. */
  selector: HighlightSelector | null;
  text: string;
  chapter: string;
  color: HighlightColor;
  style: HighlightStyle;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface HighlightInput {
  cfi?: string;
  selector?: HighlightSelector;
  text?: string;
  chapter?: string;
  color?: HighlightColor;
  style?: HighlightStyle;
  note?: string;
}

export interface Bookmark {
  id: number;
  document: number;
  /** EPUB anchor; '' for PDF/PPT page bookmarks. */
  cfi: string;
  /** PDF/PPT 1-based page; null for EPUB bookmarks. */
  page: number | null;
  chapter: string;
  excerpt: string;
  created_at: string;
}

export async function listHighlights(docId: number): Promise<Highlight[]> {
  const { data } = await apiClient.get<Highlight[]>(`/documents/${docId}/highlights/`);
  return data;
}

export async function createHighlight(docId: number, input: HighlightInput): Promise<Highlight> {
  await ensureCsrf();
  const { data } = await apiClient.post<Highlight>(`/documents/${docId}/highlights/`, input);
  return data;
}

export async function updateHighlight(id: number, patch: Partial<HighlightInput>): Promise<Highlight> {
  await ensureCsrf();
  const { data } = await apiClient.patch<Highlight>(`/highlights/${id}/`, patch);
  return data;
}

export async function deleteHighlight(id: number): Promise<void> {
  await ensureCsrf();
  await apiClient.delete(`/highlights/${id}/`);
}

export async function listBookmarks(docId: number): Promise<Bookmark[]> {
  const { data } = await apiClient.get<Bookmark[]>(`/documents/${docId}/bookmarks/`);
  return data;
}

export async function createBookmark(
  docId: number,
  input: { cfi?: string; page?: number; chapter?: string; excerpt?: string },
): Promise<Bookmark> {
  await ensureCsrf();
  const { data } = await apiClient.post<Bookmark>(`/documents/${docId}/bookmarks/`, input);
  return data;
}

export async function deleteBookmark(id: number): Promise<void> {
  await ensureCsrf();
  await apiClient.delete(`/bookmarks/${id}/`);
}

/* ── Reading position (cross-device resume) ───────────────────────────── */

/** One row per user × document; each reader writes the anchor it
 * understands (EPUB cfi+fraction, PDF page+offset, PPT slide, MD fraction). */
export interface ReadingPositionRecord {
  document: number;
  cfi: string;
  fraction: number | null;
  page: number | null;
  offset: number | null;
  slide: number | null;
  updated_at: string;
}

export type ReadingPositionInput = Partial<Pick<ReadingPositionRecord, 'cfi' | 'fraction' | 'page' | 'offset' | 'slide'>>;

export async function getReadingPosition(documentId: number): Promise<ReadingPositionRecord | null> {
  const { data } = await apiClient.get<ReadingPositionRecord | null>(`/documents/${documentId}/position/`);
  return data ?? null;
}

/** Upsert the position. `keepalive` sends it with `fetch` so the write
 * survives a tab close / navigation (axios requests are dropped on unload). */
export async function putReadingPosition(documentId: number, body: ReadingPositionInput, opts: { keepalive?: boolean } = {}): Promise<void> {
  const path = `/documents/${documentId}/position/`;
  if (opts.keepalive && typeof fetch === 'function') {
    const base = apiClient.defaults.baseURL ?? '/api/v1';
    const token = readCookie('csrftoken');
    await fetch(`${base}${path}`, {
      method: 'PUT',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-CSRFToken': token } : {}) },
      body: JSON.stringify(body),
    });
    return;
  }
  await ensureCsrf();
  await apiClient.put(path, body);
}

