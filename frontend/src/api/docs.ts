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

export async function getDocument(id: number): Promise<DocumentDetail> {
  const { data } = await apiClient.get<DocumentDetail>(`/documents/${id}/`);
  return data;
}

const previewCache = new Map<number, { at: number; data: DocumentPreview }>();
const PREVIEW_TTL_MS = 60_000;

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

export async function publishDocument(id: number): Promise<DocumentDetail> {
  await ensureCsrf();
  const { data } = await apiClient.post<DocumentDetail>(`/documents/${id}/publish/`);
  return data;
}

export async function unpublishDocument(id: number): Promise<DocumentDetail> {
  await ensureCsrf();
  const { data } = await apiClient.post<DocumentDetail>(`/documents/${id}/unpublish/`);
  return data;
}
