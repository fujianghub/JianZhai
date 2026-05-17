import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'starry' | 'deepsea';

export interface AccentPreset {
  key: string;
  label: string;
  color: string;
  bg: string;
  bgDark: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { key: 'blue', label: '靛蓝', color: '#1677ff', bg: '#fafbfd', bgDark: '#141a24' },
  { key: 'green', label: '苔绿', color: '#52c41a', bg: '#fafdf8', bgDark: '#15201a' },
  { key: 'orange', label: '柿橙', color: '#fa8c16', bg: '#fdfaf6', bgDark: '#211a14' },
  { key: 'purple', label: '紫藤', color: '#722ed1', bg: '#fbfafd', bgDark: '#1a1622' },
  { key: 'mono', label: '素墨', color: '#222222', bg: '#f7f6f3', bgDark: '#161616' },
];

const MODE_KEY = 'jianzhai:themeMode';
const ACCENT_KEY = 'jianzhai:accentKey';

interface ThemeState {
  mode: ThemeMode;
  accent: AccentPreset;
  setMode: (m: ThemeMode) => void;
  toggleMode: () => void;
  setAccent: (key: string) => void;
}

const MODES: readonly ThemeMode[] = ['light', 'dark', 'starry', 'deepsea'] as const;

function loadMode(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'light';
  const v = localStorage.getItem(MODE_KEY) as ThemeMode | null;
  if (v && MODES.includes(v)) return v;
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function loadAccent(): AccentPreset {
  if (typeof localStorage === 'undefined') return ACCENT_PRESETS[0];
  const key = localStorage.getItem(ACCENT_KEY);
  return ACCENT_PRESETS.find((p) => p.key === key) ?? ACCENT_PRESETS[0];
}

function applyToDocument(mode: ThemeMode, accent: AccentPreset) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = mode;
  // For the bespoke 'starry' / 'deepsea' palettes the CSS file defines its own
  // bg color via [data-theme=...] selectors — we only push accent here, and
  // skip the bgDark/bg pair (the inline override would clobber the palette).
  if (mode === 'starry' || mode === 'deepsea') {
    document.documentElement.style.removeProperty('--jz-bg-app');
    document.documentElement.style.removeProperty('--jz-accent');
  } else {
    document.documentElement.style.setProperty('--jz-accent', accent.color);
    document.documentElement.style.setProperty(
      '--jz-bg-app',
      mode === 'dark' ? accent.bgDark : accent.bg,
    );
  }
  document.documentElement.style.colorScheme = mode === 'light' ? 'light' : 'dark';
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const initialMode = loadMode();
  const initialAccent = loadAccent();
  applyToDocument(initialMode, initialAccent);
  return {
    mode: initialMode,
    accent: initialAccent,
    setMode(mode) {
      localStorage.setItem(MODE_KEY, mode);
      applyToDocument(mode, get().accent);
      set({ mode });
    },
    toggleMode() {
      const cur = get().mode;
      const i = MODES.indexOf(cur);
      const next = MODES[(i + 1) % MODES.length];
      get().setMode(next);
    },
    setAccent(key) {
      const preset = ACCENT_PRESETS.find((p) => p.key === key) ?? ACCENT_PRESETS[0];
      localStorage.setItem(ACCENT_KEY, preset.key);
      applyToDocument(get().mode, preset);
      set({ accent: preset });
    },
  };
});
