import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TOC_PREFS,
  DEFAULT_TOC_SITE,
  TOC_FONT_OPTIONS,
  TOC_SCOPES,
  TOC_SCOPE_META,
  isLegacyFlatToc,
  pickTocOverrides,
  relativeTocLevel,
  repairTocPrefs,
  repairTocSite,
  tocFontFamily,
} from './tocPrefs';

describe('tocPrefs', () => {
  it('factory defaults are 紧凑 / 中 / 细 / 宋体 / 淡显 for every scope', () => {
    expect(DEFAULT_TOC_PREFS).toMatchObject({ density: 'compact', size: 'm', weight: 'light', font: 'serif', color: 'muted' });
    expect(TOC_SCOPES).toEqual(['kblist', 'kb', 'article']);
    for (const s of TOC_SCOPES) expect(DEFAULT_TOC_SITE[s]).toEqual(DEFAULT_TOC_PREFS);
    // every scope has meta + features
    for (const s of TOC_SCOPES) expect(TOC_SCOPE_META[s].label).toBeTruthy();
    expect(TOC_SCOPE_META.article.features.depth).toBe(true);
    expect(TOC_SCOPE_META.kblist.features.grouped).toBe(true);
    expect(TOC_SCOPE_META.kblist.features.colorLayered).toBe(false);
  });

  it('picks only valid keys and coerces depth', () => {
    expect(
      pickTocOverrides({ density: 'loose', size: 'xl', font: 'brush', depth: '3', wrap: 'yes', numbers: false, weight: 'bold', grouped: false, junk: 1 }),
    ).toEqual({
      density: 'loose',
      font: 'brush',
      weight: 'bold',
      depth: 3,
      numbers: false,
      grouped: false,
    });
    expect(pickTocOverrides(null)).toEqual({});
  });

  it('repairs on top of a base (site defaults win over code defaults)', () => {
    const base = { ...DEFAULT_TOC_PREFS, font: 'kai' as const, wrap: true };
    expect(repairTocPrefs({ size: 'l' }, base)).toEqual({ ...base, size: 'l' });
    expect(repairTocPrefs(undefined)).toEqual(DEFAULT_TOC_PREFS);
  });

  it('repairs a scoped site blob and spreads a legacy flat one', () => {
    expect(repairTocSite(undefined)).toEqual(DEFAULT_TOC_SITE);
    expect(repairTocSite({ kb: { density: 'loose' }, junk: 1 })).toEqual({
      ...DEFAULT_TOC_SITE,
      kb: { ...DEFAULT_TOC_PREFS, density: 'loose' },
    });
    expect(isLegacyFlatToc({ density: 'loose' })).toBe(true);
    expect(isLegacyFlatToc({ kb: {} })).toBe(false);
    expect(isLegacyFlatToc({})).toBe(false);
    const legacy = repairTocSite({ density: 'loose', font: 'sans' });
    for (const s of TOC_SCOPES) expect(legacy[s]).toMatchObject({ density: 'loose', font: 'sans', grouped: true });
  });

  it('resolves font families through tokens or reader stacks', () => {
    expect(tocFontFamily('ui')).toBe('var(--jz-font-ui)');
    expect(tocFontFamily('serif')).toBe('var(--jz-font-serif)');
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
