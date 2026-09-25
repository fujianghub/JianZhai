import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { decorativeMotionEnabled, prefersReducedMotion, useMotionLevel } from '@/utils/motionPref';
import { burstAt } from '@/utils/inkBurst';
import { followGaze, gazeFor, PUPIL_MAX_X, type Gaze, type LoginMood } from '../loginMood';
import {
  BEHAVIOR_MS,
  HUNT_COOLDOWN_MS,
  HUNT_SPEED,
  idleDelay,
  lookAroundAt,
  petBehavior,
  pickIdleBehavior,
  pointerSpeed,
  registerPet,
  SLEEP_AFTER_MS,
  SPRING_BODY,
  SPRING_HEAD,
  SPRING_PUPIL,
  springSettled,
  springStep,
  type CatBehavior,
  type Spring,
  type SpringCfg,
} from './catEngine';
import {
  blinkCurve,
  earGeometry,
  earTransform,
  noise1,
  poseFor,
  tailPath,
  type BlinkKind,
  type CatPose,
} from './catRig';

export interface CatEngineOpts {
  mood: LoginMood;
  captchaProgress: number | null;
  typingProgress: number;
  /** 每次输入 +1；delete=true 表示这一下是删除 */
  keyPulse: { tick: number; del: boolean };
  /** 探头猫没有身体/尾巴，只做头部行为 */
  withBody: boolean;
  onBehavior?: (b: CatBehavior) => void;
  /** 指针进出猫身（害羞题注用） */
  onHover?: (hovering: boolean) => void;
}

/* ── 通道：目光 5 路 + 耳 8 路 + 眉 4 路 + 尾 5 路 ──
   刚度/阻尼各不相同：耳朵灵且回弹多（软）、眉次之、尾巴最慢最松——节奏天然错开。 */
type Ch =
  | 'px' | 'py' | 'tilt' | 'hx' | 'hy' | 'lean'
  | 'eLs' | 'eLl' | 'eLf' | 'eLt' | 'eRs' | 'eRl' | 'eRf' | 'eRt'
  | 'bLr' | 'bLy' | 'bRr' | 'bRy'
  | 'tb' | 'tc' | 'ta' | 'tp' | 'tl'
  | 'bell';
const EAR_SWIVEL: SpringCfg = { k: 260, c: 12 };
const EAR_SHAPE: SpringCfg = { k: 170, c: 14 };
const BROW: SpringCfg = { k: 220, c: 20 };
const TAIL: SpringCfg = { k: 36, c: 9 };
/** 铃铛：低阻尼，晃起来要摆几下才停 */
const BELL: SpringCfg = { k: 55, c: 3.2 };
const CFG: Record<Ch, SpringCfg> = {
  px: SPRING_PUPIL, py: SPRING_PUPIL, tilt: SPRING_HEAD, hx: SPRING_HEAD, hy: SPRING_HEAD, lean: SPRING_BODY,
  eLs: EAR_SWIVEL, eLl: EAR_SHAPE, eLf: EAR_SHAPE, eLt: EAR_SHAPE,
  eRs: EAR_SWIVEL, eRl: EAR_SHAPE, eRf: EAR_SHAPE, eRt: EAR_SHAPE,
  bLr: BROW, bLy: BROW, bRr: BROW, bRy: BROW,
  tb: TAIL, tc: TAIL, ta: TAIL, tp: TAIL, tl: TAIL,
  bell: BELL,
};
const CHANNELS = Object.keys(CFG) as Ch[];

/** 姿态切换错峰（ms）：耳先动 → 右耳慢半拍 → 眉 → 尾最后（前爪在 CSS 里另有 110/170ms 延迟） */
const STAGGER = { earL: 0, earR: 40, brow: 60, tail: 200 } as const;

const IDLE_FRAME_MS = 32; // 只剩「活气」时降到 ~30fps
const BROW_C = { l: [112, 128], r: [188, 128] } as const;
const BELL_PIVOT = '150 234';

