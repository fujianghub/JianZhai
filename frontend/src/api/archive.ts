import { apiClient } from './client';
import type { PublicPost } from '@/types';

export interface ArchiveBucket {
  year: number;
  month: number;
  count: number;
  posts: PublicPost[];
}

export async function getArchive(): Promise<ArchiveBucket[]> {
  const { data } = await apiClient.get<ArchiveBucket[]>('/public/archive/');
  return data;
}
