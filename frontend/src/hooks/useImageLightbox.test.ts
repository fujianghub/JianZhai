import { describe, it, expect } from 'vitest';
import { shouldOpenLightbox } from './useImageLightbox';

describe('shouldOpenLightbox', () => {
  const base = { tagName: 'IMG', noLightbox: false, insideAnchor: false, hasSrc: true };

  it('opens for a plain <img> with a src', () => {
    expect(shouldOpenLightbox(base)).toBe(true);
  });

  it('ignores non-image targets', () => {
    expect(shouldOpenLightbox({ ...base, tagName: 'DIV' })).toBe(false);
  });

  it('respects data-no-lightbox opt-out', () => {
    expect(shouldOpenLightbox({ ...base, noLightbox: true })).toBe(false);
  });

  it('skips images wrapped in a link (they already navigate)', () => {
    expect(shouldOpenLightbox({ ...base, insideAnchor: true })).toBe(false);
  });

  it('skips images without a usable src', () => {
    expect(shouldOpenLightbox({ ...base, hasSrc: false })).toBe(false);
  });
});