interface Dom {
  ears: Record<'l' | 'r', { g: SVGGElement; outer: SVGPathElement; inner: SVGPathElement } | null>;
  brows: Record<'l' | 'r', SVGElement | null>;
  tailRim: SVGPathElement | null;
  tailStroke: SVGPathElement | null;
  head: SVGElement | null;
  pupils: SVGElement[];
  lids: SVGElement[];
  movers: SVGElement[];
  body: SVGElement | null;
  bell: SVGElement | null;
}

/**
 * 水墨猫运行时（2026-09-25 四期：去僵）：
 * - 目光：瞳孔/头/身分层弹簧；
 * - 软体：耳朵（转向/立起/压平/耳尖弯折）与尾巴（8 节传播波）每帧重生成路径，情绪目标来自 catRig.poseFor，
 *   各部件错峰到位；头部角加速度作为冲量传给耳朵（跟随甩动）；
 * - 活气层（仅「足量」动效档）：平滑噪声微动、跳视、可变呼吸、闭快睁慢的眨眼、被盯久了慢眨眼、
 *   靠指针一侧的耳朵转过去听、兴奋细颤；只剩活气时降到 ~30fps，切后台浏览器自动暂停；
 * - 行为：`data-behavior` 驱动 CSS（嘴/漫符/爪/头部关键帧）；空闲调度 / 打盹 / 摸猫三段式 / 扑猎 / 按键脉冲；
 * - reduce（系统或「精简」档）：不起循环，直接写目标姿态；「适中」档：有弹簧过渡，无活气层。
 */
