import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'starry' | 'deepsea' | 'springwater' | 'wintersnow';

const MODE_KEY = 'jianzhai:themeMode';
const FOLLOW_KEY = 'jianzhai:themeFollowClock';

interface ThemeState {
  mode: ThemeMode;
  /** 随时辰：昼(6–18时)亮色、夜星空；开启后每分钟对表，手动选主题即退出 */
  followClock: boolean;
  /** origin = 触发点击的视口坐标 → 圆形揭幕过渡；缺省为交叉淡融 */
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

type DocWithVT = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

/**
 * Theme switches ride the View Transition API when available: a soft
 * cross-fade by default, or — when the click origin is known — a circular
 * reveal expanding from the theme switcher. Browsers without the API (and
 * users with prefers-reduced-motion) get the old instant swap.
 */
function applyWithTransition(mode: ThemeMode, origin?: { x: number; y: number }) {
  if (typeof document === 'undefined') return;
  const doc = document as DocWithVT;
  const reduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof doc.startViewTransition !== 'function' || reduced) {
    applyToDocument(mode);
    return;
  }
  const root = document.documentElement;
  if (origin && typeof window !== 'undefined') {
    // radius to the farthest viewport corner so the circle always covers
    const r = Math.hypot(
      Math.max(origin.x, window.innerWidth - origin.x),
      Math.max(origin.y, window.innerHeight - origin.y),
    );
    root.style.setProperty('--jz-vt-x', `${origin.x}px`);
    root.style.setProperty('--jz-vt-y', `${origin.y}px`);
    root.style.setProperty('--jz-vt-r', `${Math.ceil(r)}px`);
    root.classList.add('jz-vt-circle');
  }
  const vt = doc.startViewTransition(() => applyToDocument(mode));
  vt.finished
    .catch(() => undefined)
    .finally(() => root.classList.remove('jz-vt-circle'));
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const follow = loadFollow();
  const initialMode = follow ? resolveClockMode(new Date()) : loadMode();
  applyToDocument(initialMode);
  return {
    mode: initialMode,
    followClock: follow,
    setMode(mode, origin) {
      // an explicit pick is a manual choice — it ends clock-following
      if (get().followClock) {
        localStorage.setItem(FOLLOW_KEY, '0');
      }
      localStorage.setItem(MODE_KEY, mode);
      applyWithTransition(mode, origin);
      set({ mode, followClock: false });
    },
    setFollowClock(on) {
      localStorage.setItem(FOLLOW_KEY, on ? '1' : '0');
      if (on) {
        const next = resolveClockMode(new Date());
        if (next !== get().mode) applyWithTransition(next);
        set({ followClock: true, mode: next });
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
      applyWithTransition(next);
      useThemeStore.setState({ mode: next });
    }
  }, 60_000);
}
