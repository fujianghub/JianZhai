import { apiClient, ensureCsrf } from './client';

export interface Tag {
  id: number;
  name: string;
  slug: string;
  color: string;
  document_count: number;
  created_at: string;
}

export interface PublicTag {
  id: number;
  name: string;
  slug: string;
  color: string;
  count: number;
}

export async function listTags(): Promise<Tag[]> {
  const { data } = await apiClient.get<{ results: Tag[] }>('/tags/');
  return data.results;
}

export async function createTag(name: string, color = ''): Promise<Tag> {
  await ensureCsrf();
  const { data } = await apiClient.post<Tag>('/tags/', { name, color });
  return data;
}

export async function updateTag(id: number, payload: Partial<Pick<Tag, 'name' | 'color'>>): Promise<Tag> {
  await ensureCsrf();
  const { data } = await apiClient.patch<Tag>(`/tags/${id}/`, payload);
  return data;
}

export async function deleteTag(id: number): Promise<void> {
  await ensureCsrf();
  await apiClient.delete(`/tags/${id}/`);
}

export async function getDocumentTags(docId: number): Promise<Tag[]> {
  const { data } = await apiClient.get<Tag[]>(`/documents/${docId}/tags/`);
  return data;
}

export async function setDocumentTags(docId: number, tagIds: number[]): Promise<Tag[]> {
  await ensureCsrf();
  const { data } = await apiClient.patch<Tag[]>(`/documents/${docId}/tags/`, { tag_ids: tagIds });
  return data;
}

export async function publicTagCloud(): Promise<PublicTag[]> {
  const { data } = await apiClient.get<PublicTag[]>('/public/tags/');
  return data;
}
