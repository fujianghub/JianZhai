import { describe, expect, it } from 'vitest';
import { resolveTablePadding, hasCustomPadding, DENSITY_PRESETS, isDensity } from './tableDensity';
import { sumFirstN } from './tableMaxRows';

describe('resolveTablePadding', () => {
  it('null when nothing set', () => {
    expect(resolveTablePadding(null, null, null)).toBeNull();
  });
  it('maps density presets', () => {
    expect(resolveTablePadding('compact', null, null)).toEqual(DENSITY_PRESETS.compact);
    expect(resolveTablePadding('loose', null, null)).toEqual(DENSITY_PRESETS.loose);
  });
  it('custom overrides preset', () => {
    expect(resolveTablePadding('compact', 12, null)).toEqual({ v: 12, h: DENSITY_PRESETS.compact.h });
    expect(resolveTablePadding('loose', null, 4)).toEqual({ v: DENSITY_PRESETS.loose.v, h: 4 });
  });
  it('custom-only fills missing axis with normal default', () => {
    expect(resolveTablePadding(null, 8, null)).toEqual({ v: 8, h: DENSITY_PRESETS.normal.h });
    expect(resolveTablePadding(null, null, 20)).toEqual({ v: DENSITY_PRESETS.normal.v, h: 20 });
  });
});

describe('hasCustomPadding', () => {
  it('true if either axis set', () => {
    expect(hasCustomPadding(5, null)).toBe(true);
    expect(hasCustomPadding(null, 5)).toBe(true);
    expect(hasCustomPadding(null, null)).toBe(false);
  });
});

describe('isDensity', () => {
  it('guards valid values', () => {
    expect(isDensity('compact')).toBe(true);
    expect(isDensity('x')).toBe(false);
    expect(isDensity(null)).toBe(false);
  });
});

describe('sumFirstN', () => {
  it('null for unlimited or insufficient rows', () => {
    expect(sumFirstN([10, 20, 30], 0)).toBeNull();
    expect(sumFirstN([10, 20], 5)).toBeNull();
    expect(sumFirstN([10, 20, 30], 3)).toBeNull(); // 恰好等于不裁
  });
  it('sums first n + 1px when exceeding', () => {
    expect(sumFirstN([10, 20, 30, 40], 2)).toBe(31); // 10+20 +1
    expect(sumFirstN([25, 25, 25, 25, 25], 3)).toBe(76); // 75 +1
  });
});
