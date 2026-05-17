import { apiClient } from './client';

export interface SearchResult {
  id: number;
  title: string;
  slug: string;
  snippet: string;
  status: 'draft' | 'published';
  visibility: 'private' | 'public';
  knowledge_base: { id: number; name: string };
  updated_at: string;
  rank: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

export async function search(q: string): Promise<SearchResponse> {
  const { data } = await apiClient.get<SearchResponse>('/search/', { params: { q } });
  return data;
}
