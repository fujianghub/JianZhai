import { describe, it, expect } from 'vitest';
import { destPosition, resolveDest } from './pdfDest';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const refA = { num: 1, gen: 0 };
const refB = { num: 2, gen: 0 };

function makeDoc(opts: Partial<{
  pageIndex: (ref: unknown) => number;
  destination: (name: string) => unknown[] | null;
}> = {}): PDFDocumentProxy {
  return {
    getPageIndex: async (ref: unknown) => (opts.pageIndex ? opts.pageIndex(ref) : 0),
    getDestination: async (name: string) => (opts.destination ? opts.destination(name) : null),
  } as unknown as PDFDocumentProxy;
}

describe('destPosition', () => {
  it('reads XYZ left/top', () => {
    expect(destPosition([refA, { name: 'XYZ' }, 72, 700, 0])).toEqual({ left: 72, top: 700 });
  });
  it('treats null XYZ coordinates as absent', () => {
    expect(destPosition([refA, { name: 'XYZ' }, null, null, null])).toEqual({ left: null, top: null });
  });
  it('reads FitH / FitBH top', () => {
    expect(destPosition([refA, { name: 'FitH' }, 650])).toEqual({ left: null, top: 650 });
    expect(destPosition([refA, { name: 'FitBH' }, 640])).toEqual({ left: null, top: 640 });
  });
  it('reads FitR top from the rectangle', () => {
    expect(destPosition([refA, { name: 'FitR' }, 10, 20, 300, 500])).toEqual({ left: 10, top: 500 });
  });
  it('has no position for Fit / FitV / unknown modes', () => {
    expect(destPosition([refA, { name: 'Fit' }])).toEqual({ left: null, top: null });
    expect(destPosition([refA, { name: 'FitV' }, 10])).toEqual({ left: null, top: null });
    expect(destPosition([refA])).toEqual({ left: null, top: null });
  });
});

describe('resolveDest', () => {
  it('resolves an explicit ref through getPageIndex (1-based page)', async () => {
    const dest = await resolveDest(
      makeDoc({ pageIndex: (r) => (r === refB ? 4 : 0) }),
      [refB, { name: 'XYZ' }, 0, 500, null],
    );
    expect(dest).toEqual({ page: 5, top: 500, left: 0 });
  });

  it('resolves a named destination via getDestination', async () => {
    const dest = await resolveDest(
      makeDoc({ destination: (n) => (n === 'sec2' ? [refA, { name: 'FitH' }, 420] : null), pageIndex: () => 1 }),
      'sec2',
    );
    expect(dest).toEqual({ page: 2, top: 420, left: null });
  });

  it('accepts a plain 0-based page index in place of a ref', async () => {
    const dest = await resolveDest(makeDoc(), [3, { name: 'Fit' }]);
    expect(dest).toEqual({ page: 4, top: null, left: null });
  });

  it('returns null for empty / unknown / failing destinations', async () => {
    expect(await resolveDest(makeDoc(), null)).toBeNull();
    expect(await resolveDest(makeDoc(), 'missing')).toBeNull();
    expect(await resolveDest(makeDoc(), [])).toBeNull();
    expect(await resolveDest(makeDoc(), [-1, { name: 'Fit' }])).toBeNull();
    expect(
      await resolveDest(makeDoc({ pageIndex: () => { throw new Error('nope'); } }), [refA]),
    ).toBeNull();
  });
});
