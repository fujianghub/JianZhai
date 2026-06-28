/**
 * Starry-night ambient backdrop, rendered on a canvas.
 *
 * A cinematic, living night sky. The whole star field wheels ultra-slowly
 * around an off-screen celestial pole; every star scintillates on its own
 * (sine + jitter + occasional sharp spike), and the brightest throw chromatic
 * diffraction spikes. The Milky Way reads as a real river of stars — a dense
 * scatter of tiny faint stars clustered along the band over a faint dust haze,
 * not a smoky cloud. A couple of steady planets hang among the stars; nebulae
 * drift; a faint horizon airglow glows along the bottom; shooting stars (and
 * the rarer brighter fireball) streak past. Depth layers parallax with both the
 * pointer and the page scroll, and a soft vignette frames the scene.
 *
 * Active only under [data-theme='starry']; the canvas sits at z-index 0 behind
 * the (transparent) app layout, painting purely additive light over the dark
 * body gradient.
 */
import { useThemeStore } from '@/stores/theme';
import {
  useAmbientCanvas,
  rand,
  densityCount,
  flow,
  fbm,
  makeOffscreen,
  makeGlowSprite,
  blitGlow,
  drawVignette,
  TAU,
  type SceneController,
  type PointerState,
} from './ambientCanvas';

const STAR_COLORS: ReadonlyArray<[number, number, number]> = [
  [255, 255, 255],
  [255, 255, 255],
  [214, 228, 255], // blue-white
  [196, 214, 255], // blue
  [255, 246, 232], // warm white
  [255, 246, 232],
  [255, 214, 170], // amber giant
  [255, 178, 150], // red giant
];

/** three parallax layers: far (dim, numerous) → near (big, bright, shifts most) */
const LAYERS = [
  { parallax: 4, sizeMul: 0.7, alphaMul: 0.7, frac: 0.5, scroll: 0.04 },
  { parallax: 12, sizeMul: 1.0, alphaMul: 0.9, frac: 0.35, scroll: 0.1 },
  { parallax: 26, sizeMul: 1.45, alphaMul: 1.0, frac: 0.15, scroll: 0.2 },
];

const ROT_SPEED = 0.0016; // rad/s — a full turn in ~65 min

interface Star {
  pr: number; // polar radius from the celestial pole
  pa: number; // polar angle
  r: number;
  ci: number; // index into STAR_COLORS
  baseA: number;
  twPhase: number;
  twSpeed: number;
  layer: number;
  bright: boolean;
  scint: boolean;
  spikeFreq: number;
}
type RGB = [number, number, number];

interface NebulaPuff {
  ox: number; // base offset from the cloud centre
  oy: number;
  r: number; // base radius
  phase: number;
  orbitR: number; // how far the puff churns around its base
  orbitSpeed: number;
  breath: number; // breathing (expand/contract) speed
  stretch: number; // 1 = round, >1 = wispy filament along `angle`
  angle: number;
  u: number; // position along the cloud's colour ramp (0..1)
  core: boolean; // a bright, warm "heart" puff
}
interface Nebula {
  x: number; // base centre
  y: number;
  ramp: RGB[]; // multi-hue colour ramp (3–4 stops)
  a: number; // base alpha
  phase: number;
  driftX: number; // slow overall drift amplitude
  driftY: number;
  driftSpeed: number;
  puffs: NebulaPuff[];
}
/** a drifting, twinkling, fading "fairy-dust" speck near the band */
interface Mote {
  x: number;
  y: number;
  r: number;
  ramp: RGB[];
  u: number;
  twPhase: number;
  twSpeed: number;
  life: number;
  maxLife: number;
}
/** a big soft defocused foreground orb */
/** lerp two RGB triples */
function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
}

/** sample a multi-stop colour ramp at u ∈ [0,1] */
function rampColor(ramp: RGB[], u: number): RGB {
  const n = ramp.length - 1;
  const x = Math.max(0, Math.min(1, u)) * n;
  const i = Math.min(n - 1, x | 0);
  return mix(ramp[i], ramp[i + 1], x - i);
}

