// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadPdfPosition,
  loadPptxPosition,
  positionKey,
  prunePositions,
  savePdfPosition,
  savePptxPosition,
  syncUrlParam,
} from './readerPosition';

beforeEach(() => localStorage.clear());

describe('readerPosition', () => {
  it('keys by url without query', () => {
    expect(positionKey('/media/uploads/a.pdf?_=1')).toBe('/media/uploads/a.pdf');
    expect(positionKey('/media/uploads/a.pdf')).toBe('/media/uploads/a.pdf');
  });

  it('saves and loads a pdf page + clamped offset', () => {
    savePdfPosition('k', { page: 12.7, offset: 1.4 }, 5);
    expect(loadPdfPosition('k')).toEqual({ page: 12, offset: 1, t: 5 });
    savePdfPosition('k', { page: 0, offset: 0 });
    expect(loadPdfPosition('k')?.page).toBe(12); // invalid page ignored
    expect(loadPdfPosition('missing')).toBeNull();
  });

  it('saves and loads a pptx slide', () => {
    savePptxPosition('d1', 3, 9);
    expect(loadPptxPosition('d1')).toEqual({ slide: 3, t: 9 });
    expect(loadPptxPosition('d2')).toBeNull();
  });

  it('prunes to the newest entries', () => {
    const map: Record<string, { t: number }> = {};
    for (let i = 0; i < 205; i++) map[`k${i}`] = { t: i };
    const pruned = prunePositions(map, 200);
    expect(Object.keys(pruned)).toHaveLength(200);
    expect(pruned.k0).toBeUndefined();
    expect(pruned.k204).toEqual({ t: 204 });
  });

  it('survives a broken localStorage payload', () => {
    localStorage.setItem('jz-pdf-pos:v1', '{not json');
    expect(loadPdfPosition('k')).toBeNull();
    savePdfPosition('k', { page: 2, offset: 0 });
    expect(loadPdfPosition('k')?.page).toBe(2);
  });

  it('syncs a query param in place', () => {
    syncUrlParam('page', 7);
    expect(new URL(window.location.href).searchParams.get('page')).toBe('7');
    syncUrlParam('page', null);
    expect(new URL(window.location.href).searchParams.get('page')).toBeNull();
  });
});
