/** Resolve avatar/media paths from the API (usually `/media/...`). */
export function mediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = import.meta.env.VITE_MEDIA_BASE_URL?.replace(/\/$/, '') ?? '';
  if (!base) return path;
  // Backend ``FileField.url`` values already carry the ``/media`` prefix and
  // the base itself ends in ``/media`` (e.g. ``/media`` in production builds,
  // ``http://host:8002/media`` cross-origin) — strip the path's own prefix
  // first or we'd produce ``/media/media/...`` and 404.
  const rel = path.replace(/^\/media(?=\/)/, '');
  return `${base}${rel.startsWith('/') ? rel : `/${rel}`}`;
}
