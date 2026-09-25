/**
 * 水墨猫动效引擎的纯逻辑层（2026-09-24 二期）：弹簧积分 + 空闲行为调度。
 * 运行时（rAF / 计时器 / DOM 写入）在 useCatEngine；这里无副作用，便于单测。
 */

/* ── 弹簧（半隐式欧拉，临界附近阻尼）──
   分层跟随：瞳孔最快 → 头慢一拍 → 身体再慢，停下带轻微回弹。 */
export interface Spring {
  x: number;
  v: number;
}
export interface SpringCfg {
  k: number; // 刚度
  c: number; // 阻尼
}
export const SPRING_PUPIL: SpringCfg = { k: 320, c: 28 };
export const SPRING_HEAD: SpringCfg = { k: 110, c: 13 };
export const SPRING_BODY: SpringCfg = { k: 48, c: 9 };

export function springStep(s: Spring, target: number, cfg: SpringCfg, dt: number): Spring {
  // dt 上限：切后台回来 / 卡顿帧不让积分爆掉
  const h = Math.min(dt, 1 / 30);
  const a = cfg.k * (target - s.x) - cfg.c * s.v;
  const v = s.v + a * h;
  return { x: s.x + v * h, v };
}

export function springSettled(s: Spring, target: number, eps = 0.01): boolean {
  return Math.abs(s.x - target) < eps && Math.abs(s.v) < eps * 10;
}

/* ── 行为 ──
   瞬时行为（一次性动画，时长到即清）与持续行为（sleep 直到被唤醒）。 */
export type CatBehavior =
  | 'none'
  | 'ear-l'
  | 'ear-r'
  | 'tail-flick'
  | 'look-around'
  | 'yawn'
  | 'lick'
  | 'wink'
  | 'blep'
  | 'hunt'
  | 'sleep'
  | 'wake'
  | 'shy'
  | 'purr'
  | 'belly';

export const BEHAVIOR_MS: Record<Exclude<CatBehavior, 'none' | 'sleep'>, number> = {
  'ear-l': 420,
  'ear-r': 420,
  'tail-flick': 700,
  'look-around': 2200,
  yawn: 1500,
  lick: 1900,
  wink: 900,
  blep: 1800,
  hunt: 1600,
  wake: 1300,
  shy: 1800,
  purr: 1500,
  belly: 2600,
};

/** 需要前爪/身体的行为——手机探头猫（只有头+爪沿）不做 */
const NEEDS_BODY = new Set<CatBehavior>(['lick', 'tail-flick', 'belly']);

/* 古灵精怪：眨眼 / 吐舌头与日常小动作同池（2026-09-25 可爱化：斜眼坏笑改吐舌） */
const IDLE_TABLE: Array<[CatBehavior, number]> = [
  ['ear-l', 2.5],
  ['ear-r', 2.5],
  ['tail-flick', 2.5],
  ['look-around', 2],
  ['wink', 1.6],
  ['blep', 1.4],
  ['yawn', 1],
  ['lick', 1],
];

export function pickIdleBehavior(rand: () => number, withBody: boolean): CatBehavior {
  const table = IDLE_TABLE.filter(([b]) => withBody || !NEEDS_BODY.has(b));
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [b, w] of table) {
    r -= w;
    if (r < 0) return b;
  }
  return table[table.length - 1][0];
}

/** 下一次空闲小动作的间隔（ms） */
export function idleDelay(rand: () => number): number {
  return 3200 + rand() * 4800;
}

/** 静置多久进入打盹 */
export const SLEEP_AFTER_MS = 20000;
/** 摸猫连击窗口：窗口内第 1 下害羞捂脸、第 2 下呼噜、第 3 下起翻肚皮 */
export const PET_WINDOW_MS = 1600;

/** 连击计数：返回新的时间戳列表（仅保留窗口内） */
export function registerPet(clicks: number[], now: number): number[] {
  return [...clicks.filter((t) => now - t < PET_WINDOW_MS), now];
}

/** 容易害羞：先捂脸，熟了才呼噜，再熟翻肚皮 */
export function petBehavior(count: number): CatBehavior {
  if (count <= 1) return 'shy';
  if (count === 2) return 'purr';
  return 'belly';
}

/* 扑猎：空闲时指针快速晃过（逗猫棒）→ 瞳孔放大、压低身子扭屁股 */
export const HUNT_SPEED = 2.2; // px/ms
export const HUNT_COOLDOWN_MS = 9000;

/** 两次指针采样间的速度（px/ms）；dt 过小视为无效 */
export function pointerSpeed(
  a: { x: number; y: number; t: number },
  b: { x: number; y: number; t: number },
): number {
  const dt = b.t - a.t;
  if (dt < 4) return 0;
  return Math.hypot(b.x - a.x, b.y - a.y) / dt;
}

/** look-around 剧本：返回该时刻的瞳孔目标（-1..1 归一化 x） */
export function lookAroundAt(elapsed: number): number {
  if (elapsed < 650) return -1;
  if (elapsed < 1500) return 1;
  return 0;
}
