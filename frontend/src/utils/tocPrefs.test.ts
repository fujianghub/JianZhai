import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TOC_PREFS,
  TOC_FONT_OPTIONS,
  pickTocOverrides,
  relativeTocLevel,
  repairTocPrefs,
  tocFontFamily,
} from './tocPrefs';

describe('tocPrefs', () => {
  it('picks only valid keys and coerces depth', () => {
    expect(pickTocOverrides({ density: 'loose', size: 'xl', font: 'brush', depth: '3', wrap: 'yes', numbers: false, weight: 'bold', junk: 1 })).toEqual({
      density: 'loose',
      font: 'brush',
      weight: 'bold',
      depth: 3,
      numbers: false,
    });
    expect(pickTocOverrides(null)).toEqual({});
  });

  it('repairs on top of a base (site defaults win over code defaults)', () => {
    const base = { ...DEFAULT_TOC_PREFS, font: 'serif' as const, wrap: true };
    expect(repairTocPrefs({ size: 'l' }, base)).toEqual({ ...base, size: 'l' });
    expect(repairTocPrefs(undefined)).toEqual(DEFAULT_TOC_PREFS);
  });

  it('resolves font families through tokens or reader stacks', () => {
    expect(tocFontFamily('ui')).toBe('var(--jz-font-ui)');
    expect(tocFontFamily('reader')).toContain('--jz-article-font');
    expect(tocFontFamily('reader', 'Georgia, serif')).toBe('Georgia, serif');
    expect(tocFontFamily('brush')).toContain('Ma Shan Zheng');
    expect(new Set(TOC_FONT_OPTIONS.map((o) => o.key)).size).toBe(TOC_FONT_OPTIONS.length);
  });

  it('normalises heading levels to the shallowest present', () => {
    expect(relativeTocLevel(2, 2)).toBe(1);
    expect(relativeTocLevel(4, 2)).toBe(3);
    expect(relativeTocLevel(6, 1)).toBe(4);
  });
});
