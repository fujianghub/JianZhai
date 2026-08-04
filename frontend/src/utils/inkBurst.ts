/**
 * 交互粒子 · 缃金墨点迸发（收藏星标）。
 *
 * 借鉴 HarmonyOS「灵动粒子 = 操作反馈」的思路，但按简斋的墨韵克制：
 *  - 只在「加入收藏」成功时迸发一次（取消收藏不庆祝）；
 *  - 缃金（--jz-gold）为主、accent 点缀，数量固定 10 枚、半径 ≤56px；
 *  - 纯 DOM + CSS keyframes 一次性动画，播完自删，不进 rAF 循环；
 *  - reduced-motion / 动效档位「适中/精简」下整体跳过（decorativeMotionEnabled）。
 *
 * 触发坐标取「最近一次 pointerdown」：收藏是点击驱动，API 返回时该坐标就是
 * 星标位置，免去把事件对象穿透组件树；键盘激活（无新近指针）静默不迸发。
 */
import { decorativeMotionEnabled } from '@/utils/motionPref';

export const BURST_PARTICLES = 10;
/** pointerdown 距今超过该时长视为过期（键盘操作等）——宁可不放，不放错位 */
export const POINTER_STALE_MS = 4000;

export interface BurstParticle {
  dx: number;
  dy: number;
  size: number;
  dur: number;
  delay: number;
  kind: 'gold' | 'accent';
}

/** 纯函数：N 枚粒子的初始参数（角度均匀 + 抖动；整体轻微上飘似墨点扬起） */
export function planBurst(count: number, rand: () => number = Math.random): BurstParticle[] {
  const out: BurstParticle[] = [];
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.9;
    const dist = 26 + rand() * 30;
    out.push({
      dx: Math.cos(ang) * dist,
      dy: Math.sin(ang) * dist - 6 - rand() * 8,
      size: 3 + rand() * 4,
      dur: 480 + rand() * 260,
      delay: rand() * 60,
      kind: i % 3 === 2 ? 'accent' : 'gold',
    });
  }
  return out;
}

let lastPointer: { x: number; y: number; t: number } | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => {
      lastPointer = { x: e.clientX, y: e.clientY, t: Date.now() };
    },
    { passive: true, capture: true },
  );
}

export function burstAt(x: number, y: number) {
  if (typeof document === 'undefined' || !decorativeMotionEnabled()) return;
  const host = document.createElement('div');
  host.className = 'jz-ink-burst';
  host.setAttribute('aria-hidden', 'true');
  host.style.left = `${x}px`;
  host.style.top = `${y}px`;
  let ttl = 0;
  for (const p of planBurst(BURST_PARTICLES)) {
    const s = document.createElement('span');
    s.className = p.kind === 'gold' ? 'jz-ink-burst-p is-gold' : 'jz-ink-burst-p';
    s.style.setProperty('--jz-burst-dx', `${p.dx.toFixed(1)}px`);
    s.style.setProperty('--jz-burst-dy', `${p.dy.toFixed(1)}px`);
    s.style.setProperty('--jz-burst-s', `${p.size.toFixed(1)}px`);
    s.style.setProperty('--jz-burst-dur', `${Math.round(p.dur)}ms`);
    s.style.setProperty('--jz-burst-delay', `${Math.round(p.delay)}ms`);
    host.appendChild(s);
    ttl = Math.max(ttl, p.dur + p.delay);
  }
  document.body.appendChild(host);
  window.setTimeout(() => host.remove(), Math.ceil(ttl) + 100);
}

/** 在最近一次指针按下处迸发；无新近指针（键盘操作）则静默跳过 */
export function burstAtPointer() {
  if (!lastPointer || Date.now() - lastPointer.t > POINTER_STALE_MS) return;
  burstAt(lastPointer.x, lastPointer.y);
}
