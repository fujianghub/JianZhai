// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BURST_PARTICLES, burstAt, planBurst } from './inkBurst';

afterEach(() => {
  document.querySelectorAll('.jz-ink-burst').forEach((el) => el.remove());
  delete document.documentElement.dataset.motion;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('planBurst', () => {
  it('emits the requested count with sane ranges', () => {
    const ps = planBurst(BURST_PARTICLES, () => 0.5);
    expect(ps).toHaveLength(BURST_PARTICLES);
    for (const p of ps) {
      expect(Math.hypot(p.dx, p.dy)).toBeLessThan(80);
      expect(p.size).toBeGreaterThanOrEqual(3);
      expect(p.size).toBeLessThanOrEqual(7);
      expect(p.dur).toBeGreaterThanOrEqual(480);
      expect(p.dur).toBeLessThanOrEqual(740);
      expect(p.delay).toBeGreaterThanOrEqual(0);
      expect(p.delay).toBeLessThanOrEqual(60);
    }
  });

  it('mixes gold-dominant kinds (accent every third)', () => {
    const ps = planBurst(9, () => 0.5);
    expect(ps.filter((p) => p.kind === 'accent')).toHaveLength(3);
    expect(ps.filter((p) => p.kind === 'gold')).toHaveLength(6);
  });

  it('drifts upward on average (墨点扬起)', () => {
    const ps = planBurst(BURST_PARTICLES, () => 0.5);
    const avgDy = ps.reduce((s, p) => s + p.dy, 0) / ps.length;
    expect(avgDy).toBeLessThan(0);
  });
});

describe('burstAt', () => {
  it('mounts a particle host at the point and removes it after TTL', () => {
    vi.useFakeTimers();
    burstAt(120, 240);
    const host = document.querySelector<HTMLElement>('.jz-ink-burst');
    expect(host).not.toBeNull();
    expect(host!.style.left).toBe('120px');
    expect(host!.style.top).toBe('240px');
    expect(host!.querySelectorAll('.jz-ink-burst-p')).toHaveLength(BURST_PARTICLES);
    expect(host!.getAttribute('aria-hidden')).toBe('true');
    vi.advanceTimersByTime(1000);
    expect(document.querySelector('.jz-ink-burst')).toBeNull();
  });

  it('does nothing at motion level medium/min (decorative gate)', () => {
    document.documentElement.dataset.motion = 'medium';
    burstAt(10, 10);
    expect(document.querySelector('.jz-ink-burst')).toBeNull();
    document.documentElement.dataset.motion = 'min';
    burstAt(10, 10);
    expect(document.querySelector('.jz-ink-burst')).toBeNull();
  });
});
