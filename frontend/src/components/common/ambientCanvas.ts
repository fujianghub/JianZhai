/**
 * Shared scaffold for the canvas-driven ambient backdrops (starry / deepsea).
 *
 * Handles the boring-but-easy-to-get-wrong parts so each scene only has to
 * describe its particles + one draw call:
 *   - full-viewport canvas sized to devicePixelRatio (capped at 2 for fill-rate)
 *   - a requestAnimationFrame loop with a clamped dt (so a tab-switch doesn't
 *     teleport every particle on the first frame back)
 *   - pause when the document is hidden, resume on return
 *   - prefers-reduced-motion → render a single static frame, no loop
 *   - an eased pointer position in [-1, 1] for subtle parallax
 *
 * The scene `build` callback runs once the canvas is sized and returns a
 * controller with `frame(dt, t)` (called every animation frame, canvas already
 * cleared) and an optional `resize(w, h)`. Keep `build` module-level / stable so
 * the effect only re-runs when `active` flips.
 */
import { useEffect, useRef } from 'react';

export interface PointerState {
  /** eased horizontal position, -1 (left edge) … 1 (right edge) */
  x: number;
  /** eased vertical position, -1 (top) … 1 (bottom) */
  y: number;
  /** raw target the eased value chases */
  tx: number;
  ty: number;
  /** eased window scrollY (px) for scroll-coupled parallax */
  scrollY: number;
  /** raw scroll target the eased value chases */
  scrollTarget: number;
  /** adaptive quality 0.6…1 — drops on sustained low FPS, recovers when smooth */
  quality: number;
}

export interface SceneController {
  /** draw one frame; dt = seconds since last frame, t = seconds since start */
  frame: (dt: number, t: number) => void;
  /** rebuild anything that depends on viewport size */
  resize?: (w: number, h: number) => void;
}

export type SceneBuilder = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pointer: PointerState,
) => SceneController;

export function useAmbientCanvas(active: boolean, build: SceneBuilder) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Render at full devicePixelRatio (capped at 2) for crisp HiDPI visuals.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pointer: PointerState = {
      x: 0,
      y: 0,
      tx: 0,
      ty: 0,
      scrollY: window.scrollY || 0,
      scrollTarget: window.scrollY || 0,
      // Quality is pinned to full — the scenes always render every particle.
      // (A `quality` field remains so the scenes can still scale by it if a
      // future adaptive mode is wanted; `__ambientForceQ` can override it.)
      quality: 1,
    };

    let w = 0;
    let h = 0;

    function resizeCanvas() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = Math.max(1, Math.floor(w * dpr));
      canvas!.height = Math.max(1, Math.floor(h * dpr));
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resizeCanvas();
    const controller = build(ctx, w, h, pointer);

    let raf = 0;
    let last = performance.now();
    let t = 0;
    let running = false;

    function loop(now: number) {
      if (!running) return;
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.1) dt = 0.1; // clamp big gaps (tab switch, jank)
      t += dt;
      // ease the pointer + scroll toward their targets for soft parallax
      const k = Math.min(1, dt * 3);
      pointer.x += (pointer.tx - pointer.x) * k;
      pointer.y += (pointer.ty - pointer.y) * k;
      pointer.scrollY += (pointer.scrollTarget - pointer.scrollY) * Math.min(1, dt * 6);
      // optional manual override (debug); otherwise quality stays at full
      const forced = (window as unknown as { __ambientForceQ?: number }).__ambientForceQ;
      pointer.quality = typeof forced === 'number' ? forced : 1;
      ctx!.clearRect(0, 0, w, h);
      controller.frame(dt, t);
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (running || reduced) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    function onResize() {
      resizeCanvas();
      controller.resize?.(w, h);
    }
    function onPointer(e: MouseEvent) {
      pointer.tx = (e.clientX / w) * 2 - 1;
      pointer.ty = (e.clientY / h) * 2 - 1;
    }
    function onScroll() {
      pointer.scrollTarget = window.scrollY || 0;
    }
    function onVisibility() {
      if (document.hidden) stop();
      else start();
    }

    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onPointer, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    if (reduced) {
      // honour reduced-motion: one calm static frame, no rAF
      ctx.clearRect(0, 0, w, h);
      controller.frame(0, 0);
    } else {
      start();
    }

    return () => {
      stop();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onPointer);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, build]);

  return ref;
}

