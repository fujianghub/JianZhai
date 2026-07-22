import { describe, expect, it } from 'vitest';
import { CLOCK_DAY_MODE, CLOCK_NIGHT_MODE, resolveClockMode } from './theme';

function at(hour: number, minute = 0): Date {
  const d = new Date(2026, 6, 22); // local time — resolver uses getHours()
  d.setHours(hour, minute, 0, 0);
  return d;
}

describe('resolveClockMode', () => {
  it('daytime hours resolve to the day theme', () => {
    expect(resolveClockMode(at(6))).toBe(CLOCK_DAY_MODE);
    expect(resolveClockMode(at(12))).toBe(CLOCK_DAY_MODE);
    expect(resolveClockMode(at(17, 59))).toBe(CLOCK_DAY_MODE);
  });

  it('night hours resolve to the night theme', () => {
    expect(resolveClockMode(at(18))).toBe(CLOCK_NIGHT_MODE);
    expect(resolveClockMode(at(23))).toBe(CLOCK_NIGHT_MODE);
    expect(resolveClockMode(at(0))).toBe(CLOCK_NIGHT_MODE);
    expect(resolveClockMode(at(5, 59))).toBe(CLOCK_NIGHT_MODE);
  });
});
