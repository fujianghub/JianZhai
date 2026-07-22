/**
 * Winter-snow ambient backdrop, rendered on a canvas (light theme).
 *
 * A quiet, deepening snowfall. Back → front: a cool sky tint up top + a soft
 * sun-halo (so white snow has something to read against); three parallax layers
 * of snow — far small & crisp, near big & out-of-focus (bokeh) — drifting on
 * curl-noise turbulence under a wind that gusts and sweeps denser sheets across;
 * each flake carries a cool/warm temperature and a relief halo; fast near flakes
 * smear into wind streaks; a stray plum petal or two (寒梅红) tumbles through; the
 * largest few flakes are six-fold crystals that wobble; snow accumulates into a
 * low, lumpy bank along the bottom that grows over time and drifts with the
 * wind; a frost-pale haze frames the edges.
 *
 * Painting on a PALE background it composites mostly `source-over` with cool
 * translucent ink, reserving `lighter` for sparkle/halo highlights at low alpha.
 *
 * Active only under [data-theme='wintersnow']; canvas at z-index 0 behind the
 * transparent app layout.
 */
import { useThemeStore } from '@/stores/theme';
import {
  useAmbientCanvas,
  rand,
  densityCount,
  flow,
  curl,
  noise2d,
  makeOffscreen,
  makeNoiseTile,
  drawFilmGrain,
  drawVignette,
  TAU,
  type SceneController,
  type PointerState,
} from './ambientCanvas';

type RGB = [number, number, number];

const PLUM_COLORS: ReadonlyArray<RGB> = [
  [194, 69, 95],
  [212, 96, 120],
  [176, 58, 84],
];
/** flake kinds for shape/size variety */
const KIND_DOT = 0;
const KIND_CRYSTAL = 1;
const KIND_FLUFF = 2;

