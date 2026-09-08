import { describe, it, expect } from 'vitest';
import { annotationRectToCss, classifyLinkAnnotation } from './pdfLinks';

describe('classifyLinkAnnotation', () => {
  it('ignores non-link annotations', () => {
    expect(classifyLinkAnnotation({ subtype: 'Text', url: 'https://x' })).toBeNull();
  });
  it('prefers the sanitised url, falls back to unsafeUrl', () => {
    expect(classifyLinkAnnotation({ subtype: 'Link', url: 'https://a.example' })).toEqual({ kind: 'url', url: 'https://a.example' });
    expect(classifyLinkAnnotation({ subtype: 'Link', unsafeUrl: 'http://b.example/p?q=1' })).toEqual({ kind: 'url', url: 'http://b.example/p?q=1' });
  });
  it('rejects non-http(s)/mailto schemes and falls through to dest', () => {
    expect(classifyLinkAnnotation({ subtype: 'Link', url: 'javascript:alert(1)' })).toBeNull();
    expect(classifyLinkAnnotation({ subtype: 'Link', unsafeUrl: 'file:///etc/passwd', dest: 'sec' })).toEqual({ kind: 'dest', dest: 'sec' });
  });
  it('returns internal destinations (named and explicit)', () => {
    expect(classifyLinkAnnotation({ subtype: 'Link', dest: 'chapter-2' })).toEqual({ kind: 'dest', dest: 'chapter-2' });
    const explicit = [{ num: 3, gen: 0 }, { name: 'XYZ' }, 0, 700, 0];
    expect(classifyLinkAnnotation({ subtype: 'Link', dest: explicit })).toEqual({ kind: 'dest', dest: explicit });
    expect(classifyLinkAnnotation({ subtype: 'Link', dest: [] })).toBeNull();
  });
  it('supports the four page-navigation named actions only', () => {
    expect(classifyLinkAnnotation({ subtype: 'Link', action: 'NextPage' })).toEqual({ kind: 'action', name: 'NextPage' });
    expect(classifyLinkAnnotation({ subtype: 'Link', action: 'Print' })).toBeNull();
  });
});

describe('annotationRectToCss', () => {
  // Fake viewport: scale 2, page height 800 (PDF y grows upward → flip).
  const viewport = {
    convertToViewportRectangle: (r: number[]) => [r[0] * 2, (800 - r[1]) * 2, r[2] * 2, (800 - r[3]) * 2],
  };
  it('normalises corner order into a positive CSS box', () => {
    expect(annotationRectToCss([10, 700, 110, 720], viewport)).toEqual({ left: 20, top: 160, width: 200, height: 40 });
    // Swapped corners give the same box.
    expect(annotationRectToCss([110, 720, 10, 700], viewport)).toEqual({ left: 20, top: 160, width: 200, height: 40 });
  });
  it('rejects malformed or empty rects', () => {
    expect(annotationRectToCss([1, 2, 3], viewport)).toBeNull();
    expect(annotationRectToCss([10, 700, 10, 720], viewport)).toBeNull();
  });
});
