// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { LOCAL_FONT_CANDIDATES, detectLocalFonts, isLocalFontAvailable, isLocalFontKey, localFontStack } from './localFonts';

describe('localFonts', () => {
  it('measures with two generic fallbacks: present fonts agree, absent fonts split', () => {
    // Fake measurer: "Kai" installed (both probes render it → same width),
    // "Nope" missing (each probe equals its own fallback).
    const measure = (font: string) => {
      if (font.startsWith('"Kai"')) return 500;
      if (font === 'monospace') return 600;
      if (font === 'serif') return 420;
      if (font.startsWith('"Nope"')) return font.endsWith('monospace') ? 600 : 420;
      return 0;
    };
    expect(isLocalFontAvailable('Kai', measure)).toBe(true);
    expect(isLocalFontAvailable('Nope', measure)).toBe(false);
  });

  it('degrades to "nothing detected" without a canvas (happy-dom)', () => {
    expect(detectLocalFonts(true)).toEqual([]);
    expect(isLocalFontAvailable('SimSun')).toBe(false);
  });

  it('builds stacks for known local keys and rejects others', () => {
    expect(localFontStack('local:fangsong')).toMatch(/^FangSong, "仿宋", STFangsong, "华文仿宋", FangSong_GB2312, serif$/);
    expect(localFontStack('local:nope')).toBeNull();
    expect(isLocalFontKey('local:kaiti')).toBe(true);
    expect(isLocalFontKey('songti')).toBe(false);
    expect(LOCAL_FONT_CANDIDATES.every((c) => c.key.startsWith('local:') && c.families.length > 0)).toBe(true);
  });
});
