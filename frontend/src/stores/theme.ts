import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'starry' | 'deepsea' | 'springwater' | 'wintersnow';

const MODE_KEY = 'jianzhai:themeMode';

interface ThemeState {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
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

function loadMode(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'light';
  const v = localStorage.getItem(MODE_KEY) as ThemeMode | null;
  if (v && MODES.includes(v)) return v;
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function applyToDocument(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = mode;
  // Each theme's palette (including --jz-accent) is defined by the CSS file via
  // [data-theme=...] selectors — no inline overrides needed.
  document.documentElement.style.colorScheme = LIGHT_MODES.has(mode) ? 'light' : 'dark';
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const initialMode = loadMode();
  applyToDocument(initialMode);
  return {
    mode: initialMode,
    setMode(mode) {
      localStorage.setItem(MODE_KEY, mode);
      applyToDocument(mode);
      set({ mode });
    },
    toggleMode() {
      const cur = get().mode;
      const i = MODES.indexOf(cur);
      const next = MODES[(i + 1) % MODES.length];
      get().setMode(next);
    },
  };
});
