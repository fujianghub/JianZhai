import { describe, it, expect } from 'vitest';
import { distance, doubleTapZoom, pinchZoom } from './pinchZoom';

describe('pinchZoom', () => {
  it('scales zoom by the finger-distance ratio within bounds', () => {
    expect(pinchZoom(1, 100, 150)).toBe(1.5);
    expect(pinchZoom(2, 100, 50)).toBe(1);
    expect(pinchZoom(2.9, 100, 200)).toBe(3); // clamped
    expect(pinchZoom(0.6, 100, 50)).toBe(0.5); // clamped
  });
  it('ignores tiny jitter and invalid distances', () => {
    expect(pinchZoom(1, 100, 101)).toBeNull();
    expect(pinchZoom(1, 0, 100)).toBeNull();
    expect(pinchZoom(3, 100, 200)).toBeNull(); // already at max
  });
  it('double-tap toggles 1× ↔ 2×', () => {
    expect(doubleTapZoom(1)).toBe(2);
    expect(doubleTapZoom(2)).toBe(1);
    expect(doubleTapZoom(1.4)).toBe(1);
  });
  it('distance is euclidean', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});
