/**
 * Spring-water ambient backdrop (light theme) — hybrid WebGL + 2D.
 *
 * The water surface itself is a fragment shader (waterShader.ts): fbm ripple
 * normals → Schlick-Fresnel pale-sky reflection + a twinkling sun-glitter band
 * — the per-pixel cues a 2D canvas can't fake. Over it, a 2D overlay carries the
 * "life": peach/willow petals tumbling on curl-noise turbulence (a few big &
 * soft near-camera) that land, drift and sink; koi gliding past with a wake and
 * dimpling multi-ring ripples; airborne willow catkins. Occasional vortices swirl
 * the petals so nothing moves on rails.
 *
 * Active only under [data-theme='springwater']; both canvases sit at z-index 0
 * behind the transparent app layout, the 2D overlay painting above the shader.
 */
import { useThemeStore } from '@/stores/theme';
import {
  useAmbientCanvas,
  rand,
  densityCount,
  flow,
  curl,
  makeGlowSprite,
  blitGlow,
  TAU,
  type SceneController,
  type PointerState,
} from './ambientCanvas';
import { useShaderCanvas } from './shaderCanvas';
import { WATER_FRAGMENT } from './waterShader';

type RGB = [number, number, number];

const PETAL_COLORS: ReadonlyArray<RGB> = [
  [255, 198, 188],
  [255, 211, 196],
  [248, 196, 170],
  [255, 184, 196],
  [236, 160, 172],
];

