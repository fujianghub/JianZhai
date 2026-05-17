import { apiClient, ensureCsrf } from './client';

export interface Comment {
  id: number;
  document: number;
  author: number | null;
  block_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export async function listComments(docId: number, blockId?: string): Promise<Comment[]> {
  const { data } = await apiClient.get<Comment[]>(`/documents/${docId}/comments/`, {
    params: blockId !== undefined ? { block_id: blockId } : {},
  });
  return data;
}

export async function createComment(
  docId: number,
  content: string,
  blockId: string = ''
): Promise<Comment> {
  await ensureCsrf();
  const { data } = await apiClient.post<Comment>(`/documents/${docId}/comments/`, {
    content,
    block_id: blockId,
  });
  return data;
}

export async function deleteComment(id: number): Promise<void> {
  await ensureCsrf();
  await apiClient.delete(`/comments/${id}/`);
}
