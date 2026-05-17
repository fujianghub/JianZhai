import { apiClient, ensureCsrf } from './client';
import type { Folder } from '@/types';

export async function createFolder(payload: Partial<Folder>): Promise<Folder> {
  await ensureCsrf();
  const { data } = await apiClient.post<Folder>('/folders/', payload);
  return data;
}

export async function updateFolder(id: number, payload: Partial<Folder>): Promise<Folder> {
  await ensureCsrf();
  const { data } = await apiClient.patch<Folder>(`/folders/${id}/`, payload);
  return data;
}

export async function deleteFolder(id: number): Promise<void> {
  await ensureCsrf();
  await apiClient.delete(`/folders/${id}/`);
}
