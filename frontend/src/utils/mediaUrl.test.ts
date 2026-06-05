import { afterEach, describe, expect, it, vi } from 'vitest';
import { mediaUrl } from './mediaUrl';

afterEach(() => vi.unstubAllEnvs());

describe('mediaUrl', () => {
  it('passes through when no base is configured (dev default)', () => {
    vi.stubEnv('VITE_MEDIA_BASE_URL', '');
    expect(mediaUrl('/media/avatars/2026/06/u.webp')).toBe('/media/avatars/2026/06/u.webp');
  });

  it('does not double the /media prefix with a relative base (production build)', () => {
    vi.stubEnv('VITE_MEDIA_BASE_URL', '/media');
    expect(mediaUrl('/media/avatars/2026/06/u.webp')).toBe('/media/avatars/2026/06/u.webp');
  });

  it('rebases onto a cross-origin media host', () => {
    vi.stubEnv('VITE_MEDIA_BASE_URL', 'http://host:8002/media');
    expect(mediaUrl('/media/avatars/u.webp')).toBe('http://host:8002/media/avatars/u.webp');
  });

  it('prefixes bare paths without their own /media', () => {
    vi.stubEnv('VITE_MEDIA_BASE_URL', '/media');
    expect(mediaUrl('avatars/u.webp')).toBe('/media/avatars/u.webp');
  });

  it('keeps absolute URLs and empty values untouched', () => {
    vi.stubEnv('VITE_MEDIA_BASE_URL', '/media');
    expect(mediaUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(mediaUrl(null)).toBeUndefined();
  });
});
