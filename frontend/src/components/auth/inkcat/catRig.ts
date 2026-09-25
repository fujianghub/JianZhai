/**
 * 水墨猫「软体骨架」纯函数层（2026-09-25 四期：去僵）。
 *
 * 旧实现的耳朵是一块刚性三角、尾巴是一根棍，只能绕根部转——所以不自然。
 * 这里把它们参数化：
 * - 耳朵：转向 swivel / 立起 lift / 压平 flat（飞机耳）/ 耳尖弯折 tip → 每帧生成路径；
 * - 尾巴：8 节链，节角 = 基角 + 卷曲 + 沿尾传播的波 + 尾尖甩动/颤动 → 平滑曲线；
 * - 情绪 → 姿态目标表 poseFor（耳/眉/尾 + 兴奋度）；
 * - 平滑一维噪声 noise1（「活气」微动用）。
 * 运行时（弹簧、错峰、冲量、写 DOM）在 useCatEngine；这里无副作用，便于单测。
 */
import type { LoginMood } from '../loginMood';
import type { CatBehavior } from './catEngine';

export interface EarPose {
  /** 向外转（deg，正=外翻；负=前倾/向内） */
  swivel: number;
  /** 立起程度（高度倍数，1=常态） */
  lift: number;
  /** 飞机耳压平程度 0–1（侧向压扁、耳窝藏起） */
  flat: number;
  /** 耳尖向外下弯折（deg） */
  tip: number;
}
export interface BrowPose {
  rot: number;
  dy: number;
}
export interface TailPose {
  /** 根部方向（deg，0=向右，正=向下） */
  base: number;
  /** 从根到尖累计转角（负=向上卷） */
  curl: number;
  /** 沿尾传播的摆动幅度（deg）与频率（Hz） */
  amp: number;
  hz: number;
  /** 描边粗细（炸毛变粗） */
  puff: number;
  /** 尾尖额外甩动幅度（deg）与频率（Hz）：扑猎急甩 / 兴奋颤 */
  lash: number;
  lashHz: number;
}
export interface CatPose {
  earL: EarPose;
  earR: EarPose;
  browL: BrowPose;
  browR: BrowPose;
  tail: TailPose;
  /** 兴奋度 0–1：耳朵细颤 */
  excite: number;
}

/* ── 耳朵姿态库 ── */
const EAR = {
  neutral: { swivel: 0, lift: 1, flat: 0, tip: 0 },
  perk: { swivel: -5, lift: 1.1, flat: 0, tip: 0 }, // 好奇：竖起、耳窝朝前
  excited: { swivel: -7, lift: 1.13, flat: 0, tip: 0 },
  alert: { swivel: -3, lift: 1.06, flat: 0.12, tip: 0 }, // 专注/盯猎物
  airplane: { swivel: 26, lift: 0.8, flat: 0.7, tip: 6 }, // 害羞：飞机耳
  shyish: { swivel: 17, lift: 0.88, flat: 0.45, tip: 4 }, // 被盯着：半飞机耳
  droop: { swivel: 30, lift: 0.76, flat: 0.35, tip: 30 }, // 委屈：耳尖先塌
  sleepy: { swivel: 14, lift: 0.86, flat: 0.2, tip: 16 },
  relaxed: { swivel: 10, lift: 0.95, flat: 0.15, tip: 4 },
  cocked: { swivel: 11, lift: 0.95, flat: 0.1, tip: 8 }, // 坏笑：单耳歪
} satisfies Record<string, EarPose>;

const BROW0: BrowPose = { rot: 0, dy: 0 };
/* 尾巴姿态经数值扫描选定（尾长 150，书后遮挡区 x44–256/y272–322）：收起/打盹绕到书后只露尾尖，
   勿再用「低基角+小卷曲」——会成一根横在书外的棍（旧参数伸到 x≈330） */
const TAIL = {
  idle: { base: 10, curl: -135, amp: 7, hz: 0.16, puff: 17, lash: 0, lashHz: 0 },
  curious: { base: -18, curl: -178, amp: 4, hz: 0.25, puff: 17, lash: 0, lashHz: 0 }, // 问号卷
  focus: { base: 5, curl: -130, amp: 3, hz: 0.2, puff: 17, lash: 12, lashHz: 1.6 },
  excited: { base: -65, curl: -45, amp: 3, hz: 0.3, puff: 17, lash: 5, lashHz: 7 }, // 竖直尾尖颤
  sly: { base: 0, curl: -150, amp: 5, hz: 0.3, puff: 17, lash: 5, lashHz: 0.9 },
  tucked: { base: 60, curl: -175, amp: 2, hz: 0.2, puff: 17, lash: 0, lashHz: 0 },
  sad: { base: 48, curl: -120, amp: 1.5, hz: 0.15, puff: 24, lash: 0, lashHz: 0 }, // 低垂炸毛
  asleep: { base: 70, curl: -190, amp: 0, hz: 0, puff: 17, lash: 0, lashHz: 0 },
  hunt: { base: 12, curl: -115, amp: 3, hz: 0.3, puff: 18, lash: 20, lashHz: 3 }, // 尾尖急甩
  happy: { base: -35, curl: -110, amp: 4, hz: 0.25, puff: 17, lash: 4, lashHz: 5 },
} satisfies Record<string, TailPose>;

