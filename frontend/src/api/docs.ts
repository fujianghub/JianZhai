import { apiClient, ensureCsrf } from './client';
import type { DocumentDetail } from '@/types';

export interface DocumentPreview {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  status: 'draft' | 'published';
  visibility: 'private' | 'public';
  knowledge_base: { id: number; name: string; slug: string; accent_color: string };
  updated_at: string;
  published_at: string | null;
}

export interface DocumentContributor {
  id: number;
  username: string;
  is_staff: boolean;
}

export interface DocumentStats {
  word_count: number;
  char_count: number;
  reading_minutes: number;
  created_at: string | null;
  updated_at: string | null;
  published_at: string | null;
  created_by: DocumentContributor | null;
  last_edited_by: DocumentContributor | null;
  contributors: DocumentContributor[];
  version_count: number;
  edits_last_7d: { date: string; count: number }[];
  structure: {
    headings: { h1: number; h2: number; h3: number; h4: number; h5: number; h6: number };
    code_blocks: number;
    images: number;
    tables: number;
    lists: number;
    links: number;
  };
  links: {
    outgoing_count: number;
    incoming_count: number;
  };
  tags: { id: number; name: string; slug: string; color: string }[];
}

export async function getDocumentStats(id: number): Promise<DocumentStats> {
  const { data } = await apiClient.get<DocumentStats>(`/documents/${id}/stats/`);
  return data;
}

export async function getDocument(id: number): Promise<DocumentDetail> {
  const { data } = await apiClient.get<DocumentDetail>(`/documents/${id}/`);
  return data;
}

const previewCache = new Map<number, { at: number; data: DocumentPreview }>();
const PREVIEW_TTL_MS = 60_000;

/** Drop cached previews — call on login/logout so user A's docs never leak to B. */
export function clearPreviewCache(): void {
  previewCache.clear();
}

export async function getDocumentPreview(id: number): Promise<DocumentPreview> {
  const cached = previewCache.get(id);
  const now = Date.now();
  if (cached && now - cached.at < PREVIEW_TTL_MS) return cached.data;
  const { data } = await apiClient.get<DocumentPreview>(`/documents/${id}/preview/`);
  previewCache.set(id, { at: now, data });
  return data;
}

export async function createDocument(payload: Partial<DocumentDetail>): Promise<DocumentDetail> {
  await ensureCsrf();
  const { data } = await apiClient.post<DocumentDetail>('/documents/', payload);
  return data;
}

export interface DailyNoteResponse {
  id: number;
  knowledge_base: number;
  title: string;
  slug: string;
  created: boolean;
}

export interface ActivityBucket {
  date: string;
  count: number;
}
export interface ActivityResponse {
  days: number;
  buckets: ActivityBucket[];
}

/** Document edit activity for the writing heatmap. Owner-scoped. */
export async function getDocumentActivity(days = 365): Promise<ActivityResponse> {
  const { data } = await apiClient.get<ActivityResponse>('/documents/activity/', {
    params: { days },
  });
  return data;
}

/** Find-or-create the date-keyed daily note in the given KB. Idempotent. */
export async function dailyNote(knowledgeBaseId: number): Promise<DailyNoteResponse> {
  await ensureCsrf();
  const { data } = await apiClient.post<DailyNoteResponse>('/documents/daily-note/', {
    knowledge_base: knowledgeBaseId,
  });
  return data;
}

export interface QuickCaptureResponse {
  id: number;
  knowledge_base: number;
  title: string;
  slug: string;
}

/** Create a small scratch doc in the chosen inbox KB — friction-free path
 *  for the global Cmd/Ctrl+Shift+N capture modal. */
export async function quickCapture(knowledgeBaseId: number, text: string): Promise<QuickCaptureResponse> {
  await ensureCsrf();
  const { data } = await apiClient.post<QuickCaptureResponse>('/documents/quick-capture/', {
    knowledge_base: knowledgeBaseId,
    text,
  });
  return data;
}

export async function updateDocument(
  id: number,
  payload: Partial<DocumentDetail> & { expected_version?: number }
): Promise<DocumentDetail> {
  await ensureCsrf();
  const { data } = await apiClient.patch<DocumentDetail>(`/documents/${id}/`, payload);
  return data;
}

export async function deleteDocument(id: number): Promise<void> {
  await ensureCsrf();
  await apiClient.delete(`/documents/${id}/`);
}

export async function toggleDocumentPin(
  id: number,
  is_pinned: boolean,
): Promise<DocumentDetail> {
  return updateDocument(id, { is_pinned } as Partial<DocumentDetail>);
}

export interface FavoriteDocument {
  id: number;
  title: string;
  slug: string;
  status: 'draft' | 'published';
  visibility: 'private' | 'public';
  doc_format: string;
  knowledge_base: {
    id: number;
    name: string;
    slug: string;
    accent_color: string;
  };
  favorited_at: string;
  updated_at: string;
}

export async function listFavoriteDocuments(): Promise<FavoriteDocument[]> {
  const { data } = await apiClient.get<FavoriteDocument[]>('/documents/favorites/');
  return data;
}

export async function toggleDocumentFavorite(id: number): Promise<{ is_favorited: boolean }> {
  await ensureCsrf();
  const { data } = await apiClient.post<{ is_favorited: boolean }>(
    `/documents/${id}/favorite/`,
  );
  return data;
}

export async function updatePublishedContent(
  id: number,
  payload: { published_content: string; expected_version?: number },
): Promise<DocumentDetail> {
  await ensureCsrf();
  const { data } = await apiClient.patch<DocumentDetail>(
    `/documents/${id}/published/`,
    payload,
  );
  return data;
}

export async function publishDocument(
  id: number,
  expected_version?: number,
): Promise<DocumentDetail> {
  await ensureCsrf();
  const body =
    expected_version != null ? { expected_version } : undefined;
  const { data } = await apiClient.post<DocumentDetail>(
    `/documents/${id}/publish/`,
    body,
  );
  return data;
}

export async function unpublishDocument(
  id: number,
  expected_version?: number,
): Promise<DocumentDetail> {
  await ensureCsrf();
  const body =
    expected_version != null ? { expected_version } : undefined;
  const { data } = await apiClient.post<DocumentDetail>(
    `/documents/${id}/unpublish/`,
    body,
  );
  return data;
}
