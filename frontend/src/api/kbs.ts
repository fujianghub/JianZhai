import { apiClient, ensureCsrf } from './client';
import type { KBTree, KnowledgeBase, Paginated, PublicKB, PublicKBTree } from '@/types';
import type { Tag as ApiTag } from './tags';

export async function listKBs(): Promise<KnowledgeBase[]> {
  const { data } = await apiClient.get<Paginated<KnowledgeBase>>('/kbs/');
  return data.results;
}

export async function getKB(id: number): Promise<KnowledgeBase> {
  const { data } = await apiClient.get<KnowledgeBase>(`/kbs/${id}/`);
  return data;
}

export async function createKB(payload: Partial<KnowledgeBase>): Promise<KnowledgeBase> {
  await ensureCsrf();
  const { data } = await apiClient.post<KnowledgeBase>('/kbs/', payload);
  return data;
}

export async function updateKB(
  id: number,
  payload: Partial<KnowledgeBase>
): Promise<KnowledgeBase> {
  await ensureCsrf();
  const { data } = await apiClient.patch<KnowledgeBase>(`/kbs/${id}/`, payload);
  return data;
}

export async function deleteKB(id: number): Promise<void> {
  await ensureCsrf();
  await apiClient.delete(`/kbs/${id}/`);
}

export async function getKBTree(id: number): Promise<KBTree> {
  const { data } = await apiClient.get<KBTree>(`/kbs/${id}/tree/`);
  return data;
}

export async function getKBTags(id: number): Promise<ApiTag[]> {
  const { data } = await apiClient.get<ApiTag[]>(`/kbs/${id}/tags/`);
  return data;
}

export async function setKBTags(id: number, tagIds: number[]): Promise<ApiTag[]> {
  await ensureCsrf();
  const { data } = await apiClient.patch<ApiTag[]>(`/kbs/${id}/tags/`, { tag_ids: tagIds });
  return data;
}

// ---- public ----

export async function listPublicKBs(): Promise<PublicKB[]> {
  const { data } = await apiClient.get<Paginated<PublicKB>>('/public/kbs/');
  return data.results;
}

export async function getPublicKBTree(slug: string): Promise<PublicKBTree> {
  const { data } = await apiClient.get<PublicKBTree>(
    `/public/kbs/${encodeURIComponent(slug)}/tree/`
  );
  return data;
}
