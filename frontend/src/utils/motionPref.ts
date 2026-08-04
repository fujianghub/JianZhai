/**
 * 动效偏好唯一裁决点。
 * 此前 prefersReducedMotion 在 stores/theme.ts / AmbientStage / ambientCanvas /
 * shaderCanvas / useRevealOnScroll 五处各写一份（函数体重复），收敛到这里。
 *
 * 同时承载用户「动效档位」：full 足量（默认）/ medium 适中 / min 精简。
 *  - min 在 JS 检查点上与系统 reduced-motion 等义（canvas 静帧、主题 VT 瞬切、
 *    滚动显现直接可见、光斑/粒子关闭）；CSS 侧由 [data-motion='min'] 伴生规则承接。
 *  - medium 只降装饰强度（ambient 质量封顶、指针光斑/交互粒子关闭），
 *    不动功能性动效（进场、面板、悬浮反馈）。
 * 档位落在根元素 data-motion 上（full 不落、保持零痕迹），localStorage 持久化。
 */
import { useSyncExternalStore } from 'react';

export type MotionLevel = 'full' | 'medium' | 'min';

const LEVEL_KEY = 'jianzhai:motionLevel';
const LEVELS: readonly MotionLevel[] = ['full', 'medium', 'min'] as const;

export function loadMotionLevel(): MotionLevel {
  if (typeof localStorage === 'undefined') return 'full';
  const v = localStorage.getItem(LEVEL_KEY) as MotionLevel | null;
  return v && LEVELS.includes(v) ? v : 'full';
}

export function saveMotionLevel(level: MotionLevel) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(LEVEL_KEY, level);
}

export function applyMotionLevel(level: MotionLevel) {
  if (typeof document === 'undefined') return;
  if (level === 'full') delete document.documentElement.dataset.motion;
  else document.documentElement.dataset.motion = level;
}

export function currentMotionLevel(): MotionLevel {
  if (typeof document === 'undefined') return 'full';
  const v = document.documentElement.dataset.motion as MotionLevel | undefined;
  return v && LEVELS.includes(v) ? v : 'full';
}

export function osPrefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** 大动效的统一开关：系统 reduce 或用户「精简」档都视为 reduce */
export function prefersReducedMotion(): boolean {
  return osPrefersReducedMotion() || currentMotionLevel() === 'min';
}

/** 纯装饰动效（指针光斑、交互粒子）：medium 档即关 */
export function decorativeMotionEnabled(): boolean {
  return !prefersReducedMotion() && currentMotionLevel() !== 'medium';
}

/* ── 档位变更订阅 ──
   多数消费点在「使用时」读 DOM（rAF 回调 / 一次性触发 / effect 初始化），
   档位切换天然即时生效；唯二需要 React 反应式的是 ThemeSwitcher（打勾）与
   AmbientStage（按档位重挂 canvas 场景）——走 useSyncExternalStore。 */
const listeners = new Set<() => void>();

/** 设置档位（持久化 + 落 DOM + 通知订阅者）——UI 入口统一走这里 */
export function setMotionLevel(level: MotionLevel) {
  saveMotionLevel(level);
  applyMotionLevel(level);
  listeners.forEach((l) => l());
}

function subscribeMotionLevel(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useMotionLevel(): MotionLevel {
  return useSyncExternalStore(subscribeMotionLevel, currentMotionLevel, () => 'full' as const);
}
