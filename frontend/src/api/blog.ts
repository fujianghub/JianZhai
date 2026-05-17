import { apiClient } from './client';
import type { Paginated, PublicPost, PublicPostDetail } from '@/types';

export async function listPublicPosts(): Promise<PublicPost[]> {
  const { data } = await apiClient.get<Paginated<PublicPost>>('/public/posts/');
  return data.results;
}

export async function getPublicPost(slug: string): Promise<PublicPostDetail> {
  const { data } = await apiClient.get<PublicPostDetail>(`/public/posts/${encodeURIComponent(slug)}/`);
  return data;
}
