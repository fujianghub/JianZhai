/**
 * Deep-sea ambient backdrop, rendered on a canvas.
 *
 * A cinematic underwater scene built in layers (back → front): a depth-graded
 * water column; a shimmering caustic net refracted from the surface; god-ray
 * beams that light up the motes drifting through them (volumetric); an
 * occasional huge faint manta in the deep background; suspended marine snow;
 * bioluminescent plankton (mostly cool, a few warm accents); two pulsing
 * jellyfish; vector fish of three species that wander on noise-steered headings
 * (plus a loose school); rising bubbles; an undulating seafloor with caustic
 * light dancing on it; and kelp rooted into that floor, swaying in the current.
 *
 * Bubbles, plankton and snow ride one shared flow field; depth layers parallax
 * with both pointer and page scroll; a soft vignette frames the scene. Glow
 * particles use cached sprites and the whole thing throttles its particle count
 * if the frame rate drops.
 *
 * Active only under [data-theme='deepsea']; canvas at z-index 0 behind the
 * transparent app layout.
 */
import { useThemeStore } from '@/stores/theme';
import {
  useAmbientCanvas,
  rand,
  densityCount,
  flow,
  fbm,
  noise2d,
  makeOffscreen,
  makeGlowSprite,
  blitGlow,
  drawVignette,
  TAU,
  type SceneController,
  type PointerState,
} from './ambientCanvas';

interface Bubble {
  x: number;
  y: number;
  r: number;
  speed: number;
  phase: number;
  alpha: number;
}
interface Plankton {
  x: number;
  y: number;
  r: number;
  phase: number;
  pulse: number;
  ci: number;
}
interface Snow {
  x: number;
  y: number;
  r: number;
  baseA: number;
  phase: number;
  depth: number;
}
interface Fish {
  x: number;
  y: number;
  heading: number;
  speed: number;
  steerSeed: number;
  size: number;
  depth: number; // 0 near … 1 far
  species: number;
  tailPhase: number;
  tailSpeed: number;
}
interface Ray {
  x: number;
  width: number;
  tilt: number;
  swayAmp: number;
  swayFreq: number;
  phase: number;
  baseA: number;
}
interface Kelp {
  x: number;
  h: number;
  width: number;
  phase: number;
  segs: number;
}
interface Jelly {
  x: number;
  size: number;
  t0: number;
  cycle: number;
}

const PLANKTON_COOL: ReadonlyArray<[number, number, number]> = [
  [94, 234, 212],
  [125, 211, 252],
  [167, 243, 208],
  [110, 231, 255],
];
const PLANKTON_WARM: ReadonlyArray<[number, number, number]> = [
  [255, 208, 128], // gold
  [212, 150, 255], // violet
];
const PLANKTON_ALL = [...PLANKTON_COOL, ...PLANKTON_WARM];

/** three fish species silhouettes: 0 torpedo, 1 round/disc, 2 long/eel */
const SPECIES = [
  { bodyH: 0.22, sx: 1.0 },
  { bodyH: 0.34, sx: 0.9 },
  { bodyH: 0.13, sx: 1.5 },
];