function sym(e: EarPose, b: BrowPose, tail: TailPose, excite = 0, browR?: BrowPose): CatPose {
  return {
    earL: e,
    earR: e,
    browL: b,
    browR: browR ?? { rot: -b.rot, dy: b.dy },
    tail,
    excite,
  };
}

/** 情绪 → 姿态目标。优先级与 loginMood 一致；idle 下再看行为与悬停。 */
export function poseFor(mood: LoginMood, behavior: CatBehavior, hover: boolean): CatPose {
  switch (mood) {
    case 'success':
      return sym(EAR.excited, { rot: 0, dy: -4 }, TAIL.excited, 1);
    case 'error':
      return sym(EAR.droop, { rot: -18, dy: -2 }, TAIL.sad);
    case 'cover':
      return sym(EAR.airplane, { rot: -18, dy: -2 }, TAIL.tucked);
    case 'peek':
      return { ...sym(EAR.shyish, { rot: 10, dy: 1 }, TAIL.sly, 0, { rot: -10, dy: -6 }), earR: EAR.perk };
    case 'captcha':
      return sym(EAR.alert, { rot: 14, dy: 1 }, TAIL.focus, 0.2);
    case 'typing':
      return sym(EAR.perk, { rot: 0, dy: -3 }, TAIL.curious);
    case 'scout':
      // 偷看这是谁：双耳前竖、靠表单那只（右）转得更狠；一眉压低一眉挑起——打量
      return {
        earL: { swivel: -6, lift: 1.12, flat: 0, tip: 0 },
        earR: { swivel: -12, lift: 1.15, flat: 0, tip: 0 },
        browL: { rot: 8, dy: 0 },
        browR: { rot: -12, dy: -6 },
        tail: TAIL.curious,
        excite: 0.1,
      };
    default:
      break;
  }
  switch (behavior) {
    case 'sleep':
      return sym(EAR.sleepy, { rot: 0, dy: 3 }, TAIL.asleep);
    case 'shy':
      return sym(EAR.airplane, { rot: -18, dy: -2 }, TAIL.tucked);
    case 'purr':
      return sym(EAR.excited, { rot: 0, dy: -4 }, TAIL.happy, 0.6);
    case 'belly':
      return sym(EAR.relaxed, { rot: 0, dy: -4 }, TAIL.happy, 0.4);
    case 'hunt':
      return sym(EAR.alert, { rot: 14, dy: 1 }, TAIL.hunt, 0.5);
    case 'blep':
      // 吐舌头：歪一只耳朵、双眉扬起（可爱化 2026-09-25，取代斜眼坏笑）
      return { ...sym(EAR.neutral, { rot: 0, dy: -3 }, TAIL.sly), earR: EAR.cocked };
    case 'wink':
      return { ...sym(EAR.perk, { rot: 8, dy: 3 }, TAIL.sly, 0, { rot: 0, dy: -4 }), earL: EAR.cocked };
    case 'yawn':
    case 'wake':
      return sym(EAR.relaxed, BROW0, TAIL.idle);
    case 'lick':
      return sym(EAR.relaxed, BROW0, TAIL.idle);
    default:
      break;
  }
  if (hover) return sym(EAR.shyish, { rot: -18, dy: -2 }, TAIL.tucked);
  return sym(EAR.neutral, BROW0, TAIL.idle);
}

/* ── 耳朵几何 ──
   局部坐标：耳根中点为原点、耳轴朝上（-y），「外侧」为 -x（左耳朝向；右耳由调用方镜像）。
   根部再往下延伸 22 单位藏进脸里——耳朵转到哪都不会露出根部直线。 */
export const EAR_ANCHOR = {
  l: { x: 106, y: 110, axis: -20 },
  r: { x: 194, y: 110, axis: 20 },
} as const;

type Pt = [number, number];

function rotAround([x, y]: Pt, [cx, cy]: Pt, deg: number): Pt {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
}

function earPoints(w: number, h: number, tip: number, roots: boolean): Pt[] {
  const k = 0.55 * h;
  const knee: Pt = [-w * 0.04, -k];
  const bend = (p: Pt, f: number) => rotAround(p, knee, -tip * f);
  const pts: Pt[] = [
    [-w / 2, 0],
    [-w * 0.3, -k],
    bend([-w * 0.24, -(k + h) / 2], 0.5),
    // 小猫圆耳尖：两个并排点撑出圆顶（旧版单点=尖耳，偏凶）
    bend([-w * 0.17, -h * 0.97], 1),
    bend([w * 0.02, -h * 0.97], 1),
    bend([w * 0.12, -(k + h) / 2 * 0.96], 0.5),
    [w * 0.22, -k * 0.9],
    [w / 2, 0],
  ];
  return roots ? [[-w / 2 + 2, 22], ...pts, [w / 2 - 2, 22]] : pts;
}

