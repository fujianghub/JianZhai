import { describe, it, expect } from 'vitest';
import { flattenTextContent, groupHitsByPage, searchPdfIndex, type PdfTextIndex } from './pdfTextIndex';

function item(str: string, x: number, y: number, w = 10, h = 12, hasEOL = false) {
  return { str, transform: [1, 0, 0, 1, x, y], width: w, height: h, hasEOL };
}

describe('flattenTextContent', () => {
  it('concatenates items with spaces / newlines and records offsets', () => {
    const pg = flattenTextContent(3, [item('Hello', 10, 700), item('world', 60, 700, 30, 12, true), item('next', 10, 680)]);
    expect(pg.text).toBe('Hello world\nnext ');
    expect(pg.items.map((i) => [i.str, i.start])).toEqual([['Hello', 0], ['world', 6], ['next', 12]]);
    expect(pg.items[1]).toMatchObject({ x: 60, y: 700, w: 30, h: 12 });
  });
  it('keeps EOL of empty items', () => {
    const pg = flattenTextContent(1, [item('a', 0, 0), { str: '', transform: [1, 0, 0, 1, 0, 0], width: 0, height: 0, hasEOL: true }, item('b', 0, 0)]);
    expect(pg.text).toBe('a \nb ');
  });
});

describe('searchPdfIndex', () => {
  const index: PdfTextIndex = {
    complete: true,
    pages: [
      flattenTextContent(1, [item('Routing', 10, 700, 40, 12), item('table', 60, 700, 30, 12, true), item('routing again', 10, 680, 80, 12)]),
      flattenTextContent(2, [item('No match here', 10, 700, 80, 12)]),
      flattenTextContent(3, [item('ROUTING', 10, 500, 40, 12)]),
    ],
  };
  it('is case-insensitive by default and returns page + box + context', () => {
    const hits = searchPdfIndex(index, 'routing');
    expect(hits.map((h) => [h.page, h.start])).toEqual([[1, 0], [1, 14], [3, 0]]);
    expect(hits[0]).toMatchObject({ match: 'Routing', rect: [10, 700, 50, 712], top: 712 });
    expect(hits[1].pre).toBe('Routing table ');
    expect(hits[1].match).toBe('routing');
  });
  it('honours matchCase and maxPerPage', () => {
    expect(searchPdfIndex(index, 'ROUTING', { matchCase: true }).map((h) => h.page)).toEqual([3]);
    expect(searchPdfIndex(index, 'routing', { maxPerPage: 1 }).map((h) => h.page)).toEqual([1, 3]);
    expect(searchPdfIndex(index, '   ')).toEqual([]);
  });
  it('groups hits by page', () => {
    const groups = groupHitsByPage(searchPdfIndex(index, 'routing'));
    expect(groups.map((g) => [g.page, g.hits.length])).toEqual([[1, 2], [3, 1]]);
  });
});