interface Petal {
  x: number;
  y: number;
  r: number;
  ci: number;
  spin: number;
  spinSpeed: number;
  flutter: number;
  flutterSpeed: number;
  sink: number;
  depth: number;
  landed: number;
  vx: number;
  vy: number;
}
interface Catkin {
  x: number;
  y: number;
  r: number;
  phase: number;
  twSpeed: number;
  life: number;
  maxLife: number;
}
interface Ripple {
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
  maxLife: number;
  rings: number;
}
interface Vortex {
  x: number;
  y: number;
  strength: number;
  radius: number;
  life: number;
  maxLife: number;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function buildSpringWaterOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pointer: PointerState,
): SceneController {
  let petals: Petal[] = [];
  let catkins: Catkin[] = [];
  const ripples: Ripple[] = [];
  const vortices: Vortex[] = [];
  let nextVortex = rand(4, 9);
  let nextAmbient = rand(2, 5);
  let catkinSprite: HTMLCanvasElement | null = null;

  function scrollShift(depth: number) {
    return -depth * 56 * Math.tanh(pointer.scrollY / 500);
  }

  function vortexVel(x: number, y: number) {
    let vx = 0;
    let vy = 0;
    for (const v of vortices) {
      const dx = x - v.x;
      const dy = y - v.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > v.radius) continue;
      const fall =
        (1 - d / v.radius) *
        (v.life < 0.5 ? v.life / 0.5 : 1 - (v.life - 0.5) / (v.maxLife - 0.5));
      const s = (v.strength * fall) / d;
      vx += -dy * s;
      vy += dx * s;
    }
    return { vx, vy };
  }

  function spawnRipple(x: number, y: number, scale: number) {
    if (ripples.length > 14) return;
    ripples.push({
      x,
      y,
      r: scale * 2,
      maxR: scale * rand(16, 30),
      life: 0,
      maxLife: rand(1.8, 3.0),
      rings: 2 + ((Math.random() * 2) | 0),
    });
  }

  function buildSprites() {
    catkinSprite = makeGlowSprite(15, '236,242,214', 0.9);
  }

  function makePetal(initial: boolean): Petal {
    const depth = Math.random();
    return {
      x: rand(-0.05 * w, w * 1.05),
      y: initial ? rand(0, h) : rand(-60, -10),
      r: lerp(13, 5, depth),
      ci: (Math.random() * PETAL_COLORS.length) | 0,
      spin: rand(0, TAU),
      spinSpeed: rand(-1.1, 1.1),
      flutter: rand(0, TAU),
      flutterSpeed: rand(1.0, 2.4),
      sink: lerp(28, 12, depth),
      depth,
      landed: 0,
      vx: 0,
      vy: 0,
    };
  }

  function makeCatkin(initial: boolean): Catkin {
    const maxLife = rand(7, 16);
    return {
      x: rand(0, w),
      y: initial ? rand(0, h) : h + rand(4, 40),
      r: rand(0.9, 2.2),
      phase: rand(0, TAU),
      twSpeed: rand(0.5, 1.6),
      life: initial ? rand(0, maxLife) : 0,
      maxLife,
    };
  }

  function buildAll() {
    petals = Array.from({ length: densityCount(w, h, 34000, 18, 50) }, () => makePetal(true));
    catkins = Array.from({ length: densityCount(w, h, 64000, 10, 28) }, () => makeCatkin(true));
  }

  buildSprites();
  buildAll();

  // a stray dimple on the water now and then (wind-kiss / a drip) so the
  // surface keeps breathing once the koi are gone
  function stepAmbient(dt: number) {
    nextAmbient -= dt;
    if (nextAmbient <= 0) {
      spawnRipple(rand(0, w), rand(h * 0.3, h * 0.96), rand(0.6, 1.25));
      nextAmbient = rand(2.4, 6.0);
    }
  }

  function drawRipples(dt: number) {
    ctx.globalCompositeOperation = 'source-over';
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.life += dt;
      const p = rp.life / rp.maxLife;
      if (p >= 1) {
        ripples.splice(i, 1);
        continue;
      }
      const dy = scrollShift(0.08);
      ctx.save();
      ctx.translate(rp.x, rp.y + dy);
      ctx.scale(1, 0.42);
      for (let ring = 0; ring < rp.rings; ring++) {
        const lead = ring * 0.22;
        const rp2 = Math.min(1, p + lead);
        const r = rp.r + (rp.maxR - rp.r) * (1 - Math.pow(1 - rp2, 2));
        const fade = Math.max(0, 1 - rp2) * 0.5 * (1 - ring * 0.22);
        if (fade <= 0.01) continue;
        ctx.strokeStyle = `rgba(255, 255, 250, ${fade})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = `rgba(28, 108, 94, ${fade * 0.55})`;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(0, r - 2.2), 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawPetal(p: Petal, t: number, dt: number) {
    const fl = flow(p.x, p.y, t);
    const cu = curl(p.x, p.y, t, 0.0022);
    const vo = vortexVel(p.x, p.y);
    if (p.landed > 0) {
      p.landed += dt;
      p.x += (fl.dx * 4 + cu.dx * 3 + vo.vx * 0.4) * dt;
      p.spin += p.spinSpeed * 0.25 * dt;
    } else {
      p.flutter += p.flutterSpeed * dt;
      p.spin += p.spinSpeed * dt;
      const tvx = fl.dx * 16 + cu.dx * 22 + vo.vx + Math.sin(p.flutter) * 12;
      const tvy = p.sink + fl.dy * 6 + cu.dy * 14 + vo.vy;
      p.vx += (tvx - p.vx) * Math.min(1, dt * 2.5);
      p.vy += (tvy - p.vy) * Math.min(1, dt * 2.5);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const surfaceY = h * lerp(0.88, 0.74, p.depth);
      if (p.y > surfaceY && Math.random() < 0.018 + 0.05 * Math.max(0, (p.y - surfaceY) / 80)) {
        p.landed = 0.0001;
        spawnRipple(p.x, p.y, 1);
      }
    }
    if (p.landed > 3.4 || p.y > h + 20 || p.x < -34 || p.x > w + 34) {
      Object.assign(p, makePetal(false));
      return;
    }
    const [r, g, b] = PETAL_COLORS[p.ci];
    const fade = p.landed > 0 ? Math.max(0, 1 - p.landed / 3.4) : 1;
    const a = lerp(0.92, 0.4, p.depth) * fade;
    const px = p.x + pointer.x * lerp(22, 6, p.depth);
    const py = p.y + scrollShift(lerp(0.18, 0.05, p.depth));
    const face = 0.32 + 0.68 * Math.abs(Math.cos(p.flutter));
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(p.spin);
    ctx.scale(face, 1);
    if (p.depth < 0.22) {
      ctx.shadowColor = `rgba(${r},${g},${b},${a})`;
      ctx.shadowBlur = lerp(9, 2, p.depth / 0.22);
    }
    const grad = ctx.createLinearGradient(0, -p.r, 0, p.r);
    grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
    grad.addColorStop(1, `rgba(${(r * 0.86) | 0},${(g * 0.78) | 0},${(b * 0.8) | 0},${a})`);
    ctx.fillStyle = grad;
    const L = p.r;
    const Wd = p.r * 0.66;
    ctx.beginPath();
    ctx.moveTo(0, -L);
    ctx.quadraticCurveTo(Wd, -L * 0.2, Wd * 0.5, L * 0.85);
    ctx.quadraticCurveTo(0, L * 0.6, -Wd * 0.5, L * 0.85);
    ctx.quadraticCurveTo(-Wd, -L * 0.2, 0, -L);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  function drawCatkins(t: number, dt: number) {
    if (!catkinSprite) return;
    ctx.globalCompositeOperation = 'lighter';
    const catkinN = Math.ceil(catkins.length * pointer.quality);
    for (let i = 0; i < catkinN; i++) {
      const c = catkins[i];
      c.life += dt;
      const fl = flow(c.x, c.y, t);
      const cu = curl(c.x, c.y, t, 0.003);
      c.x += (fl.dx * 9 + cu.dx * 10 + Math.sin(t * 0.3 + c.phase) * 4) * dt;
      c.y += (fl.dy * 7 + cu.dy * 6 - 9) * dt;
      if (c.life > c.maxLife || c.y < -12 || c.x < -12 || c.x > w + 12) {
        Object.assign(c, makeCatkin(false));
        continue;
      }
      const fade = Math.sin(Math.min(1, c.life / c.maxLife) * Math.PI);
      const tw = 0.5 + 0.5 * Math.sin(t * c.twSpeed + c.phase);
      const a = fade * (0.3 + 0.4 * tw);
      blitGlow(ctx, catkinSprite, c.x + pointer.x * 14, c.y + scrollShift(0.09), c.r * 4, a);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function stepVortices(dt: number) {
    nextVortex -= dt;
    if (nextVortex <= 0 && vortices.length < 3) {
      vortices.push({
        x: rand(w * 0.1, w * 0.9),
        y: rand(h * 0.2, h * 0.8),
        strength: rand(120, 260) * (Math.random() < 0.5 ? -1 : 1),
        radius: rand(140, 280),
        life: 0,
        maxLife: rand(4, 7),
      });
      nextVortex = rand(5, 11);
    }
    for (let i = vortices.length - 1; i >= 0; i--) {
      vortices[i].life += dt;
      if (vortices[i].life >= vortices[i].maxLife) vortices.splice(i, 1);
    }
  }

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      buildAll();
    },
    frame(dt, t) {
      stepVortices(dt);
      stepAmbient(dt);
      // easter egg: a background click dimples the water where it lands
      for (const c of pointer.clicks) spawnRipple(c.x, c.y, rand(1.6, 2.3));
      drawRipples(dt);
      ctx.globalCompositeOperation = 'source-over';
      // adaptive quality trims the petal tail before the depth sort
      const petalN = Math.ceil(petals.length * pointer.quality);
      const ordered = petals.slice(0, petalN).sort((a, b) => b.depth - a.depth);
      for (const p of ordered) drawPetal(p, t, dt);
      drawCatkins(t, dt);
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

const CANVAS_STYLE: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  zIndex: 0,
};

export default function SpringWater() {
  const active = useThemeStore((s) => s.mode === 'springwater');
  const shaderRef = useShaderCanvas(active, WATER_FRAGMENT);
  const overlayRef = useAmbientCanvas(active, buildSpringWaterOverlay);
  if (!active) return null;
  return (
    <>
      <canvas ref={shaderRef} aria-hidden className="jz-ambient-canvas" style={CANVAS_STYLE} />
      <canvas ref={overlayRef} aria-hidden className="jz-ambient-canvas" style={CANVAS_STYLE} />
    </>
  );
}