/** 耳朵外廓与耳窝路径（局部坐标）+ 耳窝不透明度 */
export function earGeometry(p: EarPose, mirror = false): { outer: string; inner: string; innerOpacity: number } {
  const flat = clamp(p.flat, 0, 1);
  const w = 62 * (1 - 0.3 * flat);
  const h = 56 * clamp(p.lift, 0.5, 1.3) * (1 - 0.15 * flat);
  const mx = (pts: Pt[]): Pt[] => (mirror ? pts.map(([x, y]) => [-x, y] as Pt) : pts);
  const outer = mx(earPoints(w, h, p.tip, true));
  // 耳窝：同形缩小、略偏内侧；压平时侧转（变窄）并淡出
  const iw = w * 0.55 * (1 - 0.75 * flat);
  const ih = h * 0.74;
  const inner = mx(earPoints(iw, ih, p.tip * 0.9, false).map(([x, y]) => [x + w * 0.08, y - 5] as Pt));
  return {
    outer: smoothPath(outer, true),
    inner: smoothPath(inner, true),
    innerOpacity: round(0.62 * (1 - 0.65 * flat), 3),
  };
}

/** 耳朵组的 SVG transform（耳根锚点 + 耳轴 + 外翻） */
export function earTransform(side: 'l' | 'r', swivel: number): string {
  const a = EAR_ANCHOR[side];
  const rot = side === 'l' ? a.axis - swivel : a.axis + swivel;
  return `translate(${a.x} ${a.y}) rotate(${round(rot, 2)})`;
}

/* ── 尾巴 ── */
export const TAIL_BASE: Pt = [190, 280];
const TAIL_SEGS = 8;
const TAIL_LEN = 140;

/** 尾巴节点：phase / lashPhase 为累积相位（弧度），由运行时按频率积分，换频不跳变 */
export function tailPoints(p: TailPose, phase: number, lashPhase: number): Pt[] {
  const seg = TAIL_LEN / TAIL_SEGS;
  const pts: Pt[] = [TAIL_BASE];
  let [x, y] = TAIL_BASE;
  for (let i = 0; i < TAIL_SEGS; i++) {
    const u = i / (TAIL_SEGS - 1);
    const deg =
      p.base +
      p.curl * Math.pow(u, 0.9) +
      p.amp * Math.sin(phase - 0.6 * i) * u +
      p.lash * Math.pow(u, 3) * Math.sin(lashPhase - 0.9 * i);
    const a = (deg * Math.PI) / 180;
    x += seg * Math.cos(a);
    y += seg * Math.sin(a);
    pts.push([x, y]);
  }
  return pts;
}

export function tailPath(p: TailPose, phase = 0, lashPhase = 0): string {
  return smoothPath(tailPoints(p, phase, lashPhase), false);
}

/* ── Catmull-Rom → 三次贝塞尔 ── */
export function smoothPath(pts: Pt[], closed: boolean): string {
  const n = pts.length;
  const at = (i: number): Pt =>
    closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return closed ? `${d} Z` : d;
}

/* ── 平滑一维噪声（值噪声 + 余弦插值），输出 [-1, 1] ── */
function hash(i: number, seed: number): number {
  const s = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}
export function noise1(seed: number, t: number): number {
  const i = Math.floor(t);
  const fr = t - i;
  const w = (1 - Math.cos(fr * Math.PI)) / 2;
  return hash(i, seed) * (1 - w) + hash(i + 1, seed) * w;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function round(v: number, d = 1): number {
  const m = 10 ** d;
  return Math.round(v * m) / m;
}
function f(v: number): string {
  return String(round(v, 1));
}

/* ── 眨眼曲线：闭快睁慢（真实眨眼）/ 偶尔连眨 / 慢眨眼（猫的「我信任你」）──
   返回眼睑闭合度 0–1；动作结束返回 null。 */
export type BlinkKind = 'normal' | 'double' | 'slow';

function oneBlink(ms: number, close: number, hold: number, open: number, depth: number): number | null {
  if (ms < 0) return 0;
  if (ms < close) return depth * easeIn(ms / close);
  if (ms < close + hold) return depth;
  if (ms < close + hold + open) return depth * (1 - easeOut((ms - close - hold) / open));
  return null;
}
const easeIn = (x: number) => x * x;
const easeOut = (x: number) => 1 - (1 - x) * (1 - x);

export function blinkCurve(kind: BlinkKind, ms: number): number | null {
  if (kind === 'slow') return oneBlink(ms, 450, 260, 620, 0.85);
  const first = oneBlink(ms, 70, 40, 150, 1);
  if (kind === 'normal' || first !== null) return first;
  const second = oneBlink(ms - 260 - 90, 70, 30, 150, 1);
  return ms < 350 ? 0 : second;
}
