/** EPUB highlights (+ notes) and bookmarks — private per user, anchored by
 * EPUB CFI. Backend: ``apps/reading``. */
import { apiClient, ensureCsrf } from './client';

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple' | 'red' | 'orange';
export type HighlightStyle = 'highlight' | 'underline' | 'squiggly';

/** TextQuote-style anchor for Markdown highlights (see utils/textAnchor.ts). */
export interface HighlightTextSelector {
  quote: string;
  prefix?: string;
  suffix?: string;
  heading?: string;
}

export interface Highlight {
  id: number;
  document: number;
  /** EPUB anchor; empty string for Markdown highlights. */
  cfi: string;
  /** Markdown anchor; null for EPUB highlights. */
  selector: HighlightTextSelector | null;
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
  selector?: HighlightTextSelector;
  text?: string;
  chapter?: string;
  color?: HighlightColor;
  style?: HighlightStyle;
  note?: string;
}

export interface Bookmark {
  id: number;
  document: number;
  cfi: string;
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

export async function createBookmark(docId: number, input: { cfi: string; chapter?: string; excerpt?: string }): Promise<Bookmark> {
  await ensureCsrf();
  const { data } = await apiClient.post<Bookmark>(`/documents/${docId}/bookmarks/`, input);
  return data;
}

export async function deleteBookmark(id: number): Promise<void> {
  await ensureCsrf();
  await apiClient.delete(`/bookmarks/${id}/`);
}
