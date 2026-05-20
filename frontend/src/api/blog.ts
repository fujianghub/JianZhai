import { apiClient } from './client';
import type { Paginated, PublicPost, PublicPostDetail } from '@/types';

export async function listPublicPosts(params?: { limit?: number; kb?: string; tag?: string }): Promise<PublicPost[]> {
  const { data } = await apiClient.get<Paginated<PublicPost>>('/public/posts/', { params });
  return data.results;
}

export interface AdjacentPost {
  id: number;
  slug: string;
  title: string;
}

export interface AdjacentPosts {
  prev: AdjacentPost | null;
  next: AdjacentPost | null;
}

export async function getAdjacentPosts(slug: string): Promise<AdjacentPosts> {
  const { data } = await apiClient.get<AdjacentPosts>(`/public/posts/${encodeURIComponent(slug)}/adjacent/`);
  return data;
}

export async function getPublicPost(slug: string): Promise<PublicPostDetail> {
  const { data } = await apiClient.get<PublicPostDetail>(`/public/posts/${encodeURIComponent(slug)}/`);
  return data;
}
