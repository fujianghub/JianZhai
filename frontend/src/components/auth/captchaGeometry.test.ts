import { describe, expect, it } from 'vitest';
import { captchaLayout, handleToImageX, imageXToHandle, imageXToPiece } from './captchaGeometry';

const P = { width: 384, height: 144, piece_width: 72, y: 30 };

describe('captchaGeometry', () => {
  it('scales the canvas to the container width', () => {
    const l = captchaLayout(P, 328, 44);
    expect(l.scale).toBeCloseTo(328 / 384);
    expect(l.boxH).toBeCloseTo(144 * l.scale);
    expect(l.pieceTop).toBeCloseTo(30 * l.scale);
    expect(l.maxX).toBe(312);
    expect(l.travel).toBe(284);
  });

  it('falls back to native size before the container is measured', () => {
    expect(captchaLayout(P, 0, 44).scale).toBe(1);
  });

  it.each([298, 328, 391, 384])('handle ↔ image x round-trips at width %i', (w) => {
    const l = captchaLayout(P, w, 44);
    for (const x of [0, 17, 156, 311, 312]) {
      expect(handleToImageX(imageXToHandle(x, l), l)).toBeCloseTo(x, 6);
    }
    // 手柄走满全程 = 拼块到最右
    expect(handleToImageX(l.travel, l)).toBe(l.maxX);
    expect(imageXToPiece(l.maxX, l)).toBeCloseTo(l.maxX * l.scale);
  });

  it('clamps out-of-range drags', () => {
    const l = captchaLayout(P, 328, 44);
    expect(handleToImageX(-50, l)).toBe(0);
    expect(handleToImageX(9999, l)).toBe(l.maxX);
  });
});
