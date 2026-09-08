import { describe, it, expect } from 'vitest';
import { cssRectsToQuads, isPdfSelector, mergeLineRects, quadsBounds, quadsToMarks } from './pdfAnchor';

// scale 2, page height 800: CSS (x, y) ↔ PDF (x/2, 800 - y/2)
const viewport = {
  convertToPdfPoint: (x: number, y: number) => [x / 2, 800 - y / 2],
  convertToViewportRectangle: (r: number[]) => [r[0] * 2, (800 - r[1]) * 2, r[2] * 2, (800 - r[3]) * 2],
};

describe('pdfAnchor', () => {
  it('merges adjoining rects on one line, keeps separate lines', () => {
    const merged = mergeLineRects([
      { left: 10, top: 100, width: 40, height: 12 },
      { left: 52, top: 100.5, width: 30, height: 12 },
      { left: 10, top: 120, width: 60, height: 12 },
      { left: 0, top: 0, width: 0, height: 0 },
    ]);
    expect(merged).toEqual([
      { left: 10, top: 100, width: 72, height: 12 },
      { left: 10, top: 120, width: 60, height: 12 },
    ]);
  });

  it('round-trips CSS rects → quads → marks', () => {
    const quads = cssRectsToQuads([{ left: 20, top: 100, width: 100, height: 20 }], viewport);
    // TL (10, 750), TR (60, 750), BL (10, 740), BR (60, 740)
    expect(quads).toEqual([[10, 750, 60, 750, 10, 740, 60, 740]]);
    expect(quadsToMarks(quads, 'x')).toEqual([{ rect: [10, 740, 60, 750], className: 'x' }]);
    expect(quadsBounds(quads)).toEqual({ left: 10, top: 750, right: 60, bottom: 740 });
    expect(quadsBounds([])).toBeNull();
  });

  it('recognises the pdf selector shape', () => {
    expect(isPdfSelector({ kind: 'pdf', page: 2, quads: [[0, 0, 1, 0, 0, 1, 1, 1]] })).toBe(true);
    expect(isPdfSelector({ quote: 'x' })).toBe(false);
    expect(isPdfSelector({ kind: 'pdf', page: 2, quads: [] })).toBe(false);
  });
});
