import { describe, expect, it } from 'vitest';
import { blinkCurve, earGeometry, noise1, poseFor, tailPoints } from './catRig';

describe('poseFor — 情绪语义', () => {
  it('curious perks ears up and forward; shy flattens them (airplane ears)', () => {
    const typing = poseFor('typing', 'none', false);
    expect(typing.earL.lift).toBeGreaterThan(1);
    expect(typing.earL.swivel).toBeLessThan(0);
    for (const p of [poseFor('cover', 'none', false), poseFor('idle', 'shy', false)]) {
      expect(p.earL.flat).toBeGreaterThanOrEqual(0.6);
      expect(p.earL.swivel).toBeGreaterThan(20);
    }
    expect(poseFor('idle', 'none', true).earL.flat).toBeGreaterThan(0.3); // 被盯着：半飞机耳
  });

  it('sad droops from the tip and puffs the tail; excited trembles', () => {
    const err = poseFor('error', 'none', false);
    expect(err.earL.tip).toBeGreaterThan(20);
    expect(err.tail.puff).toBeGreaterThan(18);
    expect(poseFor('success', 'none', false).excite).toBeGreaterThan(0.5);
    expect(poseFor('idle', 'purr', false).excite).toBeGreaterThan(0);
  });

  it('mood outranks idle behaviours and hover', () => {
    expect(poseFor('cover', 'purr', true)).toEqual(poseFor('cover', 'none', false));
  });

  it('blep / wink / peek are asymmetric', () => {
    for (const p of [poseFor('idle', 'blep', false), poseFor('idle', 'wink', false), poseFor('peek', 'none', false)]) {
      expect(p.earL).not.toEqual(p.earR);
    }
  });
});

describe('earGeometry', () => {
  const height = (d: string) => {
    const ys = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter((_, i) => i % 2 === 1);
    return -Math.min(...ys);
  };
  it('lift raises the ear, flat lowers it and hides the inner ear', () => {
    const base = earGeometry({ swivel: 0, lift: 1, flat: 0, tip: 0 });
    const tall = earGeometry({ swivel: 0, lift: 1.12, flat: 0, tip: 0 });
    const flat = earGeometry({ swivel: 0, lift: 1, flat: 0.8, tip: 0 });
    expect(height(tall.outer)).toBeGreaterThan(height(base.outer));
    expect(height(flat.outer)).toBeLessThan(height(base.outer));
    expect(flat.innerOpacity).toBeLessThan(base.innerOpacity);
    expect(base.outer.startsWith('M')).toBe(true);
    expect(base.outer.endsWith('Z')).toBe(true);
  });
  it('mirror flips x only', () => {
    const l = earGeometry({ swivel: 0, lift: 1, flat: 0, tip: 10 });
    const r = earGeometry({ swivel: 0, lift: 1, flat: 0, tip: 10 }, true);
    expect(r.outer).not.toEqual(l.outer);
    expect(height(r.outer)).toBeCloseTo(height(l.outer), 5);
  });
});

describe('tailPoints', () => {
  it.each([
    ['cover', 'none', false],
    ['error', 'none', false],
    ['idle', 'sleep', false],
    ['idle', 'none', true],
  ] as const)('%s/%s tail stays compact (no stick poking past the books)', (mood, beh, hover) => {
    const pts = tailPoints(poseFor(mood, beh, hover).tail, 0, 0);
    expect(Math.max(...pts.map((p) => p[0]))).toBeLessThan(312);
  });
  it('excited tail stands up; asleep tail stays low', () => {
    const top = (m: Parameters<typeof poseFor>) =>
      Math.min(...tailPoints(poseFor(...m).tail, 0, 0).map((p) => p[1]));
    expect(top(['success', 'none', false])).toBeLessThan(top(['idle', 'sleep', false]) - 40);
  });
});

describe('noise1', () => {
  it('is bounded and continuous', () => {
    let prev = noise1(3, 0);
    for (let t = 0; t < 20; t += 0.01) {
      const v = noise1(3, t);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      expect(Math.abs(v - prev)).toBeLessThan(0.1);
      prev = v;
    }
  });
});

describe('blinkCurve', () => {
  it('closes faster than it opens, then ends', () => {
    expect(blinkCurve('normal', 70)).toBeCloseTo(1);
    expect(blinkCurve('normal', 35)!).toBeLessThan(0.5);
    expect(blinkCurve('normal', 200)!).toBeGreaterThan(0);
    expect(blinkCurve('normal', 400)).toBeNull();
  });
  it('double blinks twice; slow blink never fully closes (the trusting cat blink)', () => {
    expect(blinkCurve('double', 420)).toBeCloseTo(1);
    const slowPeak = Math.max(...Array.from({ length: 140 }, (_, i) => blinkCurve('slow', i * 10) ?? 0));
    expect(slowPeak).toBeCloseTo(0.85);
    expect(blinkCurve('slow', 1400)).toBeNull();
  });
});
