import { apiClient } from './client';

export interface MentionSuggestion {
  id: number;
  title: string;
  slug: string;
  knowledge_base: { id: number; name: string };
}

export interface Backlink {
  id: number;
  source: {
    id: number;
    title: string;
    slug: string;
    knowledge_base: number;
    status: 'draft' | 'published';
    visibility: 'private' | 'public';
  };
  context: string;
  position: number;
  created_at: string;
}

export async function searchMentions(q: string): Promise<MentionSuggestion[]> {
  const { data } = await apiClient.get<MentionSuggestion[]>('/documents/mentions/', {
    params: q ? { q } : {},
  });
  return data;
}

export async function getBacklinks(docId: number): Promise<Backlink[]> {
  const { data } = await apiClient.get<Backlink[]>(`/documents/${docId}/backlinks/`);
  return data;
}

export async function getPublicBacklinks(docId: number): Promise<Backlink[]> {
  const { data } = await apiClient.get<Backlink[]>(`/public/posts/by-id/${docId}/backlinks/`);
  return data;
}

export async function resolvePublicById(docId: number): Promise<{ id: number; slug: string; title: string }> {
  const { data } = await apiClient.get(`/public/posts/by-id/${docId}/`);
  return data;
}