export function useCatEngine(
  rootRef: RefObject<SVGSVGElement | null>,
  anchorRef: RefObject<SVGElement | null>,
  opts: CatEngineOpts,
) {
  const motionLevel = useMotionLevel();
  const o = useRef(opts);
  o.current = opts;

  const springs = useRef<Record<Ch, Spring>>(
    Object.fromEntries(CHANNELS.map((c) => [c, { x: 0, v: 0 }])) as Record<Ch, Spring>,
  );
  const pose = useRef<{ prev: CatPose; cur: CatPose; at: number }>({
    prev: poseFor('idle', 'none', false),
    cur: poseFor('idle', 'none', false),
    at: 0,
  });
  const dom = useRef<Dom | null>(null);
  const raf = useRef(0);
  const lastT = useRef(0);
  const lastDraw = useRef(0);
  const phases = useRef({ tail: 0, lash: 0, breath: 0 });
  const cache = useRef<Record<string, string>>({});

  const pointer = useRef<{ x: number; y: number } | null>(null);
  const sample = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastMove = useRef(0);
  const lastHunt = useRef(0);
  const rect = useRef<DOMRect | null>(null);
  const hovering = useRef(false);
  const hoverSince = useRef(0);
  const slowBlinked = useRef(false);
  const behavior = useRef<CatBehavior>('none');
  const behaviorAt = useRef(0);
  const behaviorTimer = useRef(0);
  const lastActivity = useRef(Date.now());
  const pets = useRef<number[]>([]);
  const blink = useRef<{ kind: BlinkKind; at: number } | null>(null);
  const saccade = useRef({ x: 0, y: 0, next: 0 });
  const tailFlickUntil = useRef(0);
  const prevTiltV = useRef(0);
  const lastPulse = useRef(0);
  const timers = useRef<number[]>([]);

  // 初始化：弹簧落在初始姿态（不从 0 弹出来）
  const seeded = useRef(false);
  if (!seeded.current) {
    seeded.current = true;
    seedSprings(springs.current, pose.current.cur);
  }

  const getDom = useCallback((): Dom | null => {
    const root = rootRef.current;
    if (!root) return null;
    if (dom.current) return dom.current;
    const ear = (s: 'l' | 'r') => {
      const g = root.querySelector<SVGGElement>(`.jz-cat-ear--${s}`);
      const outer = root.querySelector<SVGPathElement>(`.jz-cat-ear--${s} .jz-cat-ear-out`);
      const inner = root.querySelector<SVGPathElement>(`.jz-cat-ear--${s} .jz-cat-ear-in`);
      return g && outer && inner ? { g, outer, inner } : null;
    };
    dom.current = {
      ears: { l: ear('l'), r: ear('r') },
      brows: {
        l: root.querySelector('.jz-cat-brow--l'),
        r: root.querySelector('.jz-cat-brow--r'),
      },
      tailRim: root.querySelector('.jz-cat-tail-rim'),
      tailStroke: root.querySelector('.jz-cat-tail-stroke'),
      head: root.querySelector('.jz-cat-head'),
      pupils: [...root.querySelectorAll<SVGElement>('.jz-cat-pupil')],
      lids: [...root.querySelectorAll<SVGElement>('.jz-cat-lid')],
      movers: [...root.querySelectorAll<SVGElement>('.jz-cat-mover')],
      body: root.querySelector('.jz-cat-body'),
      bell: root.querySelector('.jz-cat-bell'),
    };
    return dom.current;
  }, [rootRef]);

  /** 「活气层」开关：足量档 + 未 reduce */
  const alive = () => !prefersReducedMotion() && decorativeMotionEnabled();

  const setAttr = (el: Element | null | undefined, key: string, name: string, val: string) => {
    if (!el || cache.current[key] === val) return;
    cache.current[key] = val;
    el.setAttribute(name, val);
  };

  /** 当前时刻的全部通道目标（含错峰、活气层） */
  const targets = useCallback((now: number): Record<Ch, number> => {
    const { mood, captchaProgress, typingProgress } = o.current;
    const b = behavior.current;
    const live = alive();
    const t = now / 1000;

    // 目光
    let g: Gaze | null = null;
    if (mood === 'idle' && b === 'look-around') {
      const n = lookAroundAt(now - behaviorAt.current);
      g = { px: n * PUPIL_MAX_X, py: 0.5, tilt: n * 4 };
    } else if (mood === 'idle' && (b === 'sleep' || b === 'yawn')) {
      g = { px: 0, py: 1.5, tilt: b === 'sleep' ? -5 : 0 };
    } else if (mood === 'idle' && b === 'blep') {
      g = { px: 0, py: 0.5, tilt: 6 }; // 歪头吐舌，正对着你
    } else if (mood === 'idle' && b === 'shy') {
      g = { px: 0, py: 2, tilt: -4 };
    } else {
      g = gazeFor(mood, captchaProgress, typingProgress);
    }
    let dxPointer = 0;
    if (!g) {
      const p = pointer.current;
      const a = anchorRef.current;
      if (p && a && !prefersReducedMotion()) {
        rect.current ??= a.getBoundingClientRect();
        const r = rect.current;
        dxPointer = p.x - (r.left + r.width / 2);
        g = followGaze(dxPointer, p.y - (r.top + r.height / 2));
        // 被盯着就害羞：别过头、目光往下往外躲（呼噜/翻肚时已熟络，不躲）
        if (hovering.current && b !== 'purr' && b !== 'belly') {
          const away = dxPointer >= 0 ? -1 : 1;
          g = { px: away * PUPIL_MAX_X * 0.9, py: 2.2, tilt: away * 5 };
        }
      } else {
        g = { px: 0, py: 0, tilt: 0 };
      }
    }
    let { px, py, tilt } = g;
    let hx = g.px * 1.1;
    let hy = 0;
    let lean: number | null = null;
    if (mood === 'scout') {
      // 歪头偷看这是谁：头大幅歪向表单、轻轻探身、眼睛往侧面瞟，字越多歪得越狠；
      // 探头猫（表单在下方）改为歪头往下瞄
      const tp = Math.max(0, Math.min(1, typingProgress));
      if (o.current.withBody) {
        tilt = 12 + 4 * tp;
        px = PUPIL_MAX_X;
        py = 0.5;
        hx = 6 + 5 * tp;
        hy = -2;
        lean = 3 + 3 * tp;
      } else {
        px = 0.8;
        py = 3.5;
        tilt = 6;
        hx = 0;
        hy = 6;
        lean = 0;
      }
    }
    if (live) {
      // 头部极慢漂移 + 静止时的跳视
      tilt += 1.3 * noise1(21, t * 0.22);
      hx += 0.9 * noise1(22, t * 0.18);
      const still = mood === 'idle' && !hovering.current && b === 'none' && now - lastMove.current > 900;
      if (still) {
        if (now > saccade.current.next) {
          saccade.current = {
            x: (Math.random() * 2 - 1) * 1.4,
            y: (Math.random() * 2 - 1) * 0.9,
            next: now + 600 + Math.random() * 1900,
          };
        }
        px += saccade.current.x;
        py += saccade.current.y;
      }
    }

    // 软体姿态（错峰）
    const since = now - pose.current.at;
    const pick = (delay: number) => (since >= delay ? pose.current.cur : pose.current.prev);
    const pl = pick(STAGGER.earL);
    const pr = pick(STAGGER.earR);
    const pb = pick(STAGGER.brow);
    const pt = pick(STAGGER.tail);
    let eLs = pl.earL.swivel;
    let eRs = pr.earR.swivel;
    let eLl = pl.earL.lift;
    let eRl = pr.earR.lift;
    let lash = pt.tail.lash;
    if (live) {
      const breath = Math.sin(phases.current.breath);
      eLs += 3 * noise1(11, t * 0.45);
      eRs += 3 * noise1(12, t * 0.45);
      eLl += 0.02 * breath;
      eRl += 0.02 * breath;
      // 听：靠指针那一侧的耳朵转过去
      if (mood === 'idle' && !hovering.current && pointer.current && Math.abs(dxPointer) > 60) {
        if (dxPointer < 0) eLs -= 6;
        else eRs -= 6;
      }
      // 兴奋细颤
      const ex = pl.excite;
      if (ex > 0) {
        const tr = ex * 1.8 * Math.sin(t * Math.PI * 2 * 16);
        eLs += tr;
        eRs -= tr;
      }
      if (now < tailFlickUntil.current) lash += 16;
    }
    return {
      px, py, tilt, hx, hy, lean: lean ?? tilt * 0.35,
      eLs, eLl, eLf: pl.earL.flat, eLt: pl.earL.tip,
      eRs, eRl, eRf: pr.earR.flat, eRt: pr.earR.tip,
      bLr: pb.browL.rot, bLy: pb.browL.dy, bRr: pb.browR.rot, bRy: pb.browR.dy,
      tb: pt.tail.base, tc: pt.tail.curl, ta: pt.tail.amp, tp: pt.tail.puff, tl: lash,
      // 铃铛垂向重力：身子一倾，铃铛反向偏
      bell: -(lean ?? tilt * 0.35) * 2.2,
    };
  }, [anchorRef]);

  /** 把通道值写进 DOM */
  const write = useCallback((v: Record<Ch, number>, now: number) => {
    const root = rootRef.current;
    const d = getDom();
    if (!root || !d) return;
    const live = alive();
    // 变换直接写到使用它的元素上（勿写根节点 CSS 变量：会让整只猫的子树每帧重算样式）
    const setStyle = (els: (SVGElement | null)[], key: string, prop: string, val: string) => {
      if (cache.current[key] === val) return;
      cache.current[key] = val;
      for (const el of els) el?.style.setProperty(prop, val);
    };
    setStyle(d.pupils, 'pupil', 'transform', `translate(${v.px.toFixed(2)}px, ${v.py.toFixed(2)}px)`);
    setStyle(
      [d.head],
      'head',
      'transform',
      `translate(${v.hx.toFixed(2)}px, ${v.hy.toFixed(2)}px) rotate(${v.tilt.toFixed(2)}deg)`,
    );
    setStyle(d.movers, 'lean', 'transform', `rotate(${v.lean.toFixed(2)}deg)`);
    // 眨眼（与 CSS 心境眼睑取 max）
    let bl = 0;
    if (blink.current) {
      const c = blinkCurve(blink.current.kind, now - blink.current.at);
      if (c === null) blink.current = null;
      else bl = c;
    }
    setStyle(d.lids, 'blink', '--jz-cat-blink', bl.toFixed(3));
    // 呼吸（足量档可见起伏，打盹更深）
    const depth = behavior.current === 'sleep' ? 0.032 : 0.018;
    const breathS = live ? 1 + depth * (0.5 + 0.5 * Math.sin(phases.current.breath)) : 1;
    setStyle([d.body], 'breath', 'transform', `scale(1, ${breathS.toFixed(4)})`);

    for (const s of ['l', 'r'] as const) {
      const e = d.ears[s];
      if (!e) continue;
      const sw = s === 'l' ? v.eLs : v.eRs;
      // 形状参数量化（lift/flat 0.01、tip 0.5°）：呼吸级微小变化不重算路径，省重绘
      const q = (x: number, step: number) => Math.round(x / step) * step;
      const geo = earGeometry(
        s === 'l'
          ? { swivel: 0, lift: q(v.eLl, 0.01), flat: q(v.eLf, 0.01), tip: q(v.eLt, 0.5) }
          : { swivel: 0, lift: q(v.eRl, 0.01), flat: q(v.eRf, 0.01), tip: q(v.eRt, 0.5) },
        s === 'r',
      );
      setAttr(e.g, `eg${s}`, 'transform', earTransform(s, sw));
      setAttr(e.outer, `eo${s}`, 'd', geo.outer);
      setAttr(e.inner, `ei${s}`, 'd', geo.inner);
      setAttr(e.inner, `eio${s}`, 'opacity', String(geo.innerOpacity));
    }
    for (const s of ['l', 'r'] as const) {
      const [cx, cy] = BROW_C[s];
      const rot = s === 'l' ? v.bLr : v.bRr;
      const dy = s === 'l' ? v.bLy : v.bRy;
      setAttr(d.brows[s], `b${s}`, 'transform', `translate(0 ${dy.toFixed(2)}) rotate(${rot.toFixed(2)} ${cx} ${cy})`);
    }
    setAttr(d.bell, 'bell', 'transform', `rotate(${v.bell.toFixed(2)} ${BELL_PIVOT})`);
    if (d.tailStroke) {
      const path = tailPath(
        { base: v.tb, curl: v.tc, amp: v.ta, hz: 0, puff: v.tp, lash: v.tl, lashHz: 0 },
        phases.current.tail,
        phases.current.lash,
      );
      setAttr(d.tailStroke, 'td', 'd', path);
      setAttr(d.tailRim, 'trd', 'd', path);
      setAttr(d.tailStroke, 'tw', 'stroke-width', v.tp.toFixed(1));
      setAttr(d.tailRim, 'trw', 'stroke-width', (v.tp + 4).toFixed(1));
    }
  }, [getDom, rootRef]);

  const frame = useCallback((t: number) => {
    raf.current = 0;
    const now = Date.now();
    const live = alive();
    const st = springs.current;
    // 全速（60fps）只在真有事时：刚动过指针 / 姿态刚切换 / 眨眼中 / 刚按键 / 张望剧本。
    // 活气噪声让目标每帧都在变，不能用「弹簧未收敛」判忙，否则永远跑满帧。
    const busy =
      !!blink.current ||
      now - lastMove.current < 400 ||
      now - pose.current.at < 1200 ||
      now - lastPulse.current < 700 ||
      behavior.current === 'look-around' ||
      (!live && !CHANNELS.every((c) => springSettled(st[c], targets(now)[c], 0.02)));
    if (live && !busy && lastDraw.current && t - lastDraw.current < IDLE_FRAME_MS) {
      raf.current = requestAnimationFrame(frame);
      return;
    }
    const dt = lastDraw.current ? Math.min((t - lastDraw.current) / 1000, 1 / 20) : 1 / 60;
    lastDraw.current = t;
    lastT.current = t;

    // 相位积分（换频不跳变）
    const tailPose = (now - pose.current.at >= STAGGER.tail ? pose.current.cur : pose.current.prev).tail;
    if (live) {
      const flick = now < tailFlickUntil.current;
      phases.current.tail += Math.PI * 2 * tailPose.hz * dt;
      phases.current.lash += Math.PI * 2 * (flick ? 3.2 : tailPose.lashHz) * dt;
      const period = 3.6 + 0.9 * noise1(31, now / 10000);
      phases.current.breath += (Math.PI * 2 * dt) / period;
    }

    const tg = targets(now);
    for (const c of CHANNELS) st[c] = springStep(st[c], tg[c], CFG[c], dt);
    // 跟随：头的角加速度传给耳朵（头转，耳朵晚一拍甩）
    const dv = st.tilt.v - prevTiltV.current;
    prevTiltV.current = st.tilt.v;
    st.eLs = { ...st.eLs, v: st.eLs.v + dv * 0.5 };
    st.eRs = { ...st.eRs, v: st.eRs.v - dv * 0.5 };
    st.bell = { ...st.bell, v: st.bell.v - dv * 0.9 }; // 铃铛同样被头/身的转动甩起来

    write(Object.fromEntries(CHANNELS.map((c) => [c, st[c].x])) as Record<Ch, number>, now);

    const settled = CHANNELS.every((c) => springSettled(st[c], tg[c], 0.02));
    if (live || !settled || blink.current) raf.current = requestAnimationFrame(frame);
    else lastDraw.current = 0;
  }, [targets, write]);

  const kick = useCallback(() => {
    if (prefersReducedMotion()) {
      // reduce：不起循环，直接落到目标姿态
      const now = Date.now();
      pose.current.prev = pose.current.cur;
      const tg = targets(now);
      seedSprings(springs.current, pose.current.cur);
      write(tg, now);
      return;
    }
    if (!raf.current) raf.current = requestAnimationFrame(frame);
  }, [frame, targets, write]);

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  const impulse = (ch: Ch, dv: number) => {
    const s = springs.current[ch];
    springs.current[ch] = { ...s, v: s.v + dv };
  };

  /** 心境/行为/悬停变了：重算姿态目标（错峰从此刻起算），并按情绪补冲量 */
  const repose = useCallback(() => {
    const next = poseFor(o.current.mood, behavior.current, hovering.current);
    pose.current = { prev: pose.current.cur, cur: next, at: Date.now() };
    kick();
  }, [kick]);

  const setBehavior = useCallback((b: CatBehavior) => {
    const root = rootRef.current;
    window.clearTimeout(behaviorTimer.current);
    const prev = behavior.current;
    behavior.current = b;
    behaviorAt.current = Date.now();
    if (root) root.dataset.behavior = b;
    o.current.onBehavior?.(b);
    if (b !== 'none' && b !== 'sleep') {
      behaviorTimer.current = window.setTimeout(() => setBehavior('none'), BEHAVIOR_MS[b]);
    }
    // 抖耳：随机 1–3 下、随机幅度（不再是固定关键帧）
    if ((b === 'ear-l' || b === 'ear-r') && !prefersReducedMotion()) {
      const ch: Ch = b === 'ear-l' ? 'eLs' : 'eRs';
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        later(i * (110 + Math.random() * 60), () => impulse(ch, (i % 2 ? -1 : 1) * (200 + Math.random() * 160)));
      }
    }
    if (b === 'tail-flick') tailFlickUntil.current = Date.now() + 700;
    if (b === 'hunt') {
      impulse('eLl', 1.2);
      impulse('eRl', 1.2);
    }
    if (prev !== b) repose();
  }, [repose, rootRef]);

  /** 任何用户动作：记活跃；睡着则唤醒 */
  const activity = useCallback(() => {
    lastActivity.current = Date.now();
    if (behavior.current === 'sleep') setBehavior('wake');
  }, [setBehavior]);

  // 指针 / 输入 / 可见性
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      const now = performance.now();
      lastMove.current = Date.now();
      const cur = { x: e.clientX, y: e.clientY, t: now };
      // 逗猫棒：空闲时指针快晃 → 扑猎（冷却期内不重复）
      if (
        e.type === 'pointermove' &&
        sample.current &&
        o.current.mood === 'idle' &&
        behavior.current === 'none' &&
        !hovering.current &&
        now - lastHunt.current > HUNT_COOLDOWN_MS &&
        pointerSpeed(sample.current, cur) > HUNT_SPEED &&
        decorativeMotionEnabled()
      ) {
        lastHunt.current = now;
        setBehavior('hunt');
      }
      sample.current = cur;
      activity();
      kick();
    };
    const onKey = () => activity();
    const invalidate = () => {
      rect.current = null;
    };
    const onVis = () => {
      if (document.hidden && o.current.mood === 'idle' && decorativeMotionEnabled()) setBehavior('sleep');
      if (!document.hidden) kick();
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
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
    };
  }, [activity, kick, setBehavior]);

  // 心境 / 进度变化：离开 idle 即清掉空闲行为；按情绪补一点「连带」冲量
  const prevMood = useRef(opts.mood);
  useEffect(() => {
    const from = prevMood.current;
    prevMood.current = opts.mood;
    if (opts.mood !== 'idle' && behavior.current !== 'none') setBehavior('none');
    if (opts.mood !== 'idle') lastActivity.current = Date.now();
    if (from !== opts.mood && !prefersReducedMotion()) {
      if (opts.mood === 'success') {
        // 起跳前压、落地再压：耳朵被惯性按下又弹起
        later(40, () => { impulse('eLl', -2.2); impulse('eRl', -2.2); });
        later(330, () => { impulse('eLl', -1.6); impulse('eRl', -1.6); impulse('eLs', 90); impulse('eRs', -90); impulse('bell', 260); });
      } else if (opts.mood === 'error') {
        // 摇头（CSS 120–920ms）带着耳朵甩，幅度衰减
        [150, 260, 370, 480, 590].forEach((ms, i) =>
          later(ms, () => {
            const a = (i % 2 ? -1 : 1) * 150 * (1 - i * 0.18);
            impulse('eLs', a);
            impulse('eRs', -a);
            impulse('bell', -a * 0.9);
          }),
        );
      } else if ((opts.mood === 'typing' || opts.mood === 'scout') && from === 'idle') {
        impulse('eLl', 1.4);
        impulse('eRl', 1.4); // 「嗯？」耳朵一竖
      }
    }
    repose();
  }, [opts.mood, motionLevel, repose, setBehavior]);

  useEffect(() => {
    kick();
  }, [opts.captchaProgress, opts.typingProgress, kick]);

  // 按键脉冲：歪头冲量 + 交替一只耳朵随机一抖（删除时反向歪得更多）
  const flickSide = useRef<'l' | 'r'>('l');
  useEffect(() => {
    if (!opts.keyPulse.tick || prefersReducedMotion()) return;
    lastPulse.current = Date.now();
    impulse('tilt', opts.keyPulse.del ? -70 : (Math.random() < 0.5 ? -1 : 1) * 28);
    // 张望时每敲一个字点一下头（「嗯…嗯…」）
    if (o.current.mood === 'scout') impulse('hy', opts.keyPulse.del ? -60 : 55);
    flickSide.current = flickSide.current === 'l' ? 'r' : 'l';
    const s = flickSide.current;
    impulse(s === 'l' ? 'eLs' : 'eRs', 120 + Math.random() * 140);
    impulse(s === 'l' ? 'eLl' : 'eRl', -0.8);
    impulse('bell', (Math.random() < 0.5 ? -1 : 1) * 70); // 叮
    kick();
  }, [opts.keyPulse, kick]);

  // 空闲调度：只在 idle + 装饰动效开启时跑
  useEffect(() => {
    if (!decorativeMotionEnabled()) return;
    let t = 0;
    const loop = () => {
      t = window.setTimeout(() => {
        // 被盯着（悬停）时保持害羞，不插随机小动作
        if (o.current.mood === 'idle' && behavior.current === 'none' && !hovering.current) {
          if (Date.now() - lastActivity.current >= SLEEP_AFTER_MS) setBehavior('sleep');
          else setBehavior(pickIdleBehavior(Math.random, o.current.withBody));
        }
        loop();
      }, Math.min(idleDelay(Math.random), Math.max(400, SLEEP_AFTER_MS - (Date.now() - lastActivity.current))));
    };
    loop();
    return () => window.clearTimeout(t);
  }, [motionLevel, setBehavior]);

  // 眨眼：闭快睁慢，15% 连眨；睡着/闭眼行为时不眨；被盯着 1.3s 以上慢眨一次
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let t = 0;
    const closed = () => ['sleep', 'yawn', 'lick'].includes(behavior.current);
    const schedule = () => {
      t = window.setTimeout(() => {
        const now = Date.now();
        // 被盯着、还没慢眨过：只等慢眨眼（700ms 轮询），期间不普通眨眼
        const awaitingSlow = hovering.current && !slowBlinked.current && o.current.mood === 'idle';
        if (!closed() && !blink.current && (!awaitingSlow || now - hoverSince.current > 1300)) {
          if (awaitingSlow) slowBlinked.current = true;
          blink.current = { kind: awaitingSlow ? 'slow' : Math.random() < 0.15 ? 'double' : 'normal', at: now };
          kick();
        }
        schedule();
      }, hovering.current && !slowBlinked.current ? 700 : 2400 + Math.random() * 3600);
    };
    schedule();
    return () => window.clearTimeout(t);
  }, [motionLevel, kick]);

  // 摸猫
  const onPointerEnter = useCallback(() => {
    hovering.current = true;
    hoverSince.current = Date.now();
    slowBlinked.current = false;
    rootRef.current?.classList.add('is-hover');
    o.current.onHover?.(true);
    repose();
  }, [repose, rootRef]);
  const onPointerLeave = useCallback(() => {
    hovering.current = false;
    rootRef.current?.classList.remove('is-hover');
    o.current.onHover?.(false);
    repose();
  }, [repose, rootRef]);
  const onPet = useCallback((e: React.PointerEvent) => {
    if (behavior.current === 'sleep') {
      setBehavior('wake');
      return;
    }
    const now = Date.now();
    pets.current = registerPet(pets.current, now);
    const b = petBehavior(pets.current.length);
    if (b === 'belly') pets.current = [];
    setBehavior(b);
    // 害羞那一下只冒气不撒花；熟络了才迸墨点
    if (b !== 'shy') burstAt(e.clientX, e.clientY);
  }, [setBehavior]);

  return { onPointerEnter, onPointerLeave, onPet };
}

function seedSprings(st: Record<Ch, Spring>, p: CatPose) {
  const set = (c: Ch, x: number) => {
    st[c] = { x, v: 0 };
  };
  set('eLs', p.earL.swivel); set('eLl', p.earL.lift); set('eLf', p.earL.flat); set('eLt', p.earL.tip);
  set('eRs', p.earR.swivel); set('eRl', p.earR.lift); set('eRf', p.earR.flat); set('eRt', p.earR.tip);
  set('bLr', p.browL.rot); set('bLy', p.browL.dy); set('bRr', p.browR.rot); set('bRy', p.browR.dy);
  set('tb', p.tail.base); set('tc', p.tail.curl); set('ta', p.tail.amp); set('tp', p.tail.puff); set('tl', p.tail.lash);
}
