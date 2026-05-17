import { apiClient, ensureCsrf } from './client';
import type { DocumentDetail } from '@/types';

export async function getDocument(id: number): Promise<DocumentDetail> {
  const { data } = await apiClient.get<DocumentDetail>(`/documents/${id}/`);
  return data;
}

export async function createDocument(payload: Partial<DocumentDetail>): Promise<DocumentDetail> {
  await ensureCsrf();
  const { data } = await apiClient.post<DocumentDetail>('/documents/', payload);
  return data;
}

export async function updateDocument(
  id: number,
  payload: Partial<DocumentDetail>
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
