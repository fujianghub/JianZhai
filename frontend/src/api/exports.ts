import { apiClient, ensureCsrf } from './client';

export type ExportScope = 'doc' | 'folder' | 'kb';
export type ExportFormat = 'md' | 'html' | 'pdf' | 'docx' | 'site';
export type ExportStatus = 'pending' | 'running' | 'done' | 'failed';

export interface ExportTask {
  id: number;
  scope: ExportScope;
  target_id: number;
  target_label: string;
  format: ExportFormat;
  status: ExportStatus;
  filename: string;
  file_size: number;
  mime_type: string;
  error: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export async function listExports(): Promise<ExportTask[]> {
  const { data } = await apiClient.get<Paginated<ExportTask>>('/exports/');
  return data.results;
}

export async function getExport(id: number): Promise<ExportTask> {
  const { data } = await apiClient.get<ExportTask>(`/exports/${id}/`);
  return data;
}

export async function createExport(payload: {
  scope: ExportScope;
  target_id: number;
  format: ExportFormat;
}): Promise<ExportTask> {
  await ensureCsrf();
  const { data } = await apiClient.post<ExportTask>('/exports/', payload);
  return data;
}

export function downloadUrl(id: number): string {
  const base = apiClient.defaults.baseURL ?? '/api/v1';
  return `${base}/exports/${id}/download/`;
}

export async function deleteExport(id: number): Promise<void> {
  await ensureCsrf();
  await apiClient.delete(`/exports/${id}/`);
}
