// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyMotionLevel,
  currentMotionLevel,
  decorativeMotionEnabled,
  loadMotionLevel,
  prefersReducedMotion,
  saveMotionLevel,
} from './motionPref';

const LEVEL_KEY = 'jianzhai:motionLevel';

function stubMatchMedia(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList);
}

afterEach(() => {
  localStorage.removeItem(LEVEL_KEY);
  delete document.documentElement.dataset.motion;
  vi.restoreAllMocks();
});

describe('loadMotionLevel / saveMotionLevel', () => {
  it('defaults to full when nothing persisted', () => {
    expect(loadMotionLevel()).toBe('full');
  });

  it('round-trips a saved level', () => {
    saveMotionLevel('medium');
    expect(loadMotionLevel()).toBe('medium');
  });

  it('falls back to full on garbage values', () => {
    localStorage.setItem(LEVEL_KEY, 'turbo');
    expect(loadMotionLevel()).toBe('full');
  });
});

describe('applyMotionLevel / currentMotionLevel', () => {
  it('writes data-motion for non-default levels and removes it for full', () => {
    applyMotionLevel('min');
    expect(document.documentElement.dataset.motion).toBe('min');
    expect(currentMotionLevel()).toBe('min');
    applyMotionLevel('full');
    expect(document.documentElement.dataset.motion).toBeUndefined();
    expect(currentMotionLevel()).toBe('full');
  });
});

describe('prefersReducedMotion', () => {
  it('is true under OS reduce even at level full', () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
  });

  it('is true at level min without OS reduce', () => {
    stubMatchMedia(false);
    applyMotionLevel('min');
    expect(prefersReducedMotion()).toBe(true);
  });

  it('is false at full/medium without OS reduce', () => {
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
    applyMotionLevel('medium');
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('decorativeMotionEnabled', () => {
  it('is on only at level full without OS reduce', () => {
    stubMatchMedia(false);
    expect(decorativeMotionEnabled()).toBe(true);
    applyMotionLevel('medium');
    expect(decorativeMotionEnabled()).toBe(false);
    applyMotionLevel('min');
    expect(decorativeMotionEnabled()).toBe(false);
  });

  it('is off under OS reduce regardless of level', () => {
    stubMatchMedia(true);
    expect(decorativeMotionEnabled()).toBe(false);
  });
});
