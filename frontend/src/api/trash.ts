import { apiClient, ensureCsrf } from './client';

export interface TrashKB {
  type: 'knowledge_base';
  id: number;
  name: string;
  slug: string;
  deleted_at: string | null;
}

export interface TrashDocument {
  type: 'document';
  id: number;
  title: string;
  slug: string;
  status: string;
  visibility: string;
  knowledge_base: {
    id: number;
    name: string;
    slug: string;
    is_deleted: boolean;
  };
  deleted_at: string | null;
}

export interface TrashPage<T> {
  count: number;
  page: number;
  page_size: number;
  results: T[];
}

export interface TrashListResponse {
  knowledge_bases: TrashPage<TrashKB>;
  documents: TrashPage<TrashDocument>;
}

export interface TrashBatchResult {
  succeeded: number[];
  failed: { id: number; detail: string }[];
}

export type TrashEmptyScope = 'documents' | 'knowledge_bases' | 'all';

export interface ListTrashParams {
  kb_page?: number;
  kb_page_size?: number;
  doc_page?: number;
  doc_page_size?: number;
}

export async function listTrash(params: ListTrashParams = {}): Promise<TrashListResponse> {
  const { data } = await apiClient.get<TrashListResponse>('/trash/', { params });
  return data;
}

export async function restoreTrashKB(id: number): Promise<void> {
  await ensureCsrf();
  await apiClient.post(`/trash/kbs/${id}/restore/`);
}

export async function purgeTrashKB(id: number): Promise<void> {
  await ensureCsrf();
  await apiClient.delete(`/trash/kbs/${id}/`);
}

export async function restoreTrashDocument(id: number): Promise<void> {
  await ensureCsrf();
  await apiClient.post(`/trash/documents/${id}/restore/`);
}

export async function purgeTrashDocument(id: number): Promise<void> {
  await ensureCsrf();
  await apiClient.delete(`/trash/documents/${id}/`);
}

export async function batchRestoreTrashKBs(ids: number[]): Promise<TrashBatchResult> {
  await ensureCsrf();
  const { data } = await apiClient.post<TrashBatchResult>('/trash/kbs/batch-restore/', {
    ids,
  });
  return data;
}

export async function batchPurgeTrashKBs(ids: number[]): Promise<TrashBatchResult> {
  await ensureCsrf();
  const { data } = await apiClient.post<TrashBatchResult>('/trash/kbs/batch-purge/', { ids });
  return data;
}

export async function batchRestoreTrashDocuments(ids: number[]): Promise<TrashBatchResult> {
  await ensureCsrf();
  const { data } = await apiClient.post<TrashBatchResult>('/trash/documents/batch-restore/', {
    ids,
  });
  return data;
}

export async function batchPurgeTrashDocuments(ids: number[]): Promise<TrashBatchResult> {
  await ensureCsrf();
  const { data } = await apiClient.post<TrashBatchResult>('/trash/documents/batch-purge/', {
    ids,
  });
  return data;
}

export async function emptyTrash(scope: TrashEmptyScope): Promise<{
  scope: TrashEmptyScope;
  purged_documents: number;
  purged_knowledge_bases: number;
}> {
  await ensureCsrf();
  const { data } = await apiClient.post('/trash/empty/', { scope });
  return data;
}
