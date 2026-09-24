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
  | 'sleep'
  | 'wake'
  | 'purr'
  | 'belly';

export const BEHAVIOR_MS: Record<Exclude<CatBehavior, 'none' | 'sleep'>, number> = {
  'ear-l': 420,
  'ear-r': 420,
  'tail-flick': 700,
  'look-around': 2200,
  yawn: 1500,
  lick: 1900,
  wake: 1300,
  purr: 1500,
  belly: 2600,
};

/** 需要前爪/身体的行为——手机探头猫（只有头+爪沿）不做 */
const NEEDS_BODY = new Set<CatBehavior>(['lick', 'tail-flick', 'belly']);

const IDLE_TABLE: Array<[CatBehavior, number]> = [
  ['ear-l', 3],
  ['ear-r', 3],
  ['tail-flick', 3],
  ['look-around', 2],
  ['yawn', 1],
  ['lick', 1.2],
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
/** 连续摸几下翻肚皮、窗口多长 */
export const BELLY_CLICKS = 3;
export const BELLY_WINDOW_MS = 1600;

/** 连击计数：返回新的时间戳列表（仅保留窗口内） */
export function registerPet(clicks: number[], now: number): number[] {
  return [...clicks.filter((t) => now - t < BELLY_WINDOW_MS), now];
}

/** look-around 剧本：返回该时刻的瞳孔目标（-1..1 归一化 x） */
export function lookAroundAt(elapsed: number): number {
  if (elapsed < 650) return -1;
  if (elapsed < 1500) return 1;
  return 0;
}
