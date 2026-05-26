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
  const all: ExportTask[] = [];
  let path = '/exports/';
  for (;;) {
    const { data } = await apiClient.get<Paginated<ExportTask> | ExportTask[]>(path);
    if (Array.isArray(data)) {
      return data;
    }
    all.push(...data.results);
    const next = data.next;
    if (!next) break;
    if (next.startsWith('http')) {
      const u = new URL(next);
      path = u.pathname.startsWith('/api/v1')
        ? u.pathname.slice('/api/v1'.length) + u.search
        : u.pathname + u.search;
    } else {
      path = next.startsWith('/api/v1') ? next.slice('/api/v1'.length) : next;
    }
  }
  return all;
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

/** Fetch artifact with session cookies and trigger a browser download. */
export async function downloadExport(task: ExportTask): Promise<void> {
  const url = downloadUrl(task.id);
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`下载失败 (${res.status})`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = task.filename || `export-${task.id}`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function deleteExport(id: number): Promise<void> {
  await ensureCsrf();
  await apiClient.delete(`/exports/${id}/`);
}
