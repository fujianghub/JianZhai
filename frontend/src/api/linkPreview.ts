import { apiClient } from './client';

export interface LinkPreview {
  url: string;
  title: string;
  description: string;
  image: string;
  site_name: string;
  favicon: string;
}

const cache = new Map<string, { at: number; data: LinkPreview }>();
const TTL = 5 * 60_000;

export async function getLinkPreview(url: string): Promise<LinkPreview> {
  const hit = cache.get(url);
  const now = Date.now();
  if (hit && now - hit.at < TTL) return hit.data;
  const { data } = await apiClient.get<LinkPreview>('/link-preview/', { params: { url } });
  cache.set(url, { at: now, data });
  return data;
}
