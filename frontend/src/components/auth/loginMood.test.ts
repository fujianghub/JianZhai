import { describe, expect, it } from 'vitest';
import { followGaze, gazeFor, PUPIL_MAX_X, PUPIL_MAX_Y, resolveMood, type MoodInputs } from './loginMood';

const base: MoodInputs = {
  focus: null,
  passwordVisible: false,
  passwordFilled: false,
  captchaProgress: null,
  error: false,
  success: false,
};

describe('resolveMood', () => {
  it('idle by default, typing when a text field is focused', () => {
    expect(resolveMood(base)).toBe('idle');
    expect(resolveMood({ ...base, focus: 'username' })).toBe('typing');
    expect(resolveMood({ ...base, focus: 'email' })).toBe('typing');
  });

  it('covers eyes on hidden password focus, peeks when shown and filled', () => {
    expect(resolveMood({ ...base, focus: 'password' })).toBe('cover');
    expect(resolveMood({ ...base, focus: 'password', passwordVisible: true })).toBe('typing');
    expect(resolveMood({ ...base, focus: 'password', passwordVisible: true, passwordFilled: true })).toBe('peek');
    expect(resolveMood({ ...base, passwordVisible: true, passwordFilled: true })).toBe('peek');
  });

  it('follows the captcha while dragging', () => {
    expect(resolveMood({ ...base, focus: 'email', captchaProgress: 0.3 })).toBe('captcha');
  });

  it('priority: success > error > cover > peek > captcha', () => {
    const all: MoodInputs = {
      focus: 'password',
      passwordVisible: false,
      passwordFilled: true,
      captchaProgress: 0.5,
      error: true,
      success: true,
    };
    expect(resolveMood(all)).toBe('success');
    expect(resolveMood({ ...all, success: false })).toBe('error');
    expect(resolveMood({ ...all, success: false, error: false })).toBe('cover');
    expect(resolveMood({ ...all, success: false, error: false, passwordVisible: true })).toBe('peek');
  });
});

describe('gaze', () => {
  it('clamps pupils to the eye and tilt to ±5°', () => {
    const g = followGaze(5000, 5000);
    expect(Math.hypot(g.px / PUPIL_MAX_X, g.py / PUPIL_MAX_Y)).toBeLessThanOrEqual(1.0001);
    expect(followGaze(-9999, 0).tilt).toBe(-5);
    expect(followGaze(0, 0)).toEqual({ px: 0, py: 0, tilt: 0 });
  });

  it('idle follows the pointer; other moods have fixed gaze', () => {
    expect(gazeFor('idle', null)).toBeNull();
    expect(gazeFor('captcha', 0)!.px).toBe(-PUPIL_MAX_X);
    expect(gazeFor('captcha', 1)!.px).toBe(PUPIL_MAX_X);
  });

  it('typing gaze drifts right as the text grows', () => {
    const short = gazeFor('typing', null, 0)!;
    const long = gazeFor('typing', null, 1)!;
    expect(long.px).toBeGreaterThan(short.px);
    expect(long.px).toBe(PUPIL_MAX_X);
    expect(gazeFor('typing', null, 9)).toEqual(long);
  });
});
