import { apiClient, ensureCsrf } from './client';

export type AttachmentKind = 'image' | 'document' | 'other';

export interface Attachment {
  id: number;
  document: number | null;
  url: string;
  original_filename: string;
  kind: AttachmentKind;
  mime_type: string;
  size: number;
  created_at: string;
}

// Upload/import requests override the global 30s axios timeout: the byte
// upload itself can be slow on LAN/Wi-Fi, and after the bytes reach 100% the
// server still parses everything synchronously (docx→markdown, remote-image
// mirroring) before responding — all of which counts against the same timeout.
// A premature client-side timeout only aborts the *response*, not the server
// work: documents kept getting created while the UI reported failure and never
// refreshed the list ("100% 但列表里没有，刷新才出现").
const UPLOAD_TIMEOUT_MS = 5 * 60_000;
const BATCH_IMPORT_TIMEOUT_MS = 30 * 60_000;

export async function uploadFile(file: File, documentId?: number): Promise<Attachment> {
  await ensureCsrf();
  const fd = new FormData();
  fd.append('file', file);
  if (documentId != null) fd.append('document', String(documentId));
  const { data } = await apiClient.post<Attachment>('/uploads/', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: UPLOAD_TIMEOUT_MS,
  });
  return data;
}

/**
 * Upload a file directly into a knowledge base — backend creates a new
 * Document, fills raw_content for text formats, and attaches the file. Returns
 * the new Document.
 */
/** Parsing options chosen in the import dialog. Applied server-side. */
export interface ImportParseOptions {
  /** Turn on Yuque-style heading numbering for the imported doc(s). */
  headingNumbering?: boolean;
  /** Prepend a whole-document ``[TOC]`` to the imported markdown. */
  insertToc?: boolean;
}

/** Append the parse options as FormData fields (only when truthy). */
function appendImportOptions(fd: FormData, options?: ImportParseOptions): void {
  if (options?.headingNumbering) fd.append('heading_numbering', 'true');
  if (options?.insertToc) fd.append('insert_toc', 'true');
}

export async function importFileAsDoc(
  file: File,
  kbId: number,
  folderId: number | null = null,
  onProgress?: (loaded: number, total: number) => void,
  options?: ImportParseOptions
): Promise<{ id: number; title: string; folder: number | null; knowledge_base: number }> {
  await ensureCsrf();
  const fd = new FormData();
  fd.append('file', file);
  fd.append('knowledge_base', String(kbId));
  if (folderId != null) fd.append('folder', String(folderId));
  appendImportOptions(fd, options);
  const { data } = await apiClient.post('/imports/', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: UPLOAD_TIMEOUT_MS,
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(e.loaded, e.total);
    },
  });
  return data;
}

export interface BatchImportItem {
  file: File;
  /** Relative path inside the dropped folder. Empty string = at the root. */
  relativePath?: string;
}

export interface BatchImportResult {
  created: Array<{ id: number; title: string; folder: number | null; knowledge_base: number }>;
  errors: Array<{ name: string; detail: string }>;
  folders_created: number;
}

/**
 * Batch / folder-aware import. Sends every file in a single multipart request
 * along with its relative path so the server can recreate the directory tree.
 */
export async function importBatch(
  items: BatchImportItem[],
  kbId: number,
  folderId: number | null = null,
  onProgress?: (loaded: number, total: number) => void,
  options?: ImportParseOptions
): Promise<BatchImportResult> {
  await ensureCsrf();
  const fd = new FormData();
  fd.append('knowledge_base', String(kbId));
  if (folderId != null) fd.append('folder', String(folderId));
  appendImportOptions(fd, options);
  for (const it of items) {
    fd.append('files', it.file, it.file.name);
    fd.append('paths', it.relativePath ?? '');
  }
  const { data } = await apiClient.post<BatchImportResult>('/imports/batch/', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: BATCH_IMPORT_TIMEOUT_MS,
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(e.loaded, e.total);
    },
  });
  return data;
}

export interface ZipImportResult extends BatchImportResult {
  /** Entries skipped during unpack (hidden/system files, unsupported types, …). */
  skipped: string[];
}

/**
 * Import a single ``.zip`` bundle (markdown + image folders). The server unpacks
 * it and rewrites each markdown's local ``./images/x.png`` refs to ``/media/…``.
 */
export async function importZip(
  file: File,
  kbId: number,
  folderId: number | null = null,
  onProgress?: (loaded: number, total: number) => void,
  options?: ImportParseOptions
): Promise<ZipImportResult> {
  await ensureCsrf();
  const fd = new FormData();
  fd.append('file', file, file.name);
  fd.append('knowledge_base', String(kbId));
  if (folderId != null) fd.append('folder', String(folderId));
  appendImportOptions(fd, options);
  const { data } = await apiClient.post<ZipImportResult>('/imports/zip/', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: BATCH_IMPORT_TIMEOUT_MS,
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(e.loaded, e.total);
    },
  });
  return data;
}

export async function listDocumentAttachments(docId: number): Promise<Attachment[]> {
  const { data } = await apiClient.get<Attachment[]>(`/documents/${docId}/attachments/`);
  return data;
}

export async function listMyAttachments(kind?: AttachmentKind): Promise<Attachment[]> {
  const { data } = await apiClient.get<Attachment[]>('/attachments/', {
    params: kind ? { kind } : {},
  });
  return data;
}

export async function deleteAttachment(id: number): Promise<void> {
  await ensureCsrf();
  await apiClient.delete(`/attachments/${id}/`);
}

/**
 * Resolve an attachment URL that the browser can fetch.
 *
 * Returns a same-origin URL (path only) by default. In dev, Vite proxies
 * /media/* to Django; in prod the SPA + media should share an origin so cookies
 * + same-origin iframe embedding both work. Setting VITE_MEDIA_BASE_URL would
 * force a cross-origin URL which (a) breaks cookie-auth for protected media
 * and (b) trips X-Frame-Options: SAMEORIGIN — so we deliberately don't honor it
 * by default. Pass an absolute URL through Attachment.url itself if you really
 * need one.
 */
export function attachmentAbsoluteUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return url;
}

/** Pick a previewer hint based on filename + mime. */
export function previewKind(a: Pick<Attachment, 'original_filename' | 'mime_type'>): 'pdf' | 'docx' | 'html' | 'md' | 'image' | 'text' | 'unknown' {
  const lower = a.original_filename.toLowerCase();
  if (lower.endsWith('.pdf') || a.mime_type === 'application/pdf') return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'md';
  if (a.mime_type.startsWith('image/')) return 'image';
  if (lower.endsWith('.txt') || a.mime_type.startsWith('text/')) return 'text';
  return 'unknown';
}