interface Flake {
  x: number;
  y: number;
  r: number;
  baseA: number;
  depth: number; // 0 near (big) … 1 far (small, fainter)
  swayPhase: number;
  swaySpeed: number;
  swayAmp: number;
  spin: number;
  spinSpeed: number;
  fall: number;
  kind: number; // KIND_DOT | KIND_CRYSTAL | KIND_FLUFF
  variant: number; // alternate crystal shape
  sparkle: boolean;
}
interface Plum {
  x: number;
  y: number;
  r: number;
  ci: number;
  spin: number;
  spinSpeed: number;
  flutter: number;
  flutterSpeed: number;
  fall: number;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

const BANK_N = 80; // resolution of the accumulating snow bank

function buildWinterSnow(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pointer: PointerState,
): SceneController {
  let flakes: Flake[] = [];
  let plums: Plum[] = [];
  const crystalSprites: HTMLCanvasElement[] = [];
  let grainTile: HTMLCanvasElement | null = null;
  let bank: number[] = new Array(BANK_N).fill(0);
  let maxBank = h * 0.07;

  // wind: gentle baseline that eases around, with gusts that sweep the whole
  // field sideways at once and drag a denser sheet of snow across with them.
  let wind = 8;
  let windTarget = 8;
  let gustHold = 0;
  let nextGust = rand(5, 11);

  function scrollShift(depth: number) {
    return -depth * 50 * Math.tanh(pointer.scrollY / 500);
  }

  function buildSprites() {
    grainTile = makeNoiseTile(96);
    // Flakes are drawn as crisp shapes (not soft sprites) so the field reads as
    // distinct snowflakes rather than haze. Crystals are sprited in two shapes;
    // pure white lines (no blue glow) — relief comes from a grey shadow at draw.
    const makeCrystal = (dendrite: boolean) =>
      makeOffscreen(72, 72, (cx, W) => {
        const c = W / 2;
        cx.translate(c, c);
        cx.strokeStyle = 'rgba(255,255,255,1)';
        cx.lineWidth = 2.5;
        cx.lineCap = 'round';
        const arm = c * 0.8;
        for (let i = 0; i < 6; i++) {
          cx.save();
          cx.rotate((i / 6) * TAU);
          cx.beginPath();
          cx.moveTo(0, 0);
          cx.lineTo(0, -arm);
          if (dendrite) {
            // feathered dendrite: two pairs of barbs along each arm
            cx.moveTo(0, -arm * 0.5);
            cx.lineTo(arm * 0.26, -arm * 0.66);
            cx.moveTo(0, -arm * 0.5);
            cx.lineTo(-arm * 0.26, -arm * 0.66);
            cx.moveTo(0, -arm * 0.78);
            cx.lineTo(arm * 0.18, -arm * 0.9);
            cx.moveTo(0, -arm * 0.78);
            cx.lineTo(-arm * 0.18, -arm * 0.9);
          } else {
            // simple star: a single fork near the tip
            cx.moveTo(0, -arm * 0.72);
            cx.lineTo(arm * 0.2, -arm * 0.94);
            cx.moveTo(0, -arm * 0.72);
            cx.lineTo(-arm * 0.2, -arm * 0.94);
          }
          cx.stroke();
          cx.restore();
        }
      });
    crystalSprites.push(makeCrystal(true), makeCrystal(false));
  }

  function makeFlake(initial: boolean): Flake {
    // bias toward far → a deep field of tiny atmospheric flakes with a few big
    // near ones (T2.1 depth). Shape mix: dots, ~third crystals, a few fluffs.
    const depth = Math.random() ** 0.7;
    const roll = Math.random();
    const kind = roll < 0.09 ? KIND_FLUFF : roll < 0.42 ? KIND_CRYSTAL : KIND_DOT;
    const r =
      kind === KIND_FLUFF
        ? lerp(9, 5, depth)
        : kind === KIND_CRYSTAL
        ? lerp(7.5, 2.4, depth)
        : lerp(5, 1, depth); // near 5px … far 1px dust
    return {
      x: rand(-0.05 * w, w * 1.05),
      y: initial ? rand(0, h) : rand(-40, -6),
      r,
      baseA: lerp(1.0, 0.62, depth),
      depth,
      swayPhase: rand(0, TAU),
      swaySpeed: rand(0.5, 1.4),
      swayAmp: lerp(24, 5, depth),
      spin: rand(0, TAU),
      spinSpeed: rand(-1.0, 1.0), // faster tumble
      fall: lerp(96, 24, depth), // near fast, far slow → strong parallax
      kind,
      variant: Math.random() < 0.5 ? 0 : 1,
      sparkle: depth < 0.3 && Math.random() < 0.25,
    };
  }

  function makePlum(initial: boolean): Plum {
    return {
      x: rand(0, w),
      y: initial ? rand(0, h) : rand(-50, -10),
      r: rand(7, 12),
      ci: (Math.random() * PLUM_COLORS.length) | 0,
      spin: rand(0, TAU),
      spinSpeed: rand(-1.1, 1.1),
      flutter: rand(0, TAU),
      flutterSpeed: rand(1.2, 2.6),
      fall: rand(34, 52),
    };
  }

  function seedBank() {
    // pre-lay a low, lumpy snow cover so the ground reads as snowy from the
    // first frame; it then visibly deepens as flakes land (T1.1)
    for (let i = 0; i < BANK_N; i++) {
      const u = i / BANK_N;
      const lump =
        0.5 + 0.28 * Math.sin(u * 23 + 1.3) + 0.18 * Math.sin(u * 7.3) + (noise2d(u * 9, 3) - 0.5);
      bank[i] = maxBank * (0.32 + 0.18 * Math.max(0, Math.min(1, lump)));
    }
  }

  function buildAll() {
    // denser field now that flakes are crisp & visible: lots of tiny far flakes
    // (atmosphere) + a few big near ones (T2.1 depth)
    flakes = Array.from({ length: densityCount(w, h, 8200, 110, 240) }, () => makeFlake(true));
    plums = Array.from({ length: w < 720 ? 3 : 5 }, () => makePlum(true));
  }

  buildSprites();
  seedBank();
  buildAll();

  function bankIdx(x: number) {
    return Math.max(0, Math.min(BANK_N - 1, Math.floor((x / w) * BANK_N)));
  }
  function bankHeightAt(x: number) {
    const fx = (x / w) * BANK_N - 0.5;
    const i = Math.max(0, Math.min(BANK_N - 1, Math.floor(fx)));
    const j = Math.min(BANK_N - 1, i + 1);
    const f = Math.max(0, Math.min(1, fx - i));
    return bank[i] + (bank[j] - bank[i]) * f;
  }
  function depositSnow(x: number, amount: number) {
    const i = bankIdx(x);
    bank[i] = Math.min(maxBank, bank[i] + amount);
    // a little to the neighbours so the bank stays smooth and lumpy, not spiky
    if (i > 0) bank[i - 1] = Math.min(maxBank, bank[i - 1] + amount * 0.4);
    if (i < BANK_N - 1) bank[i + 1] = Math.min(maxBank, bank[i + 1] + amount * 0.4);
  }
  function stepBank(dt: number) {
    // gentle diffusion → rounded drifts; wind nudges mass downwind
    const drift = Math.max(-1, Math.min(1, wind / 70));
    const next = bank.slice();
    for (let i = 0; i < BANK_N; i++) {
      const l = bank[Math.max(0, i - 1)];
      const r = bank[Math.min(BANK_N - 1, i + 1)];
      next[i] += ((l + r) / 2 - bank[i]) * Math.min(1, dt * 0.5);
      next[i] += (drift > 0 ? l - bank[i] : r - bank[i]) * Math.min(1, dt * 0.12) * Math.abs(drift);
      next[i] = Math.max(0, Math.min(maxBank, next[i]));
    }
    bank = next;
  }

  function gustSheet() {
    // a gust brings a wave of fresh snow: respawn a chunk of flakes spread
    // across the FULL width just above the top, staggered, so they descend as a
    // broad sheet (a density wave) — not a clump at one corner
    const n = (flakes.length * 0.32) | 0;
    for (let k = 0; k < n; k++) {
      const f = flakes[(Math.random() * flakes.length) | 0];
      f.x = rand(-0.05 * w, w * 1.05);
      f.y = rand(-h * 0.45, -8);
    }
  }

  function stepWind(dt: number, t: number) {
    nextGust -= dt;
    if (gustHold > 0) {
      gustHold -= dt;
      if (gustHold <= 0) windTarget = rand(-14, 16);
    } else if (nextGust <= 0) {
      windTarget = rand(54, 116) * (Math.random() < 0.5 ? -1 : 1);
      gustHold = rand(1.4, 3.2);
      nextGust = rand(5, 10);
      gustSheet();
    }
    const base = (noise2d(11.3, t * 0.05) - 0.5) * 26;
    wind += (windTarget + base - wind) * Math.min(1, dt * 0.7);
  }

  function drawSky(t: number) {
    ctx.globalCompositeOperation = 'source-over';
    // a faint cool wash near the top → just enough for white snow to read,
    // not so much it becomes a fog band
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.6);
    g.addColorStop(0, 'rgba(120, 150, 198, 0.07)');
    g.addColorStop(1, 'rgba(150, 174, 212, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h * 0.6);
    // soft cool sun-halo, high-left
    const sx = w * 0.26;
    const sy = h * 0.12;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(w, h) * 0.5);
    const a = 0.12 + 0.015 * Math.sin(t * 0.25);
    halo.addColorStop(0, `rgba(248, 252, 255, ${a})`);
    halo.addColorStop(0.45, `rgba(228, 240, 255, ${a * 0.4})`);
    halo.addColorStop(1, 'rgba(228, 240, 255, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawPlum(p: Plum, t: number, dt: number) {
    const fl = flow(p.x, p.y, t);
    const cu = curl(p.x, p.y, t, 0.0026);
    p.flutter += p.flutterSpeed * dt;
    p.spin += p.spinSpeed * dt;
    p.x += (wind * 0.9 + fl.dx * 14 + cu.dx * 16 + Math.sin(p.flutter) * 16) * dt;
    p.y += (p.fall + fl.dy * 4 + cu.dy * 8) * dt;
    if (p.y > h + 20 || p.x < -40 || p.x > w + 40) {
      Object.assign(p, makePlum(false));
      return;
    }
    const [r, g, b] = PLUM_COLORS[p.ci];
    const px = p.x + pointer.x * 16;
    const py = p.y + scrollShift(0.12);
    const face = 0.32 + 0.68 * Math.abs(Math.cos(p.flutter));
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(p.spin);
    ctx.scale(face, 1);
    const grad = ctx.createLinearGradient(0, -p.r, 0, p.r);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.92)`);
    grad.addColorStop(1, `rgba(${(r * 0.8) | 0},${(g * 0.7) | 0},${(b * 0.74) | 0},0.92)`);
    ctx.fillStyle = grad;
    const L = p.r;
    const Wd = p.r * 0.7;
    ctx.beginPath();
    ctx.moveTo(0, -L);
    ctx.quadraticCurveTo(Wd, -L * 0.2, Wd * 0.5, L * 0.85);
    ctx.quadraticCurveTo(0, L * 0.6, -Wd * 0.5, L * 0.85);
    ctx.quadraticCurveTo(-Wd, -L * 0.2, 0, -L);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawFlakes(t: number, dt: number) {
    if (crystalSprites.length === 0) return;
    // adaptive quality trims the tail of the flake field
    const flakeN = Math.ceil(flakes.length * pointer.quality);
    for (let fi = 0; fi < flakeN; fi++) {
      const f = flakes[fi];
      const fl = flow(f.x, f.y, t);
      const cu = curl(f.x, f.y, t, 0.0024);
      f.swayPhase += f.swaySpeed * dt;
      f.spin += f.spinSpeed * dt;
      const windF = lerp(1.5, 0.6, f.depth); // near flakes lean harder in wind
      let vx = wind * windF + cu.dx * lerp(16, 6, f.depth) + Math.sin(f.swayPhase) * f.swayAmp + fl.dx * 3;
      let vy = f.fall + cu.dy * 6 + fl.dy * 3;
      // easter egg: the pointer stirs nearby flakes aside — a soft radial push
      // with a slight sideways curl so it reads as displaced air, not a wall
      const ddx = f.x - pointer.px;
      const ddy = f.y - pointer.py;
      const dd = Math.hypot(ddx, ddy);
      if (dd > 0.001 && dd < 90) {
        const s = (1 - dd / 90) * 130;
        vx += (ddx / dd) * s - (ddy / dd) * s * 0.35;
        vy += (ddy / dd) * s * 0.5;
      }
      f.x += vx * dt;
      f.y += vy * dt;
      // land on the accumulating bank (near/mid flakes feed it) — deposit enough
      // that the bank visibly deepens over time (T1.1)
      const bankTop = h - bankHeightAt(f.x);
      if (f.y >= bankTop && f.depth < 0.62) {
        depositSnow(f.x, 0.5 + f.r * 0.45);
        Object.assign(f, makeFlake(false));
        continue;
      }
      if (f.y > h + 6 || f.x < -24 || f.x > w + 24) {
        Object.assign(f, makeFlake(false));
        continue;
      }
      const px = f.x + pointer.x * lerp(22, 6, f.depth);
      const py = f.y + scrollShift(lerp(0.16, 0.05, f.depth));
      const a = f.baseA * (0.84 + 0.16 * Math.sin(t * 0.8 + f.swayPhase));
      // motion streak for fast near flakes — a faint cool-grey smear, source-over
      // (additive white would vanish on the pale background)
      const speed = Math.hypot(vx, vy);
      if (f.kind !== KIND_CRYSTAL && f.depth < 0.4 && speed > 130) {
        const k = Math.min(0.05, (speed - 130) / 4200);
        ctx.save();
        ctx.strokeStyle = `rgba(150, 166, 190, ${a * 0.28})`;
        ctx.lineWidth = f.r * 0.9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px - vx * k, py - vy * k);
        ctx.lineTo(px, py);
        ctx.stroke();
        ctx.restore();
      }
      // crisp opaque white flake + a light, tight grey relief (the deeper sky
      // gives the contrast). Dots & fluffs TUMBLE — the disc squashes edge-on
      // then opens face-on as it turns, so they read as flipping flakes, not
      // dead circles (T2.2). Crystals wobble-rotate.
      ctx.save();
      ctx.shadowColor = 'rgba(96, 110, 134, 0.34)';
      ctx.shadowBlur = Math.max(1.2, f.r * 0.45);
      ctx.translate(px, py);
      if (f.kind === KIND_CRYSTAL) {
        ctx.globalAlpha = Math.min(1, a + 0.1);
        ctx.rotate(f.spin + Math.sin(f.swayPhase) * 0.3);
        const s = f.r * 2.2;
        ctx.drawImage(crystalSprites[f.variant], -s, -s, s * 2, s * 2);
      } else {
        const tumble = 0.55 + 0.45 * Math.abs(Math.cos(f.spin));
        ctx.rotate(f.spin * 0.5 + f.swayPhase * 0.4);
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, a + (f.kind === KIND_FLUFF ? 0.1 : 0.2))})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, f.r, f.r * tumble, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      if (f.sparkle) {
        const sp = Math.pow(Math.max(0, Math.sin(t * 1.6 + f.swayPhase * 2)), 16);
        if (sp > 0.04) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = sp * 0.8;
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 1;
          const len = f.r * 3;
          ctx.beginPath();
          ctx.moveTo(px - len, py);
          ctx.lineTo(px + len, py);
          ctx.moveTo(px, py - len);
          ctx.lineTo(px, py + len);
          ctx.stroke();
          ctx.restore();
          ctx.globalAlpha = 1;
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawBank() {
    const sh = scrollShift(0.04);
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.moveTo(0, h + 4);
    ctx.lineTo(0, h - bank[0] + sh);
    for (let i = 0; i < BANK_N; i++) {
      const x = ((i + 0.5) / BANK_N) * w;
      ctx.lineTo(x, h - bank[i] + sh);
    }
    ctx.lineTo(w, h - bank[BANK_N - 1] + sh);
    ctx.lineTo(w, h + 4);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, h - maxBank + sh, 0, h);
    g.addColorStop(0, 'rgba(250, 252, 255, 0.92)');
    g.addColorStop(1, 'rgba(228, 238, 250, 0.96)');
    ctx.fillStyle = g;
    ctx.fill();
    // a soft cool shadow just under the snow lip for relief
    ctx.strokeStyle = 'rgba(176, 196, 224, 0.5)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, h - bank[0] + sh + 1);
    for (let i = 0; i < BANK_N; i++) {
      const x = ((i + 0.5) / BANK_N) * w;
      ctx.lineTo(x, h - bank[i] + sh + 1);
    }
    ctx.stroke();
  }

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      maxBank = h * 0.07;
      bank = new Array(BANK_N).fill(0);
      seedBank();
      buildAll();
    },
    frame(dt, t) {
      stepWind(dt, t);
      stepBank(dt);
      drawSky(t);

      drawFlakes(t, dt);
      // plum petals drawn AFTER the snow so the one warm note actually reads
      for (const p of plums) drawPlum(p, t, dt);
      drawBank();

      // film grain (jittered per frame) + frost vignette — the cheap "from
      // digital to real" finishing layer
      if (grainTile) {
        const ox = (t * 53) % 96;
        const oy = (t * 71) % 96;
        drawFilmGrain(ctx, w, h, grainTile, 0.03, ox, oy);
      }
      drawVignette(ctx, w, h, 0.14, '246, 249, 254');
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

export default function WinterSnow() {
  const active = useThemeStore((s) => s.mode === 'wintersnow');
  const ref = useAmbientCanvas(active, buildWinterSnow);
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
