/**
 * Two-finger pinch + double-tap zoom for the PDF / PPT readers.
 *
 * Pure helpers (unit-tested) plus a small pointer-event attacher. The readers
 * keep their existing ratio-anchored zoom (`setZoom`), so pinching is just
 * another driver for the same state — the "content point stays put" logic in
 * PdfCanvas does the rest.
 */

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;

export interface Point {
  x: number;
  y: number;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Next zoom for a pinch that moved from `prevDist` to `dist` px apart.
 * Returns `null` when the change is below the dead zone (avoid re-render storms). */
export function pinchZoom(
  zoom: number,
  prevDist: number,
  dist: number,
  opts: { min?: number; max?: number; deadZone?: number } = {},
): number | null {
  const { min = ZOOM_MIN, max = ZOOM_MAX, deadZone = 0.03 } = opts;
  if (prevDist <= 0 || dist <= 0) return null;
  const factor = dist / prevDist;
  if (Math.abs(factor - 1) < deadZone) return null;
  const next = Math.min(max, Math.max(min, +(zoom * factor).toFixed(3)));
  return next === zoom ? null : next;
}

/** Double-tap: toggle between 1× and 2× (from anything else, go back to 1×). */
export function doubleTapZoom(zoom: number): number {
  return Math.abs(zoom - 1) < 0.05 ? 2 : 1;
}

export interface PinchHandlers {
  getZoom: () => number;
  setZoom: (z: number) => void;
  /** Ignore double-taps that land on selectable text (they select a word). */
  isTextTarget?: (t: EventTarget | null) => boolean;
}

/** Attach pinch (2 pointers) + double-tap to `el`. Returns a cleanup. */
export function attachPinchZoom(el: HTMLElement, h: PinchHandlers): () => void {
  const pts = new Map<number, Point>();
  let prevDist = 0;
  let lastTap = 0;
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      prevDist = distance(a, b);
    } else if (pts.size === 1) {
      const now = Date.now();
      if (now - lastTap < 300 && !(h.isTextTarget?.(e.target) ?? false)) {
        h.setZoom(doubleTapZoom(h.getZoom()));
        lastTap = 0;
      } else {
        lastTap = now;
      }
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size !== 2) return;
    const [a, b] = [...pts.values()];
    const d = distance(a, b);
    const next = pinchZoom(h.getZoom(), prevDist, d);
    if (next != null) {
      h.setZoom(next);
      prevDist = d;
    }
    e.preventDefault();
  };
  const onUp = (e: PointerEvent) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) prevDist = 0;
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove, { passive: false });
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
  };
}
