import { describe, expect, it } from 'vitest';
import {
  SYNODIC_DAYS,
  moonAge,
  moonIllumination,
  moonPhaseFraction,
  moonPhaseName,
} from './moonPhase';

describe('moonPhase', () => {
  it('epoch new moon has age ~0 and no illumination', () => {
    const d = new Date(Date.UTC(2000, 0, 6, 18, 14));
    expect(moonAge(d)).toBeCloseTo(0, 5);
    expect(moonIllumination(d)).toBeCloseTo(0, 5);
    expect(moonPhaseName(d)).toBe('新月');
  });

  it('half a synodic month later is a full moon', () => {
    const d = new Date(Date.UTC(2000, 0, 6, 18, 14) + (SYNODIC_DAYS / 2) * 86_400_000);
    expect(moonPhaseFraction(d)).toBeCloseTo(0.5, 5);
    expect(moonIllumination(d)).toBeCloseTo(1, 5);
    expect(moonPhaseName(d)).toBe('满月');
  });

  it('matches a known real full moon within tolerance (2024-01-25)', () => {
    // Astronomical full moon: 2024-01-25 17:54 UTC
    const d = new Date(Date.UTC(2024, 0, 25, 17, 54));
    expect(moonIllumination(d)).toBeGreaterThan(0.96);
    expect(moonPhaseName(d)).toBe('满月');
  });

  it('matches a known real new moon within tolerance (2024-01-11)', () => {
    // Astronomical new moon: 2024-01-11 11:57 UTC
    const d = new Date(Date.UTC(2024, 0, 11, 11, 57));
    expect(moonIllumination(d)).toBeLessThan(0.04);
  });

  it('quarter phases land near 50% illumination and the right names', () => {
    const base = Date.UTC(2000, 0, 6, 18, 14);
    const firstQuarter = new Date(base + SYNODIC_DAYS * 0.25 * 86_400_000);
    const lastQuarter = new Date(base + SYNODIC_DAYS * 0.75 * 86_400_000);
    expect(moonIllumination(firstQuarter)).toBeCloseTo(0.5, 5);
    expect(moonPhaseName(firstQuarter)).toBe('上弦月');
    expect(moonPhaseName(lastQuarter)).toBe('下弦月');
  });

  it('dates before the epoch still produce ages in range', () => {
    const d = new Date(Date.UTC(1999, 5, 1));
    const age = moonAge(d);
    expect(age).toBeGreaterThanOrEqual(0);
    expect(age).toBeLessThan(SYNODIC_DAYS);
  });
});
