/** Resolve avatar/media paths from the API (usually `/media/...`). */
export function mediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = import.meta.env.VITE_MEDIA_BASE_URL?.replace(/\/$/, '') ?? '';
  return base ? `${base}${path.startsWith('/') ? path : `/${path}`}` : path;
}
