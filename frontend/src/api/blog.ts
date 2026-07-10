import { apiClient } from './client';
import type { Paginated, PublicPost, PublicPostDetail, Slide, SlideStatus } from '@/types';

export interface PostSlidesResult {
  slides: Slide[];
  /** '', 'pending', 'done', or 'failed' — lets the reader stop polling on failure. */
  status: SlideStatus;
  /** Human-facing reason when status === 'failed'. */
  error: string;
}

/** Poll a PPT/PPTX post's rendered slide images (empty while still converting). */
export async function fetchPostSlides(postId: number): Promise<PostSlidesResult> {
  const { data } = await apiClient.get<{
    slides: Slide[];
    slide_status?: SlideStatus;
    slide_error?: string;
  }>(`/public/posts/by-id/${postId}/slides/`);
  return {
    slides: data.slides,
    status: data.slide_status ?? '',
    error: data.slide_error ?? '',
  };
}

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

export async function getAdjacentPosts(
  slug: string,
  params?: { kb?: string },
): Promise<AdjacentPosts> {
  const { data } = await apiClient.get<AdjacentPosts>(
    `/public/posts/${encodeURIComponent(slug)}/adjacent/`,
    { params },
  );
  return data;
}

export async function getPublicPost(
  slug: string,
  params?: { kb?: string },
): Promise<PublicPostDetail> {
  const { data } = await apiClient.get<PublicPostDetail>(
    `/public/posts/${encodeURIComponent(slug)}/`,
    { params },
  );
  return data;
}

export interface RelatedPost {
  id: number;
  slug: string;
  title: string;
  reason: 'tag' | 'backlink' | 'mention';
  knowledge_base: {
    id: number;
    name: string;
    slug: string;
    accent_color: string;
  };
  published_at: string | null;
}

export async function getRelatedPosts(
  slug: string,
  params?: { kb?: string },
): Promise<RelatedPost[]> {
  const { data } = await apiClient.get<RelatedPost[]>(
    `/public/posts/${encodeURIComponent(slug)}/related/`,
    { params },
  );
  return data;
}
