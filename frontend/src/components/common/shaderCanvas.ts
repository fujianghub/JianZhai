/**
 * Shared scaffold for full-viewport WebGL fragment-shader backdrops (ogl).
 *
 * The 2D ambient scenes (starry / deepsea / winter snow) live in
 * `ambientCanvas.ts`; this is the GL sibling for scenes whose realism needs
 * per-pixel maths a 2D canvas structurally can't do (water: angle-dependent
 * sky reflection, Fresnel, continuous ripple normals, sun glitter).
 *
 * Mirrors the 2D scaffold's behaviour so the two feel identical to use:
 *   - full-viewport canvas at devicePixelRatio (capped at 2 for fill-rate)
 *   - a requestAnimationFrame loop with clamped dt
 *   - pause when the document is hidden, resume on return
 *   - prefers-reduced-motion → render a single static frame, no loop
 *   - eased pointer (-1..1) + eased scrollY fed in as uniforms
 *
 * Standard uniforms exposed to every fragment shader:
 *   uniform float uTime;        // seconds since start
 *   uniform vec2  uResolution;  // CSS pixels (w, h)
 *   uniform vec2  uPointer;     // eased pointer, -1..1
 *   uniform float uScroll;      // eased window.scrollY, px
 * Extra uniforms can be supplied via `extraUniforms` (kept stable per scene).
 */
import { useEffect, useRef } from 'react';
import { Renderer, Triangle, Program, Mesh } from 'ogl';

const VERTEX = /* glsl */ `
  attribute vec2 uv;
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

export interface ShaderUniform {
  value: unknown;
}

/** Deferred WEBGL_lose_context per canvas — freeing the context synchronously
 * in the effect cleanup kills the SAME canvas's context for the immediate
 * StrictMode re-mount (a canvas only ever gets one GL context), leaving the
 * shader compiling against a lost context and throwing every frame. Cleanup
 * schedules the release for the next tick; a re-mount on the same canvas
 * cancels it, a real unmount lets it fire. */
const pendingLose = new WeakMap<HTMLCanvasElement, number>();

export function useShaderCanvas(
  active: boolean,
  fragment: string,
  extraUniforms: Record<string, ShaderUniform> = {},
) {
  const ref = useRef<HTMLCanvasElement>(null);
  // keep the latest extras without retriggering the effect every render
  const extrasRef = useRef(extraUniforms);
  extrasRef.current = extraUniforms;

  useEffect(() => {
    if (!active) return;
    const canvas = ref.current;
    if (!canvas) return;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const baseDpr = Math.min(window.devicePixelRatio || 1, 2);

    // remounting on the same canvas (StrictMode) — keep its context alive
    const pending = pendingLose.get(canvas);
    if (pending !== undefined) {
      window.clearTimeout(pending);
      pendingLose.delete(canvas);
    }

    let renderer: Renderer;
    try {
      renderer = new Renderer({ canvas, dpr: baseDpr, alpha: true, premultipliedAlpha: false });
    } catch {
      return; // no WebGL → leave the pale body gradient as the backdrop
    }
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);

    const geometry = new Triangle(gl);
    const uniforms: Record<string, ShaderUniform> = {
      uTime: { value: 0 },
      uResolution: { value: [1, 1] },
      uPointer: { value: [0, 0] },
      uScroll: { value: 0 },
      ...extrasRef.current,
    };
    const program = new Program(gl, { vertex: VERTEX, fragment, uniforms });
    const mesh = new Mesh(gl, { geometry, program });

    let w = 0;
    let h = 0;
    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      renderer.setSize(w, h);
      uniforms.uResolution.value = [w, h];
    }
    resize();

    // eased pointer + scroll for soft parallax (match the 2D scaffold feel)
    const ptr = { x: 0, y: 0, tx: 0, ty: 0, s: window.scrollY || 0, st: window.scrollY || 0 };

    let raf = 0;
    let last = performance.now();
    let t = 0;
    let running = false;

    // adaptive DPR: mirror the 2D scaffold — sustained jank lowers the GL
    // backing-store resolution (the shader's only real cost lever), sustained
    // smoothness recovers it. Hysteresis + cooldown prevent ping-pong.
    const DPR_LEVELS = [1, 0.8, 0.66] as const;
    let level = 0;
    let emaDt = 1 / 60;
    let adaptClock = 0;
    let goodStreak = 0;
    let cooldown = 0;

    function applyLevel() {
      (renderer as unknown as { dpr: number }).dpr = Math.max(1, baseDpr * DPR_LEVELS[level]);
      resize();
    }

    function stepAdaptive(rawDt: number, dt: number) {
      if (rawDt < 0.25) emaDt += (rawDt - emaDt) * 0.06;
      adaptClock += dt;
      if (cooldown > 0) cooldown -= dt;
      if (adaptClock < 0.5 || cooldown > 0) return;
      adaptClock = 0;
      if (emaDt > 1 / 42 && level < DPR_LEVELS.length - 1) {
        level++;
        applyLevel();
        goodStreak = 0;
        cooldown = 2.5;
      } else if (emaDt < 1 / 55 && level > 0) {
        goodStreak++;
        if (goodStreak >= 8) {
          level--;
          applyLevel();
          goodStreak = 0;
          cooldown = 4;
        }
      } else {
        goodStreak = 0;
      }
    }

    function loop(now: number) {
      if (!running) return;
      const rawDt = (now - last) / 1000;
      last = now;
      const dt = Math.min(rawDt, 0.1);
      t += dt;
      stepAdaptive(rawDt, dt);
      const k = Math.min(1, dt * 3);
      ptr.x += (ptr.tx - ptr.x) * k;
      ptr.y += (ptr.ty - ptr.y) * k;
      ptr.s += (ptr.st - ptr.s) * Math.min(1, dt * 6);
      uniforms.uTime.value = t;
      uniforms.uPointer.value = [ptr.x, ptr.y];
      uniforms.uScroll.value = ptr.s;
      renderer.render({ scene: mesh });
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
      resize();
    }
    function onPointer(e: MouseEvent) {
      ptr.tx = (e.clientX / w) * 2 - 1;
      ptr.ty = (e.clientY / h) * 2 - 1;
    }
    function onScroll() {
      ptr.st = window.scrollY || 0;
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
      uniforms.uTime.value = 0;
      renderer.render({ scene: mesh });
    } else {
      start();
    }

    return () => {
      stop();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onPointer);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      const id = window.setTimeout(() => {
        pendingLose.delete(canvas);
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      }, 0);
      pendingLose.set(canvas, id);
    };
  }, [active, fragment]);

  return ref;
}
