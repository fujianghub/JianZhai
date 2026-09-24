import { describe, expect, it } from 'vitest';
import {
  BELLY_WINDOW_MS,
  idleDelay,
  lookAroundAt,
  pickIdleBehavior,
  registerPet,
  SPRING_BODY,
  SPRING_HEAD,
  SPRING_PUPIL,
  springSettled,
  springStep,
  type Spring,
} from './catEngine';

function run(cfg: typeof SPRING_HEAD, target: number, frames: number): { s: Spring; peak: number } {
  let s: Spring = { x: 0, v: 0 };
  let peak = 0;
  for (let i = 0; i < frames; i++) {
    s = springStep(s, target, cfg, 1 / 60);
    peak = Math.max(peak, s.x);
  }
  return { s, peak };
}

describe('springStep', () => {
  it.each([
    ['pupil', SPRING_PUPIL],
    ['head', SPRING_HEAD],
    ['body', SPRING_BODY],
  ])('%s spring converges within 2s without blowing up', (_, cfg) => {
    const { s, peak } = run(cfg, 5, 120);
    expect(springSettled(s, 5, 0.05)).toBe(true);
    expect(peak).toBeLessThan(5 * 1.35); // 轻微回弹，但不失控
  });

  it('layers: pupils arrive before head, head before body', () => {
    const at = (cfg: typeof SPRING_HEAD) => run(cfg, 1, 6).s.x; // 100ms 后
    expect(at(SPRING_PUPIL)).toBeGreaterThan(at(SPRING_HEAD));
    expect(at(SPRING_HEAD)).toBeGreaterThan(at(SPRING_BODY));
  });

  it('clamps huge dt (tab resumed) so integration stays stable', () => {
    const s = springStep({ x: 0, v: 0 }, 10, SPRING_PUPIL, 5);
    expect(Number.isFinite(s.x)).toBe(true);
    expect(Math.abs(s.x)).toBeLessThan(20);
  });
});

describe('idle scheduling', () => {
  const seq = (vals: number[]) => {
    let i = 0;
    return () => vals[i++ % vals.length];
  };

  it('peek cat never picks body-only behaviours', () => {
    for (let r = 0; r < 1; r += 0.01) {
      expect(['lick', 'tail-flick', 'belly']).not.toContain(pickIdleBehavior(() => r, false));
    }
  });

  it('full cat can pick every idle behaviour', () => {
    const seen = new Set<string>();
    for (let r = 0; r < 1; r += 0.005) seen.add(pickIdleBehavior(() => r, true));
    expect([...seen].sort()).toEqual(['ear-l', 'ear-r', 'lick', 'look-around', 'tail-flick', 'yawn']);
  });

  it('idle delay stays between 3.2s and 8s', () => {
    expect(idleDelay(seq([0]))).toBe(3200);
    expect(idleDelay(seq([0.999999]))).toBeLessThanOrEqual(8000);
  });

  it('pet clicks outside the window are forgotten', () => {
    let c = registerPet([], 0);
    c = registerPet(c, 500);
    expect(c).toHaveLength(2);
    c = registerPet(c, 500 + BELLY_WINDOW_MS + 1);
    expect(c).toEqual([500 + BELLY_WINDOW_MS + 1]);
  });

  it('look-around script: left, right, centre', () => {
    expect(lookAroundAt(100)).toBe(-1);
    expect(lookAroundAt(1000)).toBe(1);
    expect(lookAroundAt(2000)).toBe(0);
  });
});
