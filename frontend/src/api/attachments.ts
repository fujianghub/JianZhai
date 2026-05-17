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

export async function uploadFile(file: File, documentId?: number): Promise<Attachment> {
  await ensureCsrf();
  const fd = new FormData();
  fd.append('file', file);
  if (documentId != null) fd.append('document', String(documentId));
  const { data } = await apiClient.post<Attachment>('/uploads/', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/**
 * Upload a file directly into a knowledge base — backend creates a new
 * Document, fills raw_content for text formats, and attaches the file. Returns
 * the new Document.
 */
export async function importFileAsDoc(
  file: File,
  kbId: number,
  folderId: number | null = null
): Promise<{ id: number; title: string; folder: number | null; knowledge_base: number }> {
  await ensureCsrf();
  const fd = new FormData();
  fd.append('file', file);
  fd.append('knowledge_base', String(kbId));
  if (folderId != null) fd.append('folder', String(folderId));
  const { data } = await apiClient.post('/imports/', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
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
