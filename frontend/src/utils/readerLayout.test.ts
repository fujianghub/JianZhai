import { describe, expect, it } from 'vitest';
import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEPS,
  clampScale,
  stepFontScale,
} from './readerLayout';

describe('clampScale', () => {
  it('clamps below the slider minimum up to FONT_SCALE_MIN', () => {
    expect(clampScale(0.4)).toBe(FONT_SCALE_MIN); // 0.5
    expect(clampScale(0)).toBe(FONT_SCALE_MIN);
  });

  it('clamps above the slider maximum down to FONT_SCALE_MAX', () => {
    expect(clampScale(1.6)).toBe(FONT_SCALE_MAX); // 1.5
    expect(clampScale(3)).toBe(FONT_SCALE_MAX);
  });

  it('passes through in-range values untouched', () => {
    expect(clampScale(1.25)).toBe(1.25);
    expect(clampScale(0.7)).toBe(0.7);
    expect(clampScale(1)).toBe(1);
  });
});

describe('stepFontScale', () => {
  it('still snaps onto the discrete ladder', () => {
    // From default 1 stepping up/down lands on adjacent ladder stops.
    expect(stepFontScale(1, 1)).toBe(FONT_SCALE_STEPS[2]); // 1.125
    expect(stepFontScale(1, -1)).toBe(FONT_SCALE_STEPS[0]); // 0.875
  });

  it('clamps at the ladder ends, not the slider ends', () => {
    const last = FONT_SCALE_STEPS[FONT_SCALE_STEPS.length - 1];
    expect(stepFontScale(last, 1)).toBe(last); // 1.4, not 1.5
    expect(stepFontScale(FONT_SCALE_STEPS[0], -1)).toBe(FONT_SCALE_STEPS[0]); // 0.875, not 0.5
  });

  it('snaps a slider-set off-ladder value to the nearest stop', () => {
    // 0.6 (slider-reachable) is nearest to 0.875; stepping up moves toward 1.
    expect(stepFontScale(0.6, 1)).toBe(FONT_SCALE_STEPS[1]); // 1
  });
});
