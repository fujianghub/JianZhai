/**
 * Colour-math tests for the Mermaid theme normaliser.
 *
 * The Mermaid pipeline ingests CSS variables from the page; the page uses
 * half-transparent ``rgba(...)`` for glassmorphism surfaces (e.g.
 * ``--jz-surface: rgba(255, 255, 255, 0.62)``). A previous DOM-probe based
 * implementation either fed those rgba strings to Mermaid (which broke
 * its lighten/darken math with NaN) or returned an empty string when the
 * probe couldn't be computed before its layout flush.
 *
 * These tests pin the contract: regardless of input form, every colour
 * fed to Mermaid is a flat opaque ``#rrggbb``.
 */
import { describe, it, expect } from 'vitest';
import { __test__ } from './mermaid';

const { parseColor, mixColors, normalizeForMermaid } = __test__;

describe('parseColor', () => {
  it('parses 6-char hex', () => {
    expect(parseColor('#10b981')).toEqual([0x10, 0xb9, 0x81, 1]);
  });
  it('parses 3-char hex', () => {
    expect(parseColor('#abc')).toEqual([0xaa, 0xbb, 0xcc, 1]);
  });
  it('parses 8-char hex (alpha)', () => {
    expect(parseColor('#10b98180')).toEqual([0x10, 0xb9, 0x81, 0x80 / 255]);
  });
  it('parses rgb()', () => {
    expect(parseColor('rgb(16, 185, 129)')).toEqual([16, 185, 129, 1]);
  });
  it('parses rgba() — the page-token form that broke the DOM probe', () => {
    expect(parseColor('rgba(255, 255, 255, 0.62)')).toEqual([255, 255, 255, 0.62]);
  });
  it('parses whitespace-separated modern syntax', () => {
    expect(parseColor('rgb(60 60 67 / 0.13)')).toEqual([60, 60, 67, 0.13]);
  });
  it('returns null for unknown forms (hsl, oklch, named colours)', () => {
    expect(parseColor('hsl(120 50% 50%)')).toBeNull();
    expect(parseColor('red')).toBeNull();
    expect(parseColor('')).toBeNull();
  });
});

describe('mixColors', () => {
  it('produces a flat #rrggbb regardless of input alpha', () => {
    const out = mixColors('rgba(255, 255, 255, 0.62)', '#10b981', 8);
    expect(out).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it('mixing identical colours returns the same opaque colour', () => {
    expect(mixColors('#10b981', '#10b981', 50)).toBe('#10b981');
  });
  it('falls back to the base when either side is unparseable', () => {
    expect(mixColors('hsl(0 0% 0%)', '#fff', 50)).toBe('hsl(0 0% 0%)');
  });
  it('composes semi-transparent base over white before mixing', () => {
    // rgba(255,255,255,0.62) over white → #ffffff (already opaque white)
    // mixed 8% with #10b981 → should be close to #f1f9f6 ish.
    const out = mixColors('rgba(255, 255, 255, 0.62)', '#10b981', 8);
    const channels = out.slice(1).match(/.{2}/g)!.map((h) => parseInt(h, 16));
    // All channels should be in the 220-255 range (near white, slightly pulled toward jade).
    for (const v of channels) {
      expect(v).toBeGreaterThanOrEqual(200);
      expect(v).toBeLessThanOrEqual(255);
    }
  });
});

describe('normalizeForMermaid', () => {
  it('strips alpha into an opaque hex', () => {
    expect(normalizeForMermaid('rgba(255, 255, 255, 0.62)', '#000')).toBe('#ffffff');
  });
  it('falls back when input is unparseable', () => {
    expect(normalizeForMermaid('oklch(50% 0.1 200)', '#888888')).toBe('#888888');
  });
  it('returns plain hex unchanged (round-trips)', () => {
    expect(normalizeForMermaid('#10b981', '#000')).toBe('#10b981');
  });
});
