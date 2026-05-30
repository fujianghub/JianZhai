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

/** Trigger a browser download via a native `<a href download>` click.
 *
 * Why not ``fetch + blob URL`` here? Chrome 122+ treats blob-URL downloads
 * from an insecure context (HTTP on a LAN IP — not localhost, not HTTPS) as
 * "downloads that cannot be verified" and pops the "this file is not securely
 * downloaded" warning regardless of MIME type. A direct ``<a href>`` to the
 * same-origin download endpoint sidesteps the blob layer entirely: the
 * browser sees the real ``Content-Disposition: attachment`` header and treats
 * it as a normal navigation download, so localhost stays warning-free and LAN
 * IP downgrades to the (unavoidable) per-origin "insecure site" indicator
 * instead of a per-download blocker.
 *
 * Vite's dev proxy forwards ``/api/v1/exports/{id}/download/`` to the backend
 * on the same origin as the SPA, so session cookies travel with the request
 * automatically — no ``credentials: 'include'`` plumbing needed. */
export function downloadExport(task: ExportTask): void {
  const url = downloadUrl(task.id);
  const a = document.createElement('a');
  a.href = url;
  // ``download`` is a hint only — the browser still honours the server's
  // ``Content-Disposition`` ``filename=`` when present (which we set in
  // ``ExportTaskViewSet.download``). Keeping it here covers the case where
  // the response somehow lacks the header.
  a.download = task.filename || `export-${task.id}`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function deleteExport(id: number): Promise<void> {
  await ensureCsrf();
  await apiClient.delete(`/exports/${id}/`);
}
