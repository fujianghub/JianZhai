import { create } from 'zustand';
import { flushSync } from 'react-dom';
import { prefersReducedMotion } from '@/utils/motionPref';

export type ThemeMode = 'light' | 'dark' | 'starry' | 'deepsea' | 'springwater' | 'wintersnow';

/** 过渡编排的三种「拍法」：
 *  switch = 分层错峰溶解（背景先行、面板随后，J/L cut）
 *  reveal = 主题菜单点击 → 点击处柔边圆形揭幕
 *  clock  = 随朝暮的日落/日出长溶解（叠加天色 veil、canvas 慢交接） */
export type ThemeTransitionKind = 'switch' | 'reveal' | 'clock';

const MODE_KEY = 'jianzhai:themeMode';
const FOLLOW_KEY = 'jianzhai:themeFollowClock';

interface ThemeState {
  mode: ThemeMode;
  /** 随时辰：昼(6–18时)亮色、夜星空；开启后每分钟对表，手动选主题即退出 */
  followClock: boolean;
  /** 最近一次切换的拍法 —— AmbientStage 据此决定 canvas 交接节奏 */
  transitionKind: ThemeTransitionKind;
  /** origin = 触发点击的视口坐标 → 圆形揭幕过渡；缺省为分层溶解 */
  setMode: (m: ThemeMode, origin?: { x: number; y: number }) => void;
  setFollowClock: (on: boolean) => void;
  toggleMode: () => void;
}

const MODES: readonly ThemeMode[] = [
  'light',
  'dark',
  'starry',
  'deepsea',
  'springwater',
  'wintersnow',
] as const;

/** Themes that paint on a pale background — `color-scheme` must stay `light` so
 * native form controls / scrollbars don't flip to dark. Everything else is dark. */
const LIGHT_MODES = new Set<ThemeMode>(['light', 'springwater', 'wintersnow']);

/** Shared with main.tsx so AntD's algorithm choice can't drift from color-scheme. */
export function isLightTheme(mode: ThemeMode): boolean {
  return LIGHT_MODES.has(mode);
}

/** 「随时辰」的昼夜窗口与映射：白昼宣纸、入夜星空 */
export const CLOCK_DAY_START = 6;
export const CLOCK_DAY_END = 18;
export const CLOCK_DAY_MODE: ThemeMode = 'light';
export const CLOCK_NIGHT_MODE: ThemeMode = 'starry';

/** pure resolver so the day/night boundary logic is unit-testable */
export function resolveClockMode(date: Date): ThemeMode {
  const h = date.getHours();
  return h >= CLOCK_DAY_START && h < CLOCK_DAY_END ? CLOCK_DAY_MODE : CLOCK_NIGHT_MODE;
}

function loadMode(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'light';
  const v = localStorage.getItem(MODE_KEY) as ThemeMode | null;
  if (v && MODES.includes(v)) return v;
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function loadFollow(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(FOLLOW_KEY) === '1';
}

function applyToDocument(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = mode;
  // Each theme's palette (including --jz-accent) is defined by the CSS file via
  // [data-theme=...] selectors — no inline overrides needed.
  document.documentElement.style.colorScheme = LIGHT_MODES.has(mode) ? 'light' : 'dark';
}

interface ViewTransitionLike {
  finished: Promise<void>;
  skipTransition?: () => void;
}
type DocWithVT = Document & {
  startViewTransition?: (cb: () => void) => ViewTransitionLike;
};

/* ── 分层错峰（J/L cut）──
   默认溶解时给「玻璃外壳」「顶栏」独立的 view-transition-name，让背景先变、
   面板随后、顶栏收尾。用 JS 取 document 序首个匹配（= 最外层）而非纯 CSS
   打名，规避编辑器内嵌 shell 时同名冲突导致整个过渡被跳过。 */
const LAYER_NAMES: ReadonlyArray<{ selector: string; name: string }> = [
  { selector: '.jz-admin-glass.ant-layout, .jz-blog-glass.ant-layout', name: 'jz-shell' },
  { selector: '.ant-layout-header', name: 'jz-header' },
];
const namedLayerEls = new Set<HTMLElement>();

function clearLayerNames() {
  namedLayerEls.forEach((el) => el.style.removeProperty('view-transition-name'));
  namedLayerEls.clear();
}

function assignLayerNames() {
  for (const { selector, name } of LAYER_NAMES) {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) continue;
    el.style.setProperty('view-transition-name', name);
    namedLayerEls.add(el);
  }
}

/* ── 随朝暮天色 veil ──
   日落/日出长溶解期间盖一层 soft-light 天色渐变（琥珀暮色 / 晨光金粉），
   相当于过渡期的临时调色（color grade），播完自会移除。 */
