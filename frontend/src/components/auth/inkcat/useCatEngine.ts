import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { decorativeMotionEnabled, prefersReducedMotion, useMotionLevel } from '@/utils/motionPref';
import { burstAt } from '@/utils/inkBurst';
import { followGaze, gazeFor, PUPIL_MAX_X, type Gaze, type LoginMood } from '../loginMood';
import {
  BEHAVIOR_MS,
  BELLY_CLICKS,
  idleDelay,
  lookAroundAt,
  pickIdleBehavior,
  registerPet,
  SLEEP_AFTER_MS,
  SPRING_BODY,
  SPRING_HEAD,
  SPRING_PUPIL,
  springSettled,
  springStep,
  type CatBehavior,
  type Spring,
} from './catEngine';

export interface CatEngineOpts {
  mood: LoginMood;
  captchaProgress: number | null;
  typingProgress: number;
  /** 每次输入 +1；delete=true 表示这一下是删除 */
  keyPulse: { tick: number; del: boolean };
  /** 探头猫没有身体/尾巴，只做头部行为 */
  withBody: boolean;
  onBehavior?: (b: CatBehavior) => void;
}

type Channel = 'px' | 'py' | 'tilt' | 'hx' | 'lean';
const CHANNELS: Channel[] = ['px', 'py', 'tilt', 'hx', 'lean'];
const CFG = { px: SPRING_PUPIL, py: SPRING_PUPIL, tilt: SPRING_HEAD, hx: SPRING_HEAD, lean: SPRING_BODY };

/**
 * 水墨猫运行时：
 * - 目光：五路弹簧（瞳孔 px/py 快、头 tilt/hx 中、身体 lean 慢）→ 根节点 CSS 变量；
 *   按需起停 rAF（全部收敛即停），切后台浏览器自动暂停；
 * - 行为：`data-behavior` 驱动 CSS 关键帧；空闲调度 / 打盹 / 唤醒 / 摸猫 / 按键脉冲；
 * - reduce（系统或「精简」档）：不起弹簧与调度，目光瞬时写入，姿态由 CSS 瞬切；
 *   「适中」档：保留目光与姿态，关掉空闲小动作（纯装饰）。
 */