/** preset multi-hue ramps for dreamy nebulae */
const NEBULA_RAMPS: ReadonlyArray<RGB[]> = [
  [
    [232, 110, 190],
    [168, 110, 224],
    [104, 130, 226],
    [96, 196, 224],
  ], // magenta → violet → indigo → cyan
  [
    [120, 130, 235],
    [150, 110, 222],
    [222, 122, 200],
    [245, 180, 170],
  ], // blue → violet → rose → warm
  [
    [96, 200, 210],
    [110, 160, 232],
    [170, 120, 230],
    [226, 132, 196],
  ], // teal → blue → violet → pink
];

const NEBULA_FLOW = 20; // organic swirl amplitude for nebula puffs
interface Planet {
  x: number;
  y: number;
  r: number;
  color: [number, number, number];
}
interface Shooting {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  len: number;
  fireball: boolean;
}

function pickLayer(): number {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < LAYERS.length; i++) {
    acc += LAYERS[i].frac;
    if (r < acc) return i;
  }
  return 0;
}

function buildStarry(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pointer: PointerState,
): SceneController {
  let stars: Star[] = [];
  let nebulae: Nebula[] = [];
  let motes: Mote[] = [];
  let planets: Planet[] = [];
  const shooting: Shooting[] = [];
  let nextShoot = rand(1.5, 4);
  let milky: HTMLCanvasElement | null = null;
  let sprites: HTMLCanvasElement[] = [];
  // celestial pole (off-screen, upper-right) the sky wheels around
  let pole = { x: 0, y: 0 };
  let band = { cx: 0, cy: 0, slope: 0, tilt: -0.38 };

  function toPolar(x: number, y: number) {
    const dx = x - pole.x;
    const dy = y - pole.y;
    return { pr: Math.hypot(dx, dy), pa: Math.atan2(dy, dx) };
  }

  function buildSprites() {
    sprites = STAR_COLORS.map((c) => makeGlowSprite(14, `${c[0]},${c[1]},${c[2]}`));
  }

  /** faint Milky-Way dust haze (now subtle — the band's body is real stars) */
  function buildMilky() {
    const tw = 360;
    const th = 150;
    milky = makeOffscreen(tw, th, (cx, cw, ch) => {
      const img = cx.createImageData(cw, ch);
      for (let y = 0; y < ch; y++) {
        const across = (y / ch - 0.5) * 2;
        const core = Math.exp(-across * across * 3.0);
        for (let x = 0; x < cw; x++) {
          const n = fbm(x * 0.045, y * 0.05, 4);
          const rift = fbm(x * 0.028 + 11, y * 0.06 + 5, 3);
          let b = core * (0.22 + 1.15 * n) * (0.45 + 0.85 * rift);
          b = Math.max(0, Math.min(1, b));
          const i = (y * cw + x) * 4;
          img.data[i] = 190 * b + 35;
          img.data[i + 1] = 175 * b + 28;
          img.data[i + 2] = 235 * b + 55;
          img.data[i + 3] = b * 120; // soft dust haze (the nebula gas leads)
        }
      }
      cx.putImageData(img, 0, 0);
    });
  }

  function bandPoint(along: number, across: number): [number, number] {
    const px = band.cx + along * w * 0.85;
    const py = band.cy + along * w * 0.85 * band.slope;
    return [px - band.slope * across * h * 0.14, py + across * h * 0.14];
  }

  function buildField() {
    pole = { x: w * 1.15, y: -h * 0.35 };
    band = { cx: w * 0.5, cy: h * 0.4, slope: Math.tan(-0.38), tilt: -0.38 };
    // a single, evenly-scattered star field (no dense band concentration) — so
    // the nebula gas reads as pure gas, with only a few natural foreground
    // stars happening to sit in front of it
    const count = densityCount(w, h, 3500, 220, 700);
    stars = [];
    for (let i = 0; i < count; i++) {
      const x = rand(0, w);
      const y = rand(0, h);
      const layer = pickLayer();
      const bright = Math.random() < 0.06;
      const { pr, pa } = toPolar(x, y);
      stars.push({
        pr,
        pa,
        r: (bright ? rand(1.3, 2.3) : rand(0.4, 1.25)) * LAYERS[layer].sizeMul,
        ci: (Math.random() * STAR_COLORS.length) | 0,
        baseA: rand(0.4, 1) * LAYERS[layer].alphaMul,
        twPhase: rand(0, TAU),
        twSpeed: rand(0.25, 2.2),
        layer,
        bright,
        scint: Math.random() < 0.22,
        spikeFreq: rand(0.5, 1.4),
      });
    }
  }

  function pickRamp(): RGB[] {
    return NEBULA_RAMPS[(Math.random() * NEBULA_RAMPS.length) | 0].map((c) => [...c] as RGB);
  }

  function buildNebulae() {
    const tilt = band.tilt; // wisps stream roughly along the band
    nebulae = [];

    function makePuff(kind: 'base' | 'wisp' | 'core'): NebulaPuff {
      if (kind === 'core') {
        return {
          ox: rand(-50, 50),
          oy: rand(-35, 35),
          r: rand(60, 105),
          phase: rand(0, TAU),
          orbitR: rand(10, 26),
          orbitSpeed: rand(0.05, 0.12),
          breath: rand(0.18, 0.34),
          stretch: rand(1, 1.3),
          angle: rand(0, TAU),
          u: rand(0.35, 0.65),
          core: true,
        };
      }
      const wisp = kind === 'wisp';
      return {
        ox: rand(-150, 150),
        oy: rand(-100, 100),
        r: wisp ? rand(120, 215) : rand(150, 275),
        phase: rand(0, TAU),
        orbitR: rand(26, 70),
        orbitSpeed: rand(0.05, 0.13),
        breath: rand(0.1, 0.26),
        stretch: wisp ? rand(1.8, 3.0) : rand(1, 1.25),
        angle: wisp ? tilt + rand(-0.6, 0.6) : rand(0, TAU),
        u: rand(0, 1),
        core: false,
      };
    }

    const n = w < 720 ? 6 : 10; // density ×2 (cloud count doubled)
    for (let i = 0; i < n; i++) {
      const [cx, cy] = bandPoint(rand(-0.55, 0.55), rand(-0.6, 0.6));
      const puffs: NebulaPuff[] = [];
      const baseN = 3 + ((Math.random() * 2) | 0); // 3–4 soft round base puffs (+50%)
      const wispN = 5 + ((Math.random() * 2) | 0); // 5–6 wispy filaments (+50%)
      for (let j = 0; j < baseN; j++) puffs.push(makePuff('base'));
      for (let j = 0; j < wispN; j++) puffs.push(makePuff('wisp'));
      puffs.push(makePuff('core'));
      nebulae.push({
        x: cx,
        y: cy,
        ramp: pickRamp(),
        a: rand(0.05, 0.085), // brightness −50%
        phase: rand(0, TAU),
        driftX: rand(18, 42),
        driftY: rand(14, 32),
        driftSpeed: rand(0.012, 0.03),
        puffs,
      });
    }

    // one huge, very faint ambient wash along the band for colour depth
    const [ax, ay] = bandPoint(rand(-0.3, 0.3), rand(-0.3, 0.3));
    const ambientPuffs: NebulaPuff[] = [];
    for (let j = 0; j < 3; j++) {
      ambientPuffs.push({
        ox: rand(-260, 260),
        oy: rand(-150, 150),
        r: rand(360, 520),
        phase: rand(0, TAU),
        orbitR: rand(20, 50),
        orbitSpeed: rand(0.02, 0.06),
        breath: rand(0.05, 0.14),
        stretch: rand(1.3, 2.2),
        angle: tilt + rand(-0.4, 0.4),
        u: rand(0, 1),
        core: false,
      });
    }
    nebulae.push({
      x: ax,
      y: ay,
      ramp: pickRamp(),
      a: 0.025, // ambient wash brightness −50%
      phase: rand(0, TAU),
      driftX: rand(20, 40),
      driftY: rand(12, 26),
      driftSpeed: rand(0.008, 0.018),
      puffs: ambientPuffs,
    });
  }

  function makeMote(initial: boolean): Mote {
    const [x, y] = bandPoint(rand(-0.85, 0.85), (Math.random() - 0.5 + (Math.random() - 0.5)) * 1.15);
    const maxLife = rand(6, 15);
    return {
      x,
      y,
      r: rand(0.8, 2.2),
      ramp: pickRamp(),
      u: rand(0, 1),
      twPhase: rand(0, TAU),
      twSpeed: rand(0.6, 2.0),
      life: initial ? rand(0, maxLife) : 0,
      maxLife,
    };
  }

  function buildMotes() {
    const n = w < 720 ? 12 : 18;
    motes = Array.from({ length: n }, () => makeMote(true));
  }

  function buildPlanets() {
    const palette: ReadonlyArray<[number, number, number]> = [
      [255, 180, 140],
      [255, 226, 168],
      [180, 214, 255],
    ];
    const n = Math.random() < 0.6 ? 2 : 1;
    planets = [];
    for (let i = 0; i < n; i++) {
      planets.push({
        x: rand(w * 0.1, w * 0.7),
        y: rand(h * 0.12, h * 0.6),
        r: rand(2.1, 3.2),
        color: palette[(Math.random() * palette.length) | 0],
      });
    }
  }

  buildSprites();
  buildMilky();
  buildField();
  buildNebulae();
  buildMotes();
  buildPlanets();

  function spawnShoot() {
    const fromLeft = Math.random() < 0.5;
    const fireball = Math.random() < 0.18;
    const speed = fireball ? rand(440, 660) : rand(620, 1020);
    const ang = rand(0.22, 0.5) * (fromLeft ? 1 : -1) + (fromLeft ? 0 : Math.PI);
    shooting.push({
      x: fromLeft ? rand(-40, w * 0.4) : rand(w * 0.6, w + 40),
      y: rand(h * 0.04, h * 0.42),
      vx: Math.cos(ang) * speed,
      vy: Math.abs(Math.sin(ang)) * speed * 0.55 + speed * 0.18,
      life: 0,
      max: fireball ? rand(1.4, 2.2) : rand(0.7, 1.3),
      len: fireball ? rand(160, 280) : rand(90, 200),
      fireball,
    });
  }

  /** bounded scroll parallax (asymptotes so long pages never leave gaps) */
  function scrollShift(depth: number) {
    return -depth * 70 * Math.tanh(pointer.scrollY / 500);
  }

  function drawMilky(t: number, rot: number) {
    if (!milky) return;
    // orbit the band centre around the pole + spin its orientation with the sky
    const a = Math.atan2(band.cy - pole.y, band.cx - pole.x) + rot;
    const pr = Math.hypot(band.cx - pole.x, band.cy - pole.y);
    const cx = pole.x + pr * Math.cos(a);
    const cy = pole.y + pr * Math.sin(a) + scrollShift(0.04);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.72 + 0.08 * Math.sin(t * 0.2);
    ctx.translate(cx + Math.sin(t * 0.03) * 30, cy);
    ctx.rotate(band.tilt + rot);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(milky, (-w * 1.7) / 2, (-h * 0.6) / 2, w * 1.7, h * 0.6);
    ctx.restore();
  }

  function drawMoon() {
    const mx = w - Math.min(120, w * 0.12);
    const my = Math.min(96, h * 0.13);
    const R = 26;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(mx, my, R * 0.4, mx, my, R * 3.4);
    g.addColorStop(0, 'rgba(252, 240, 200, 0.30)');
    g.addColorStop(1, 'rgba(252, 240, 200, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(mx, my, R * 3.4, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    const disc = ctx.createRadialGradient(mx - R * 0.3, my - R * 0.3, 1, mx, my, R);
    disc.addColorStop(0, '#fdf3d4');
    disc.addColorStop(0.6, '#ecd9a4');
    disc.addColorStop(1, '#c9b67e');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(mx, my, R, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#060914';
    ctx.beginPath();
    ctx.arc(mx + R * 0.62, my - R * 0.28, R * 1.02, 0, TAU);
    ctx.fill();
  }

  function drawAirglow(t: number) {
    ctx.globalCompositeOperation = 'lighter';
    const a = 0.06 + 0.02 * Math.sin(t * 0.25);
    const g = ctx.createLinearGradient(0, h, 0, h * 0.6);
    g.addColorStop(0, `rgba(90, 200, 170, ${a})`);
    g.addColorStop(0.5, `rgba(120, 150, 210, ${a * 0.5})`);
    g.addColorStop(1, 'rgba(120, 150, 210, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, h * 0.6, w, h * 0.4);
  }

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      buildField();
      buildNebulae();
      buildMotes();
      buildPlanets();
    },
    frame(dt, t) {
      const rot = t * ROT_SPEED;
      drawAirglow(t);
      drawMilky(t, rot);

      // ── nebulae: dreamy multi-hue gas — wispy filaments, a glowing core with
      //    a soft bloom + radiating light shafts, all churning on a shared flow
      //    with a slow iridescent ramp drift ──
      ctx.globalCompositeOperation = 'lighter';
      const WARM: RGB = [255, 244, 224];
      for (const n of nebulae) {
        const cx = n.x + Math.sin(t * n.driftSpeed + n.phase) * n.driftX + pointer.x * 10;
        const cy =
          n.y +
          Math.cos(t * n.driftSpeed * 0.8 + n.phase) * n.driftY +
          pointer.y * 8 +
          scrollShift(0.06);
        for (const p of n.puffs) {
          const ang = p.phase + t * p.orbitSpeed;
          let px = cx + p.ox + Math.cos(ang) * p.orbitR;
          let py = cy + p.oy + Math.sin(ang * 0.85) * p.orbitR;
          const fl = flow(px, py, t);
          px += fl.dx * NEBULA_FLOW;
          py += fl.dy * NEBULA_FLOW;
          const rr = p.r * (1 + (p.core ? 0.28 : 0.2) * Math.sin(t * p.breath + p.phase));
          let a = n.a * (0.7 + 0.3 * Math.sin(t * 0.3 + p.phase));
          // iridescence: slowly drift the puff's position along the colour ramp
          const u2 = p.u + 0.18 * Math.sin(t * 0.05 + p.phase + n.phase);
          let col = rampColor(n.ramp, u2);
          if (p.core) {
            a *= 1.3;
            col = mix(col, WARM, 0.45); // warm glowing heart
            const [hr, hg, hb] = mix(col, WARM, 0.3);
            // soft bloom halo
            const bloomR = rr * 3;
            const bg = ctx.createRadialGradient(px, py, 0, px, py, bloomR);
            bg.addColorStop(0, `rgba(${hr | 0},${hg | 0},${hb | 0},${a * 0.3})`);
            bg.addColorStop(1, `rgba(${hr | 0},${hg | 0},${hb | 0},0)`);
            ctx.fillStyle = bg;
            ctx.beginPath();
            ctx.arc(px, py, bloomR, 0, TAU);
            ctx.fill();
            // radiating light shafts, slowly rotating + pulsing
            for (let s = 0; s < 3; s++) {
              const sa = (s / 3) * TAU + t * 0.05 + n.phase;
              const len = rr * (2.4 + 0.6 * Math.sin(t * 0.6 + s));
              ctx.save();
              ctx.translate(px, py);
              ctx.rotate(sa);
              ctx.scale(1, 0.12); // thin ray
              const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
              sg.addColorStop(0, `rgba(${hr | 0},${hg | 0},${hb | 0},${a * 0.2})`);
              sg.addColorStop(1, `rgba(${hr | 0},${hg | 0},${hb | 0},0)`);
              ctx.fillStyle = sg;
              ctx.beginPath();
              ctx.arc(0, 0, len, 0, TAU);
              ctx.fill();
              ctx.restore();
            }
          }
          const [r, g, b] = col;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(p.angle);
          ctx.scale(p.stretch, 1); // elongate round puff → wispy filament
          const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
          grad.addColorStop(0, `rgba(${r | 0},${g | 0},${b | 0},${a})`);
          grad.addColorStop(1, `rgba(${r | 0},${g | 0},${b | 0},0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, rr, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      }

      // ── fairy-dust motes: drifting, twinkling specks that fade & respawn ──
      ctx.globalCompositeOperation = 'lighter';
      for (const m of motes) {
        m.life += dt;
        if (m.life > m.maxLife || m.x < -12 || m.x > w + 12 || m.y < -12) {
          Object.assign(m, makeMote(false));
          continue;
        }
        const fl = flow(m.x, m.y, t);
        m.x += (fl.dx * 10 + Math.sin(t * 0.2 + m.twPhase) * 4) * dt;
        m.y += (fl.dy * 10 - 7) * dt; // slow upward drift
        const fade = Math.sin(Math.min(1, m.life / m.maxLife) * Math.PI);
        const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * m.twSpeed + m.twPhase));
        const a = fade * tw * 0.9;
        const [r, g, b] = mix(rampColor(m.ramp, m.u), WARM, 0.4);
        const px = m.x + pointer.x * 16;
        const py = m.y + pointer.y * 10 + scrollShift(0.08);
        const grad = ctx.createRadialGradient(px, py, 0, px, py, m.r * 4);
        grad.addColorStop(0, `rgba(${r | 0},${g | 0},${b | 0},${a})`);
        grad.addColorStop(1, `rgba(${r | 0},${g | 0},${b | 0},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, m.r * 4, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgba(255,250,240,${a})`;
        ctx.beginPath();
        ctx.arc(px, py, m.r * 0.7, 0, TAU);
        ctx.fill();
      }

      drawMoon();

      // ── stars: wheel + scintillation + parallax + chromatic spikes ──
      ctx.globalCompositeOperation = 'lighter';
      for (const s of stars) {
        const L = LAYERS[s.layer];
        const a0 = s.pa + rot;
        const fl = s.layer === 0 ? flow(s.pr, s.pa, t) : { dx: 0, dy: 0 };
        const x = pole.x + s.pr * Math.cos(a0) + pointer.x * L.parallax + fl.dx * 12;
        const y =
          pole.y +
          s.pr * Math.sin(a0) +
          pointer.y * (L.parallax * 0.6) +
          scrollShift(L.scroll) +
          fl.dy * 12;
        if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
        const tw = 0.5 + 0.5 * Math.sin(t * s.twSpeed + s.twPhase);
        const jit = 0.5 + 0.5 * Math.sin(t * s.twSpeed * 4.3 + s.twPhase * 2);
        let bri = 0.3 + 0.5 * tw + 0.2 * jit * tw;
        let spike = 0;
        if (s.scint) {
          spike = Math.pow(Math.max(0, Math.sin(t * s.spikeFreq + s.twPhase)), 24);
          bri += spike * 0.8;
        }
        let a = Math.min(0.8, s.baseA * bri);
        if (s.bright) a *= 0.5; // dim the standout bright stars −50%
        const [r, g, b] = STAR_COLORS[s.ci];
        if (s.bright) {
          blitGlow(ctx, sprites[s.ci], x, y, s.r * 6, a * 0.4);
          if (s.r > 2.4) {
            const len = s.r * 7 * (0.6 + 0.6 * tw);
            // chromatic diffraction spikes: red/blue offset when scintillating
            const off = 0.6 + spike * 1.5;
            ctx.lineWidth = 0.8;
            ctx.strokeStyle = `rgba(255,120,120,${a * 0.25})`;
            ctx.beginPath();
            ctx.moveTo(x - len, y - off);
            ctx.lineTo(x + len, y - off);
            ctx.moveTo(x - off, y - len);
            ctx.lineTo(x - off, y + len);
            ctx.stroke();
            ctx.strokeStyle = `rgba(120,160,255,${a * 0.25})`;
            ctx.beginPath();
            ctx.moveTo(x - len, y + off);
            ctx.lineTo(x + len, y + off);
            ctx.moveTo(x + off, y - len);
            ctx.lineTo(x + off, y + len);
            ctx.stroke();
            ctx.strokeStyle = `rgba(255,255,255,${a * 0.4})`;
            ctx.beginPath();
            ctx.moveTo(x - len, y);
            ctx.lineTo(x + len, y);
            ctx.moveTo(x, y - len);
            ctx.lineTo(x, y + len);
            ctx.stroke();
          }
        }
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, TAU);
        ctx.fill();
      }

      // ── planets: steady glow, no twinkle ──
      for (const p of planets) {
        const x = p.x + pointer.x * 16;
        const y = p.y + pointer.y * 10 + scrollShift(0.12);
        const [r, g, b] = p.color;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, p.r * 5);
        glow.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
        glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, p.r * 5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgba(${r},${g},${b},0.95)`;
        ctx.beginPath();
        ctx.arc(x, y, p.r, 0, TAU);
        ctx.fill();
      }

      // ── shooting stars + fireballs ──
      nextShoot -= dt;
      if (nextShoot <= 0) {
        spawnShoot();
        nextShoot = rand(2.2, 6.5);
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = shooting.length - 1; i >= 0; i--) {
        const s = shooting[i];
        s.life += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const p = s.life / s.max;
        if (p >= 1 || s.x < -160 || s.x > w + 160 || s.y > h + 160) {
          shooting.splice(i, 1);
          continue;
        }
        const fade = Math.sin(Math.min(1, p) * Math.PI);
        const mag = Math.hypot(s.vx, s.vy) || 1;
        const tx = s.x - (s.vx / mag) * s.len;
        const ty = s.y - (s.vy / mag) * s.len;
        const trail = ctx.createLinearGradient(s.x, s.y, tx, ty);
        if (s.fireball) {
          trail.addColorStop(0, `rgba(214,255,224,${0.95 * fade})`);
          trail.addColorStop(0.4, `rgba(150,255,200,${0.4 * fade})`);
          trail.addColorStop(1, 'rgba(150,255,200,0)');
        } else {
          trail.addColorStop(0, `rgba(255,255,255,${0.9 * fade})`);
          trail.addColorStop(0.4, `rgba(214,228,255,${0.35 * fade})`);
          trail.addColorStop(1, 'rgba(214,228,255,0)');
        }
        ctx.strokeStyle = trail;
        ctx.lineWidth = s.fireball ? 2.6 : 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        if (s.fireball) {
          const bloom = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 14);
          bloom.addColorStop(0, `rgba(220,255,230,${0.8 * fade})`);
          bloom.addColorStop(1, 'rgba(220,255,230,0)');
          ctx.fillStyle = bloom;
          ctx.beginPath();
          ctx.arc(s.x, s.y, 14, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = `rgba(255,255,255,${fade})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.fireball ? 2.6 : 1.6, 0, TAU);
        ctx.fill();
      }

      // ── cinematic vignette (frame the scene, calm the centre) ──
      drawVignette(ctx, w, h, 0.26);
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

export default function StarryNight() {
  const active = useThemeStore((s) => s.mode === 'starry');
  const ref = useAmbientCanvas(active, buildStarry);
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
