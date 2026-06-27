import { describe, it, expect } from 'vitest';
import { getPdfOutline } from './pdfOutline';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/** Minimal page-ref stand-ins; getPageIndex maps them to 0-based indices. */
const refA = { num: 1, gen: 0 };
const refB = { num: 2, gen: 0 };
const refC = { num: 3, gen: 0 };

function makeDoc(outline: unknown, opts: Partial<{
  pageIndex: (ref: unknown) => number;
  destination: (name: string) => unknown[] | null;
}> = {}): PDFDocumentProxy {
  return {
    getOutline: async () => outline,
    getPageIndex: async (ref: unknown) =>
      opts.pageIndex ? opts.pageIndex(ref) : 0,
    getDestination: async (name: string) =>
      opts.destination ? opts.destination(name) : null,
  } as unknown as PDFDocumentProxy;
}

describe('getPdfOutline', () => {
  it('returns [] when the PDF has no outline', async () => {
    expect(await getPdfOutline(makeDoc(null))).toEqual([]);
    expect(await getPdfOutline(makeDoc([]))).toEqual([]);
  });

  it('returns [] when getOutline throws', async () => {
    const doc = { getOutline: async () => { throw new Error('boom'); } } as unknown as PDFDocumentProxy;
    expect(await getPdfOutline(doc)).toEqual([]);
  });

  it('flattens nesting into level-tagged entries (1-based)', async () => {
    const outline = [
      { title: 'Chapter 1', dest: [refA], items: [
        { title: 'Section 1.1', dest: [refB], items: [] },
      ] },
      { title: 'Chapter 2', dest: [refC] },
    ];
    const out = await getPdfOutline(makeDoc(outline, {
      pageIndex: (ref) => [refA, refB, refC].indexOf(ref as typeof refA),
    }));
    expect(out).toEqual([
      { title: 'Chapter 1', level: 1, page: 1, key: '0' },
      { title: 'Section 1.1', level: 2, page: 2, key: '0.0' },
      { title: 'Chapter 2', level: 1, page: 3, key: '1' },
    ]);
  });

  it('resolves named (string) destinations via getDestination', async () => {
    const out = await getPdfOutline(makeDoc(
      [{ title: 'Intro', dest: 'intro-anchor' }],
      {
        destination: (name) => (name === 'intro-anchor' ? [refB] : null),
        pageIndex: () => 4,
      },
    ));
    expect(out).toEqual([{ title: 'Intro', level: 1, page: 5, key: '0' }]);
  });

  it('keeps page=null for unresolvable destinations', async () => {
    const out = await getPdfOutline(makeDoc([
      { title: 'No dest', dest: null },
      { title: 'Bad ref', dest: [refA] },
    ], {
      pageIndex: () => { throw new Error('not found'); },
    }));
    expect(out).toEqual([
      { title: 'No dest', level: 1, page: null, key: '0' },
      { title: 'Bad ref', level: 1, page: null, key: '1' },
    ]);
  });

  it('skips blank titles but still recurses into their children', async () => {
    const out = await getPdfOutline(makeDoc([
      { title: '   ', dest: null, items: [{ title: 'Child', dest: [refA] }] },
    ], { pageIndex: () => 0 }));
    expect(out).toEqual([{ title: 'Child', level: 2, page: 1, key: '0.0' }]);
  });
});