export function useCatEngine(
  rootRef: RefObject<SVGSVGElement | null>,
  anchorRef: RefObject<SVGElement | null>,
  opts: CatEngineOpts,
) {
  const motionLevel = useMotionLevel();
  const o = useRef(opts);
  o.current = opts;

  const springs = useRef<Record<Channel, Spring>>({
    px: { x: 0, v: 0 },
    py: { x: 0, v: 0 },
    tilt: { x: 0, v: 0 },
    hx: { x: 0, v: 0 },
    lean: { x: 0, v: 0 },
  });
  const raf = useRef(0);
  const lastT = useRef(0);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const rect = useRef<DOMRect | null>(null);
  const hovering = useRef(false);
  const behavior = useRef<CatBehavior>('none');
  const behaviorAt = useRef(0);
  const behaviorTimer = useRef(0);
  const lastActivity = useRef(Date.now());
  const pets = useRef<number[]>([]);

  const write = useCallback((vals: Record<Channel, number>) => {
    const root = rootRef.current;
    if (!root) return;
    root.style.setProperty('--jz-cat-px', vals.px.toFixed(2));
    root.style.setProperty('--jz-cat-py', vals.py.toFixed(2));
    root.style.setProperty('--jz-cat-tilt', `${vals.tilt.toFixed(2)}deg`);
    root.style.setProperty('--jz-cat-hx', vals.hx.toFixed(2));
    root.style.setProperty('--jz-cat-lean', `${vals.lean.toFixed(2)}deg`);
  }, [rootRef]);

  /** 当前时刻的目光目标 */
  const target = useCallback((now: number): Record<Channel, number> => {
    const { mood, captchaProgress, typingProgress } = o.current;
    let g: Gaze | null = null;
    const b = behavior.current;
    if (mood === 'idle' && b === 'look-around') {
      const n = lookAroundAt(now - behaviorAt.current);
      g = { px: n * PUPIL_MAX_X, py: 0.5, tilt: n * 4 };
    } else if (mood === 'idle' && (b === 'sleep' || b === 'yawn')) {
      g = { px: 0, py: 1.5, tilt: b === 'sleep' ? -5 : 0 };
    } else {
      g = gazeFor(mood, captchaProgress, typingProgress);
    }
    if (!g) {
      // idle 跟随指针；悬停时歪头更多（「蹭」）
      const p = pointer.current;
      const a = anchorRef.current;
      // reduce：不跟随指针（目光居中），只保留心境姿态
      if (p && a && !prefersReducedMotion()) {
        rect.current ??= a.getBoundingClientRect();
        const r = rect.current;
        g = followGaze(p.x - (r.left + r.width / 2), p.y - (r.top + r.height / 2));
        if (hovering.current) g = { ...g, tilt: g.tilt * 1.8 };
      } else {
        g = { px: 0, py: 0, tilt: 0 };
      }
    }
    return { px: g.px, py: g.py, tilt: g.tilt, hx: g.px * 1.1, lean: g.tilt * 0.35 };
  }, [anchorRef]);

  const frame = useCallback((t: number) => {
    const dt = lastT.current ? (t - lastT.current) / 1000 : 1 / 60;
    lastT.current = t;
    const tg = target(Date.now());
    let settled = true;
    const out = {} as Record<Channel, number>;
    for (const ch of CHANNELS) {
      const s = springStep(springs.current[ch], tg[ch], CFG[ch], dt);
      springs.current[ch] = s;
      out[ch] = s.x;
      if (!springSettled(s, tg[ch])) settled = false;
    }
    write(out);
    if (settled && behavior.current !== 'look-around') {
      raf.current = 0;
      lastT.current = 0;
      return;
    }
    raf.current = requestAnimationFrame(frame);
  }, [target, write]);

  const kick = useCallback(() => {
    if (prefersReducedMotion()) {
      write(target(Date.now()));
      return;
    }
    if (!raf.current) raf.current = requestAnimationFrame(frame);
  }, [frame, target, write]);

  const setBehavior = useCallback((b: CatBehavior) => {
    const root = rootRef.current;
    window.clearTimeout(behaviorTimer.current);
    behavior.current = b;
    behaviorAt.current = Date.now();
    if (root) root.dataset.behavior = b;
    o.current.onBehavior?.(b);
    if (b !== 'none' && b !== 'sleep') {
      behaviorTimer.current = window.setTimeout(() => setBehavior('none'), BEHAVIOR_MS[b]);
    }
    kick();
  }, [kick, rootRef]);

  /** 任何用户动作：记活跃；睡着则唤醒 */
  const activity = useCallback(() => {
    lastActivity.current = Date.now();
    if (behavior.current === 'sleep') setBehavior('wake');
  }, [setBehavior]);

  // 指针 / 键盘 / 可见性
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      activity();
      if (o.current.mood === 'idle') kick();
    };
    const onKey = () => activity();
    const invalidate = () => {
      rect.current = null;
    };
    const onVis = () => {
      if (document.hidden && o.current.mood === 'idle' && decorativeMotionEnabled()) setBehavior('sleep');
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    // 活跃检测用 input/focusin（打字必触发 input）；不裸绑 keydown（bareKeydownDiscipline）
    window.addEventListener('input', onKey, true);
    window.addEventListener('focusin', onKey);
    window.addEventListener('resize', invalidate);
    window.addEventListener('scroll', invalidate, true);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
      window.removeEventListener('input', onKey, true);
      window.removeEventListener('focusin', onKey);
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('scroll', invalidate, true);
      document.removeEventListener('visibilitychange', onVis);
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
      window.clearTimeout(behaviorTimer.current);
    };
  }, [activity, kick, setBehavior]);

  // 心境 / 进度变化：离开 idle 即清掉空闲行为，重新瞄准
  useEffect(() => {
    if (opts.mood !== 'idle' && behavior.current !== 'none') setBehavior('none');
    if (opts.mood !== 'idle') lastActivity.current = Date.now();
    kick();
  }, [opts.mood, opts.captchaProgress, opts.typingProgress, motionLevel, kick, setBehavior]);

  // 按键脉冲：歪头冲量 + 耳朵一抖（删除时反向歪得更多）
  useEffect(() => {
    if (!opts.keyPulse.tick || prefersReducedMotion()) return;
    const s = springs.current.tilt;
    springs.current.tilt = { ...s, v: s.v + (opts.keyPulse.del ? -70 : (Math.random() < 0.5 ? -1 : 1) * 28) };
    const root = rootRef.current;
    if (root) {
      root.dataset.flick = root.dataset.flick === 'l' ? 'r' : 'l';
      root.classList.remove('is-flick');
      // 强制重排以重播关键帧
      void root.getBoundingClientRect();
      root.classList.add('is-flick');
    }
    kick();
  }, [opts.keyPulse, kick, rootRef]);

  // 空闲调度：只在 idle + 装饰动效开启时跑
  useEffect(() => {
    if (!decorativeMotionEnabled()) return;
    let t = 0;
    const loop = () => {
      t = window.setTimeout(() => {
        if (o.current.mood === 'idle' && behavior.current === 'none') {
          if (Date.now() - lastActivity.current >= SLEEP_AFTER_MS) setBehavior('sleep');
          else setBehavior(pickIdleBehavior(Math.random, o.current.withBody));
        }
        loop();
      }, Math.min(idleDelay(Math.random), Math.max(400, SLEEP_AFTER_MS - (Date.now() - lastActivity.current))));
    };
    loop();
    return () => window.clearTimeout(t);
  }, [motionLevel, setBehavior]);

  // 眨眼：睡着/眯眼时不眨
  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;
    let t = 0;
    let off = 0;
    const schedule = () => {
      t = window.setTimeout(() => {
        if (behavior.current !== 'sleep') {
          root.classList.add('is-blink');
          off = window.setTimeout(() => root.classList.remove('is-blink'), 130);
        }
        schedule();
      }, 2600 + Math.random() * 3600);
    };
    schedule();
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(off);
      root.classList.remove('is-blink');
    };
  }, [motionLevel, rootRef]);

  // 摸猫
  const onPointerEnter = useCallback(() => {
    hovering.current = true;
    rootRef.current?.classList.add('is-hover');
    kick();
  }, [kick, rootRef]);
  const onPointerLeave = useCallback(() => {
    hovering.current = false;
    rootRef.current?.classList.remove('is-hover');
    kick();
  }, [kick, rootRef]);
  const onPet = useCallback((e: React.PointerEvent) => {
    if (behavior.current === 'sleep') {
      setBehavior('wake');
      return;
    }
    const now = Date.now();
    pets.current = registerPet(pets.current, now);
    if (pets.current.length >= BELLY_CLICKS) {
      pets.current = [];
      setBehavior('belly');
    } else {
      setBehavior('purr');
    }
    burstAt(e.clientX, e.clientY);
  }, [setBehavior]);

  return { onPointerEnter, onPointerLeave, onPet };
}