/** unit fish silhouette, nose at +0.46, tail joint near −0.32 */
function drawFishShape(ctx: CanvasRenderingContext2D, tail: number, bodyH: number) {
  ctx.beginPath();
  ctx.moveTo(0.46, 0);
  ctx.quadraticCurveTo(0.12, -bodyH, -0.26, -bodyH * 0.5);
  ctx.quadraticCurveTo(-0.41, -0.05, -0.41, 0);
  ctx.quadraticCurveTo(-0.41, 0.05, -0.26, bodyH * 0.5);
  ctx.quadraticCurveTo(0.12, bodyH, 0.46, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0.05, -bodyH * 0.7);
  ctx.quadraticCurveTo(-0.05, -bodyH * 1.4, -0.16, -bodyH * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.translate(-0.32, 0);
  ctx.rotate(tail);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-0.24, -bodyH * 1.0);
  ctx.lineTo(-0.15, 0);
  ctx.lineTo(-0.24, bodyH * 1.0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** unit manta silhouette, travelling toward +x; `wing` ∈ ~[0.75,1.25] flaps */
function drawMantaPath(ctx: CanvasRenderingContext2D, wing: number) {
  ctx.beginPath();
  ctx.moveTo(0.5, 0);
  ctx.quadraticCurveTo(0.12, -0.16, -0.05, -0.55 * wing);
  ctx.quadraticCurveTo(-0.22, -0.12, -0.46, -0.05);
  ctx.quadraticCurveTo(-0.56, 0, -0.46, 0.05);
  ctx.quadraticCurveTo(-0.22, 0.12, -0.05, 0.55 * wing);
  ctx.quadraticCurveTo(0.12, 0.16, 0.5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = ctx.fillStyle as string;
  ctx.lineWidth = 0.02;
  ctx.beginPath();
  ctx.moveTo(-0.46, 0);
  ctx.lineTo(-0.78, 0);
  ctx.stroke();
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function buildDeepSea(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pointer: PointerState,
): SceneController {
  let bubbles: Bubble[] = [];
  let plankton: Plankton[] = [];
  let snow: Snow[] = [];
  let fish: Fish[] = [];
  let school: { leader: Fish; members: Array<{ ox: number; oy: number }> } | null = null;
  let rays: Ray[] = [];
  let kelps: Kelp[] = [];
  let jellies: Jelly[] = [];
  let caustic: HTMLCanvasElement | null = null;
  let planktonSprites: HTMLCanvasElement[] = [];
  let bubbleSprite: HTMLCanvasElement | null = null;
  const manta = { active: false, x: 0, y: 0, dir: 1, size: 1, t: 0 };
  let nextManta = rand(8, 18);

  /** bounded scroll parallax (asymptotes so long pages never leave gaps) */
  function scrollShift(depth: number) {
    return -depth * 60 * Math.tanh(pointer.scrollY / 500);
  }

  /** undulating seafloor height (y) at a given x */
  function floorY(x: number) {
    return (
      h -
      (h * 0.05 +
        16 * Math.sin(x * 0.005 + 1.3) +
        10 * Math.sin(x * 0.013) +
        14 * noise2d(x * 0.01, 7))
    );
  }

  const causticBand = () => h * 0.62;
  function buildCaustic() {
    const sc = 0.5;
    const cw = Math.max(2, Math.round(w * sc));
    const ch = Math.max(2, Math.round(causticBand() * sc));
    caustic = makeOffscreen(cw, ch, (cx, W, H) => {
      const img = cx.createImageData(W, H);
      for (let y = 0; y < H; y++) {
        const fall = Math.pow(1 - y / H, 1.3);
        for (let x = 0; x < W; x++) {
          const n = fbm(x * 0.045, y * 0.05, 4);
          const ridge = Math.pow(Math.max(0, 1 - Math.abs(n * 2 - 1)), 3);
          const n2 = fbm(x * 0.025 + 7, y * 0.03 + 3, 3);
          const b = Math.min(1, ridge * (0.6 + 0.8 * n2) * fall);
          const i = (y * W + x) * 4;
          img.data[i] = 170 * b + 30;
          img.data[i + 1] = 245 * b + 25;
          img.data[i + 2] = 240 * b + 35;
          img.data[i + 3] = b * 150;
        }
      }
      cx.putImageData(img, 0, 0);
    });
  }

  function buildSprites() {
    planktonSprites = PLANKTON_ALL.map((c) => makeGlowSprite(16, `${c[0]},${c[1]},${c[2]}`));
    bubbleSprite = makeOffscreen(64, 64, (cx, W) => {
      const r = W / 2;
      const ring = cx.createRadialGradient(r, r, r * 0.2, r, r, r);
      ring.addColorStop(0, 'rgba(180,230,250,0.10)');
      ring.addColorStop(0.78, 'rgba(180,230,250,0.13)');
      ring.addColorStop(0.92, 'rgba(210,245,255,0.9)');
      ring.addColorStop(1, 'rgba(210,245,255,0)');
      cx.fillStyle = ring;
      cx.beginPath();
      cx.arc(r, r, r, 0, TAU);
      cx.fill();
      cx.fillStyle = 'rgba(255,255,255,0.85)';
      cx.beginPath();
      cx.arc(r * 0.66, r * 0.66, r * 0.15, 0, TAU);
      cx.fill();
    });
  }

  function makeBubble(initial: boolean): Bubble {
    return {
      x: rand(0, w),
      y: initial ? rand(0, h) : h + rand(0, 60),
      r: rand(2, 11),
      speed: rand(28, 78),
      phase: rand(0, TAU),
      alpha: rand(0.25, 0.6),
    };
  }

  function makeFish(small: boolean): Fish {
    const depth = small ? 0.7 : Math.random();
    return {
      x: rand(w * 0.1, w * 0.9),
      y: rand(h * 0.15, h * 0.85),
      heading: rand(0, TAU),
      speed: small ? rand(16, 26) : rand(12, 34),
      steerSeed: rand(0, 1000),
      size: small ? 11 : lerp(40, 15, depth),
      depth,
      species: small ? 0 : (Math.random() * SPECIES.length) | 0,
      tailPhase: rand(0, TAU),
      tailSpeed: small ? 12 : rand(6, 11),
    };
  }

  function buildAll() {
    bubbles = Array.from({ length: densityCount(w, h, 26000, 18, 64) }, () => makeBubble(true));
    plankton = Array.from({ length: densityCount(w, h, 11000, 32, 150) }, () => ({
      x: rand(0, w),
      y: rand(h * 0.32, h),
      r: rand(0.6, 1.9),
      phase: rand(0, TAU),
      pulse: rand(0.4, 1.6),
      ci:
        Math.random() < 0.12
          ? PLANKTON_COOL.length + ((Math.random() * PLANKTON_WARM.length) | 0)
          : (Math.random() * PLANKTON_COOL.length) | 0,
    }));
    snow = Array.from({ length: densityCount(w, h, 6000, 80, 220) }, () => {
      const depth = Math.random();
      return {
        x: rand(0, w),
        y: rand(0, h),
        r: lerp(1.4, 0.4, depth),
        baseA: lerp(0.5, 0.12, depth),
        phase: rand(0, TAU),
        depth,
      };
    });
    fish = Array.from({ length: w < 720 ? 5 : 8 }, () => makeFish(false));
    const leader = makeFish(true);
    leader.speed = rand(16, 24);
    leader.size = 12;
    school = {
      leader,
      members: Array.from({ length: 11 }, () => ({ ox: rand(-44, 44), oy: rand(-26, 26) })),
    };
    rays = Array.from({ length: w < 720 ? 3 : 5 }, () => ({
      x: rand(0, w),
      width: rand(70, 150),
      tilt: rand(-0.18, 0.18),
      swayAmp: rand(10, 32),
      swayFreq: rand(0.1, 0.3),
      phase: rand(0, TAU),
      baseA: rand(0.05, 0.13),
    }));
    kelps = Array.from({ length: w < 720 ? 3 : 6 }, (_, i) => ({
      x: i < 2 ? rand(0, w * 0.2) : i >= 4 ? rand(w * 0.8, w) : rand(0, w),
      h: rand(h * 0.28, h * 0.55),
      width: rand(10, 20),
      phase: rand(0, TAU),
      segs: 7,
    }));
    jellies = [
      { x: rand(w * 0.55, w * 0.85), size: rand(30, 38), t0: rand(0, 30), cycle: 34 },
      { x: rand(w * 0.15, w * 0.4), size: rand(20, 28), t0: rand(0, 30), cycle: 42 },
    ];
  }

  buildSprites();
  buildCaustic();
  buildAll();

  function drawDepth() {
    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(10, 60, 80, 0.18)');
    g.addColorStop(0.45, 'rgba(2, 26, 52, 0.30)');
    g.addColorStop(1, 'rgba(0, 6, 18, 0.74)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function drawCaustic(t: number) {
    if (!caustic) return;
    const band = causticBand();
    const sh = scrollShift(0.04);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    // two slightly-offset, oppositely-drifting stretches → shimmering interference
    const passes = [
      { a: 0.3, dx: Math.sin(t * 0.06) * 22, dy: Math.sin(t * 0.04) * 9, mx: 60 },
      { a: 0.18, dx: Math.cos(t * 0.05) * -28, dy: Math.cos(t * 0.03) * 11, mx: 120 },
    ];
    for (const p of passes) {
      ctx.globalAlpha = p.a * (0.7 + 0.3 * Math.sin(t * 0.5));
      ctx.drawImage(caustic, -p.mx / 2 + p.dx, -10 + p.dy + sh, w + p.mx, band + 40);
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }

  /** center x of god-ray `r` at depth y (slanted beam) */
  function rayCenter(r: Ray, y: number, t: number) {
    const top = -h * 0.1;
    return r.x + Math.sin(t * r.swayFreq + r.phase) * r.swayAmp + pointer.x * 14 + Math.tan(r.tilt) * (y - top);
  }

  /** additive brightness if (x,y) sits inside a light shaft → volumetric motes */
  function rayBoost(x: number, y: number, t: number) {
    const top = -h * 0.1;
    const len = h * 0.85;
    let boost = 0;
    for (const r of rays) {
      const half = lerp(r.width * 0.3, r.width * 0.7, Math.min(1, Math.max(0, (y - top) / len)));
      const d = Math.abs(x - rayCenter(r, y, t));
      if (d < half) {
        const inten = r.baseA * (0.65 + 0.35 * Math.sin(t * 0.6 + r.phase));
        boost += (1 - d / half) * inten * 4;
      }
    }
    return boost;
  }

  function drawRays(t: number) {
    ctx.globalCompositeOperation = 'lighter';
    const top = -h * 0.1;
    const len = h * 0.85;
    const sh = scrollShift(0.06);
    for (const r of rays) {
      const x = rayCenter(r, top, t);
      const a = r.baseA * (0.65 + 0.35 * Math.sin(t * 0.6 + r.phase));
      const dx = Math.tan(r.tilt) * len;
      const grad = ctx.createLinearGradient(x, top + sh, x, top + len + sh);
      grad.addColorStop(0, `rgba(210, 245, 255, ${a})`);
      grad.addColorStop(0.5, `rgba(150, 220, 245, ${a * 0.5})`);
      grad.addColorStop(1, 'rgba(150, 220, 245, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x - r.width * 0.3, top + sh);
      ctx.lineTo(x + r.width * 0.3, top + sh);
      ctx.lineTo(x + dx + r.width * 0.7, top + len + sh);
      ctx.lineTo(x + dx - r.width * 0.7, top + len + sh);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawManta(dt: number) {
    nextManta -= dt;
    if (!manta.active && nextManta <= 0) {
      manta.active = true;
      manta.dir = Math.random() < 0.5 ? 1 : -1;
      manta.x = manta.dir > 0 ? -w * 0.2 : w * 1.2;
      manta.y = rand(h * 0.3, h * 0.62);
      manta.size = rand(160, 240);
      manta.t = 0;
    }
    if (!manta.active) return;
    manta.t += dt;
    manta.x += manta.dir * dt * w * 0.035;
    if (manta.x < -w * 0.3 || manta.x > w * 1.3) {
      manta.active = false;
      nextManta = rand(20, 40);
      return;
    }
    const wing = 1 + 0.22 * Math.sin(manta.t * 0.9);
    const y = manta.y + Math.sin(manta.t * 0.5) * 18 + scrollShift(0.08);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.1;
    ctx.translate(manta.x, y);
    ctx.scale(manta.dir * manta.size, manta.size * 0.62);
    ctx.fillStyle = 'rgba(120, 180, 230, 1)';
    drawMantaPath(ctx, wing);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawJelly(j: Jelly, t: number) {
    const tt = t + j.t0;
    const p = (tt % j.cycle) / j.cycle;
    const x = j.x + 0.04 * j.size * Math.sin(tt * 0.2) + pointer.x * 6;
    const y = h * (1.1 - 1.3 * p) + scrollShift(0.12);
    const fade = p < 0.08 ? p / 0.08 : p > 0.9 ? (1 - p) / 0.1 : 1;
    if (fade <= 0) return;
    const pulse = Math.sin(tt * 1.7);
    const squashX = 1 + 0.12 * pulse;
    const squashY = 1 - 0.12 * pulse;
    const S = j.size;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x, y);
    ctx.globalAlpha = 0.85 * Math.max(0, fade);
    ctx.save();
    ctx.scale(squashX, squashY);
    const bell = ctx.createRadialGradient(0, -S * 0.2, 2, 0, 0, S);
    bell.addColorStop(0, 'rgba(252, 231, 243, 0.85)');
    bell.addColorStop(0.5, 'rgba(192, 132, 252, 0.5)');
    bell.addColorStop(1, 'rgba(124, 58, 237, 0)');
    ctx.fillStyle = bell;
    ctx.beginPath();
    ctx.moveTo(-S * 0.7, S * 0.1);
    ctx.quadraticCurveTo(-S * 0.7, -S * 0.75, 0, -S * 0.75);
    ctx.quadraticCurveTo(S * 0.7, -S * 0.75, S * 0.7, S * 0.1);
    ctx.quadraticCurveTo(S * 0.5, S * 0.28, S * 0.35, S * 0.12);
    ctx.quadraticCurveTo(S * 0.18, S * 0.3, 0, S * 0.12);
    ctx.quadraticCurveTo(-S * 0.18, S * 0.3, -S * 0.35, S * 0.12);
    ctx.quadraticCurveTo(-S * 0.5, S * 0.28, -S * 0.7, S * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(244, 200, 252, 0.45)';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const ax = (-0.18 + (i / 3) * 0.36) * S;
      ctx.beginPath();
      ctx.moveTo(ax, S * 0.12);
      for (let jj = 1; jj <= 4; jj++) {
        const f = jj / 4;
        const wv = Math.sin(tt * 2.4 + i + jj) * (4 * f) * (0.6 + 0.4 * pulse);
        ctx.lineTo(ax + wv, S * 0.12 + f * S * 0.7);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.42)';
    ctx.lineWidth = 1.3;
    const tn = 6;
    for (let i = 0; i < tn; i++) {
      const tx = (-0.46 + (i / (tn - 1)) * 0.92) * S;
      ctx.beginPath();
      ctx.moveTo(tx, S * 0.12);
      for (let jj = 1; jj <= 6; jj++) {
        const f = jj / 6;
        const lag = Math.sin(tt * 2 - f * 2.4 + i) * (7 * f);
        ctx.lineTo(tx + lag, S * 0.12 + f * S * 1.7);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** advance a fish on its wandering heading, steering away from bounds */
  function stepFish(f: Fish, dt: number, t: number) {
    // slow heading wander from noise
    f.heading += (noise2d(f.steerSeed, t * 0.08) - 0.5) * 2.2 * dt;
    // steer the velocity vector back inside the frame near the edges
    let vx = Math.cos(f.heading);
    let vy = Math.sin(f.heading);
    const m = 90;
    const topB = h * 0.1;
    const botB = floorY(f.x) - 26;
    if (f.x < m) vx += Math.min(1, (m - f.x) / m);
    else if (f.x > w - m) vx -= Math.min(1, (f.x - (w - m)) / m);
    if (f.y < topB) vy += Math.min(1, (topB - f.y) / m);
    else if (f.y > botB) vy -= Math.min(1, (f.y - botB) / m);
    f.heading = Math.atan2(vy, vx);
    f.x += Math.cos(f.heading) * f.speed * dt;
    f.y += Math.sin(f.heading) * f.speed * dt;
    f.tailPhase += f.tailSpeed * dt;
  }

  function drawFishOne(f: Fish, isSchool: boolean) {
    const sp = SPECIES[f.species];
    const sx = Math.cos(f.heading); // banking: edge-on when turning
    const tail = Math.sin(f.tailPhase) * 0.5;
    const dy = scrollShift(lerp(0.18, 0.05, f.depth));
    const alpha = isSchool ? 0.42 : lerp(0.6, 0.28, f.depth);
    ctx.save();
    ctx.translate(f.x, f.y + dy);
    ctx.scale(sx * f.size * sp.sx, f.size);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(94, 234, 212, 0.5)';
    ctx.shadowBlur = isSchool ? 4 : 6;
    // belly-shaded body: lighter back (top), darker belly (bottom)
    const back = `rgb(${lerp(140, 100, f.depth) | 0}, ${lerp(225, 165, f.depth) | 0}, ${lerp(225, 235, f.depth) | 0})`;
    const belly = `rgb(${lerp(40, 30, f.depth) | 0}, ${lerp(110, 80, f.depth) | 0}, ${lerp(120, 110, f.depth) | 0})`;
    const grad = ctx.createLinearGradient(0, -sp.bodyH, 0, sp.bodyH);
    grad.addColorStop(0, back);
    grad.addColorStop(1, belly);
    ctx.fillStyle = grad;
    drawFishShape(ctx, tail, sp.bodyH);
    ctx.restore();
  }

  function drawFloor(t: number) {
    const sh = scrollShift(0.2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.moveTo(0, h + 140);
    ctx.lineTo(0, floorY(0) + sh);
    for (let x = 0; x <= w; x += 24) ctx.lineTo(x, floorY(x) + sh);
    ctx.lineTo(w, h + 140);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, h * 0.78, 0, h);
    g.addColorStop(0, 'rgba(3, 20, 30, 0.55)');
    g.addColorStop(1, 'rgba(0, 5, 12, 0.96)');
    ctx.fillStyle = g;
    ctx.fill();
    // caustic light dancing on the floor: clip to the floor, blit faintly
    if (caustic) {
      ctx.save();
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.12 * (0.7 + 0.3 * Math.sin(t * 0.5));
      ctx.drawImage(caustic, Math.sin(t * 0.05) * 30, h * 0.55, w + 60, h * 0.5);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawKelp(k: Kelp, t: number) {
    const baseX = k.x + pointer.x * 22;
    const baseY = floorY(k.x) + scrollShift(0.2);
    const top = baseY - k.h;
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= k.segs; i++) {
      const f = i / k.segs;
      const fl = flow(baseX, baseY - f * k.h, t * 0.6);
      const sway = (Math.sin(t * 0.7 + k.phase + f * 2.2) * 26 + fl.dx * 10) * f;
      pts.push([baseX + sway, baseY - f * k.h]);
    }
    const wHalf = k.width / 2;
    ctx.beginPath();
    ctx.moveTo(pts[0][0] - wHalf, pts[0][1]);
    for (let i = 0; i <= k.segs; i++) {
      const taper = 1 - (i / k.segs) * 0.85;
      ctx.lineTo(pts[i][0] - wHalf * taper, pts[i][1]);
    }
    for (let i = k.segs; i >= 0; i--) {
      const taper = 1 - (i / k.segs) * 0.85;
      ctx.lineTo(pts[i][0] + wHalf * taper, pts[i][1]);
    }
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, baseY, 0, top);
    grad.addColorStop(0, 'rgba(8, 40, 42, 0.92)');
    grad.addColorStop(1, 'rgba(20, 70, 70, 0.5)');
    ctx.fillStyle = grad;
    ctx.fill();
  }

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      buildCaustic();
      buildAll();
    },
    frame(dt, t) {
      drawDepth();
      drawCaustic(t);
      drawRays(t);
      drawManta(dt);

      // ── marine snow (rides flow + slow sink; lights up inside god rays) ──
      ctx.globalCompositeOperation = 'lighter';
      for (const s of snow) {
        const fl = flow(s.x, s.y, t);
        s.x += fl.dx * dt * 7 * (0.4 + s.depth);
        s.y += (8 * (0.3 + s.depth) + fl.dy * 5) * dt;
        if (s.y > h + 4) {
          s.y = -4;
          s.x = rand(0, w);
        }
        if (s.x < -4) s.x = w + 4;
        else if (s.x > w + 4) s.x = -4;
        const dy = scrollShift(lerp(0.16, 0.05, s.depth));
        const a = Math.min(1, s.baseA * (0.6 + 0.4 * Math.sin(t * 0.8 + s.phase)) + rayBoost(s.x, s.y, t) * 0.5);
        ctx.fillStyle = `rgba(210, 240, 245, ${a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y + dy, s.r, 0, TAU);
        ctx.fill();
      }

      // ── plankton (cached glow sprites; brighten inside god rays) ──
      for (const p of plankton) {
        const fl = flow(p.x, p.y, t);
        p.x += fl.dx * dt * 6;
        if (p.x < -4) p.x = w + 4;
        else if (p.x > w + 4) p.x = -4;
        const dy = scrollShift(0.1);
        const a = Math.min(
          1,
          0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * p.pulse + p.phase)) + rayBoost(p.x, p.y, t) * 0.4,
        );
        blitGlow(ctx, planktonSprites[p.ci], p.x, p.y + dy, p.r * 5, a);
      }

      // ── jellyfish ──
      for (const j of jellies) drawJelly(j, t);

      // ── fish: wander + belly gradient (far → near) ──
      ctx.globalCompositeOperation = 'source-over';
      for (const f of fish) stepFish(f, dt, t);
      const sorted = [...fish].sort((a, b) => b.depth - a.depth);
      for (const f of sorted) drawFishOne(f, false);
      // a cohesive loose school: members hold formation around a wandering
      // leader and orient to its heading
      if (school) {
        const L = school.leader;
        stepFish(L, dt, t);
        const cos = Math.cos(L.heading);
        const sin = Math.sin(L.heading);
        const sx = cos; // school faces the leader's travel direction
        const dyL = scrollShift(0.1);
        for (const m of school.members) {
          const ox = m.ox * cos - m.oy * sin;
          const oy = m.ox * sin + m.oy * cos;
          const fl = flow(L.x + ox, L.y + oy, t);
          const tail = Math.sin(L.tailPhase + m.ox) * 0.5;
          ctx.save();
          ctx.translate(L.x + ox + fl.dx * 3, L.y + oy + fl.dy * 3 + dyL);
          ctx.scale(sx * L.size, L.size);
          ctx.globalAlpha = 0.42;
          ctx.shadowColor = 'rgba(94, 234, 212, 0.4)';
          ctx.shadowBlur = 4;
          ctx.fillStyle = 'rgb(120, 195, 210)';
          drawFishShape(ctx, tail, SPECIES[0].bodyH);
          ctx.restore();
        }
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      // ── rising bubbles (cached sprite) ──
      ctx.globalCompositeOperation = 'lighter';
      for (const b of bubbles) {
        const fl = flow(b.x, b.y, t);
        b.y -= b.speed * dt;
        b.x += (fl.dx * 10 + Math.sin(t * 1.2 + b.phase) * 8) * dt;
        if (b.y < -b.r - 4) Object.assign(b, makeBubble(false));
        const dy = scrollShift(0.14);
        if (bubbleSprite) blitGlow(ctx, bubbleSprite, b.x, b.y + dy, b.r, b.alpha);
      }
      ctx.globalAlpha = 1;

      // ── seafloor + kelp rooted into it (frontmost) ──
      drawFloor(t);
      for (const k of kelps) drawKelp(k, t);

      // ── cinematic vignette ──
      drawVignette(ctx, w, h, 0.22);
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

export default function DeepSea() {
  const active = useThemeStore((s) => s.mode === 'deepsea');
  const ref = useAmbientCanvas(active, buildDeepSea);
  if (!active) return null;
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="jz-ambient-canvas"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