function playClockVeil(to: ThemeMode) {
  if (typeof document === 'undefined' || prefersReducedMotion()) return;
  document.querySelectorAll('.jz-dusk-veil').forEach((el) => el.remove());
  const el = document.createElement('div');
  el.className = `jz-dusk-veil ${LIGHT_MODES.has(to) ? 'jz-veil-dawn' : 'jz-veil-dusk'}`;
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-on'));
  el.addEventListener('animationend', () => el.remove());
  window.setTimeout(() => el.remove(), 4000); // 兜底：animationend 被跳帧吞掉时
}

let activeVT: ViewTransitionLike | null = null;

/**
 * Theme switches ride the View Transition API when available. The React commit
 * (AntD algorithm/colorPrimary + ambient canvas swap) is flushed synchronously
 * *inside* the transition callback so the whole UI lands in the "new" snapshot
 * — otherwise AntD components pop their colours after the dissolve ends.
 * Browsers without the API (and prefers-reduced-motion users) get an instant swap.
 */
function transitionTo(kind: ThemeTransitionKind, origin: { x: number; y: number } | undefined, commit: () => void) {
  if (typeof document === 'undefined') {
    commit();
    return;
  }
  const doc = document as DocWithVT;
  if (typeof doc.startViewTransition !== 'function' || prefersReducedMotion()) {
    commit();
    return;
  }
  // 快速连点：掐掉进行中的过渡，直接开新场，避免叠帧
  activeVT?.skipTransition?.();
  const root = document.documentElement;
  root.classList.remove('jz-vt-circle', 'jz-vt-clock');
  clearLayerNames();
  if (kind === 'reveal' && origin && typeof window !== 'undefined') {
    // radius to the farthest viewport corner (+ feather) so the soft edge
    // still fully covers the far corner at the end of the sweep
    const r = Math.hypot(
      Math.max(origin.x, window.innerWidth - origin.x),
      Math.max(origin.y, window.innerHeight - origin.y),
    );
    root.style.setProperty('--jz-vt-x', `${origin.x}px`);
    root.style.setProperty('--jz-vt-y', `${origin.y}px`);
    root.style.setProperty('--jz-vt-r', `${Math.ceil(r) + 90}px`);
    root.classList.add('jz-vt-circle');
  } else if (kind === 'clock') {
    root.classList.add('jz-vt-clock');
  } else {
    assignLayerNames();
  }
  // 过渡期间关掉 body 的 background-color transition —— new 快照是 live 的，
  // 否则 body 自己的 0.2s 过渡会叠在 VT 溶解里形成二次动画
  root.classList.add('jz-vt-live');
  const vt = doc.startViewTransition(commit);
  activeVT = vt;
  vt.finished
    .catch(() => undefined)
    .finally(() => {
      if (activeVT !== vt) return; // 已被更新的过渡接管，清理交给它
      activeVT = null;
      clearLayerNames();
      root.classList.remove('jz-vt-circle', 'jz-vt-clock', 'jz-vt-live');
    });
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const follow = loadFollow();
  const initialMode = follow ? resolveClockMode(new Date()) : loadMode();
  applyToDocument(initialMode);

  /** apply DOM theme + flush the React commit synchronously (VT snapshot 需要) */
  const commitMode = (mode: ThemeMode, patch: Partial<ThemeState>) => () => {
    applyToDocument(mode);
    flushSync(() => set({ mode, ...patch }));
  };

  return {
    mode: initialMode,
    followClock: follow,
    transitionKind: 'switch',
    setMode(mode, origin) {
      // an explicit pick is a manual choice — it ends clock-following
      if (get().followClock) {
        localStorage.setItem(FOLLOW_KEY, '0');
      }
      localStorage.setItem(MODE_KEY, mode);
      const kind: ThemeTransitionKind = origin ? 'reveal' : 'switch';
      transitionTo(kind, origin, commitMode(mode, { followClock: false, transitionKind: kind }));
    },
    setFollowClock(on) {
      localStorage.setItem(FOLLOW_KEY, on ? '1' : '0');
      if (on) {
        const next = resolveClockMode(new Date());
        if (next !== get().mode) {
          playClockVeil(next);
          transitionTo('clock', undefined, commitMode(next, { followClock: true, transitionKind: 'clock' }));
        } else {
          set({ followClock: true, mode: next });
        }
      } else {
        set({ followClock: false });
      }
    },
    toggleMode() {
      const cur = get().mode;
      const i = MODES.indexOf(cur);
      const next = MODES[(i + 1) % MODES.length];
      get().setMode(next);
    },
  };
});

// clock-follow ticker: once a minute, cross the day/night boundary if needed.
// Module-level on purpose — the theme outlives any component.
if (typeof window !== 'undefined') {
  window.setInterval(() => {
    const s = useThemeStore.getState();
    if (!s.followClock) return;
    const next = resolveClockMode(new Date());
    if (next !== s.mode) {
      playClockVeil(next);
      transitionTo('clock', undefined, () => {
        applyToDocument(next);
        flushSync(() => useThemeStore.setState({ mode: next, transitionKind: 'clock' }));
      });
    }
  }, 60_000);
}