/* ── small shared helpers ── */

export const TAU = Math.PI * 2;

export function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function pick<T>(arr: readonly T[]): T {
  return arr[(Math.random() * arr.length) | 0];
}

/** particle count scaled to viewport area, clamped to a sane range */
export function densityCount(w: number, h: number, perPx: number, min: number, max: number) {
  return Math.round(Math.max(min, Math.min(max, (w * h) / perPx)));
}

/* ── coherent motion + texture helpers (shared by both scenes) ── */

/**
 * A cheap coherent flow field — a few mismatched sine waves summed into a
 * pseudo-curl. Returns a small velocity vector so many particles drift as one
 * body of "water" / "air" rather than each on its own private sine. O(1), no
 * randomness (deterministic → resume-safe). `scale` controls the spatial
 * frequency; smaller = broader, smoother swirls.
 */
export function flow(x: number, y: number, t: number, scale = 0.0016) {
  const a = x * scale;
  const b = y * scale;
  const dx =
    Math.sin(b * 1.3 + t * 0.18) +
    0.5 * Math.sin(b * 2.7 - t * 0.11 + 1.3) +
    0.3 * Math.cos(a * 1.9 + t * 0.07);
  const dy =
    Math.cos(a * 1.1 + t * 0.15) +
    0.5 * Math.cos(a * 2.3 + t * 0.09 + 2.1) +
    0.3 * Math.sin(b * 1.7 - t * 0.06);
  return { dx, dy };
}

/** deterministic 2D hash in [0,1) */
function hash2(ix: number, iy: number) {
  const s = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** value noise in [0,1] with smoothstep interpolation */
export function noise2d(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** fractal Brownian motion — layered noise for cloud/dust/caustic texture */
export function fbm(x: number, y: number, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2d(x * freq, y * freq);
    freq *= 2;
    amp *= 0.5;
  }
  return sum;
}

/** create an offscreen canvas and run a one-time draw into it (for textures
 * built once per resize, then cheaply blitted every frame). */
export function makeOffscreen(
  w: number,
  h: number,
  draw: (c: CanvasRenderingContext2D, w: number, h: number) => void,
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  const cx = c.getContext('2d');
  if (cx) draw(cx, c.width, c.height);
  return c;
}

/**
 * Pre-render a soft radial glow sprite once, so particles can be drawn with a
 * single cheap `drawImage` instead of building a `createRadialGradient` every
 * frame. `color` is an "r,g,b" string. The sprite is sized to `radius*2` and
 * the glow fades to fully transparent at the edge.
 */
export function makeGlowSprite(radius: number, color: string, coreA = 1): HTMLCanvasElement {
  const d = Math.max(2, Math.ceil(radius * 2));
  return makeOffscreen(d, d, (cx, w) => {
    const r = w / 2;
    const g = cx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, `rgba(${color},${coreA})`);
    g.addColorStop(0.5, `rgba(${color},${coreA * 0.5})`);
    g.addColorStop(1, `rgba(${color},0)`);
    cx.fillStyle = g;
    cx.beginPath();
    cx.arc(r, r, r, 0, TAU);
    cx.fill();
  });
}

/** blit a glow sprite centred at (x,y) scaled to `radius`, with `alpha` */
export function blitGlow(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  x: number,
  y: number,
  radius: number,
  alpha: number,
) {
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = 1;
}

/** soft cinematic vignette: edges darkened, centre untouched. Drawn last. */
export function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number, strength = 0.5) {
  const g = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.32,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.72,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
