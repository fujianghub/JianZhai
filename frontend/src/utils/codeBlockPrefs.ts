/** Shared code-block reader/editor preferences (Yuque-style). */

export type CodeThemeId =
  | 'yuque-light-pro'
  | 'yuque-light'
  | 'bracket-lights-pro'
  | 'one-dark-pro'
  | 'night-owl'
  | 'darcula';
export type IndentMode = 'tab' | 'spaces';

export interface CodeBlockPrefs {
  fontSize: number;
  lineHeight: number;
  lineNumbers: boolean;
  wrap: boolean;
  indentMode: IndentMode;
  indentWidth: number;
  theme: CodeThemeId;
  hideAllTitleBars: boolean;
}

export const FONT_MIN = 11;
export const FONT_MAX = 22;
export const FONT_PRESETS = [11, 12, 13, 14, 15, 16, 18, 20, 22] as const;

export const LINE_MIN = 1.0;
export const LINE_MAX = 2.4;
export const LINE_DEFAULT = 1.6;
export const LINE_HEIGHT_PRESETS = [1.2, 1.4, 1.6, 1.8, 2.0] as const;

/** Same-tab broadcast when localStorage `storage` event does not fire. */
export const CODE_PREFS_CHANGE_EVENT = 'jz-code-prefs-change';

export const INDENT_WIDTHS = [2, 4, 8] as const;

export const CODE_THEMES: { id: CodeThemeId; label: string }[] = [
  { id: 'yuque-light-pro', label: 'Yuque Light Pro' },
  { id: 'yuque-light', label: 'Yuque Light' },
  { id: 'bracket-lights-pro', label: 'Bracket Lights Pro' },
  { id: 'one-dark-pro', label: 'One Dark Pro' },
  { id: 'night-owl', label: 'Night Owl' },
  { id: 'darcula', label: 'Darcula' },
];

const THEME_IDS = CODE_THEMES.map((t) => t.id) as CodeThemeId[];

/** Map removed theme slugs stored in localStorage to current ids. */
const LEGACY_THEME_MAP: Record<string, CodeThemeId> = {
  'github-light': 'bracket-lights-pro',
};

const KEYS = {
  fontSize: 'jz-code-font-size',
  lineHeight: 'jz-code-line-height',
  lineNumbers: 'jz-code-line-numbers',
  wrap: 'jz-code-wrap',
  indentMode: 'jz-code-indent-mode',
  indentWidth: 'jz-code-indent-width',
  theme: 'jz-code-theme',
  hideAllTitleBars: 'jz-code-hide-all-titles',
} as const;

const DEFAULT_PREFS: CodeBlockPrefs = {
  fontSize: 13,
  lineHeight: LINE_DEFAULT,
  lineNumbers: true,
  wrap: false,
  indentMode: 'spaces',
  indentWidth: 4,
  theme: 'one-dark-pro',
  hideAllTitleBars: false,
};

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === 'true';
  } catch {
    return fallback;
  }
}

function writeBool(key: string, v: boolean) {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    /* ignore */
  }
}

function readNum(key: string, fallback: number, min: number, max: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    if (Number.isFinite(v) && v >= min && v <= max) return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

function writeNum(key: string, v: number) {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    /* ignore */
  }
}

function readStr<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    if (v && allowed.includes(v)) return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

function writeStr(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

function readTheme(): CodeThemeId {
  try {
    const raw = localStorage.getItem(KEYS.theme);
    if (raw && raw in LEGACY_THEME_MAP) return LEGACY_THEME_MAP[raw];
  } catch {
    /* ignore */
  }
  return readStr(KEYS.theme, DEFAULT_PREFS.theme, THEME_IDS);
}

export function loadCodeBlockPrefs(): CodeBlockPrefs {
  return {
    fontSize: readNum(KEYS.fontSize, DEFAULT_PREFS.fontSize, FONT_MIN, FONT_MAX),
    lineHeight: readNum(KEYS.lineHeight, DEFAULT_PREFS.lineHeight, LINE_MIN, LINE_MAX),
    lineNumbers: readBool(KEYS.lineNumbers, DEFAULT_PREFS.lineNumbers),
    wrap: readBool(KEYS.wrap, DEFAULT_PREFS.wrap),
    indentMode: readStr(KEYS.indentMode, DEFAULT_PREFS.indentMode, ['tab', 'spaces'] as const),
    indentWidth: readNum(KEYS.indentWidth, DEFAULT_PREFS.indentWidth, 2, 8),
    theme: readTheme(),
    hideAllTitleBars: readBool(KEYS.hideAllTitleBars, DEFAULT_PREFS.hideAllTitleBars),
  };
}

export function saveCodeBlockPrefs(partial: Partial<CodeBlockPrefs>) {
  if (partial.fontSize != null) writeNum(KEYS.fontSize, partial.fontSize);
  if (partial.lineHeight != null) writeNum(KEYS.lineHeight, partial.lineHeight);
  if (partial.lineNumbers != null) writeBool(KEYS.lineNumbers, partial.lineNumbers);
  if (partial.wrap != null) writeBool(KEYS.wrap, partial.wrap);
  if (partial.indentMode != null) writeStr(KEYS.indentMode, partial.indentMode);
  if (partial.indentWidth != null) writeNum(KEYS.indentWidth, partial.indentWidth);
  if (partial.theme != null) writeStr(KEYS.theme, partial.theme);
  if (partial.hideAllTitleBars != null) {
    writeBool(KEYS.hideAllTitleBars, partial.hideAllTitleBars);
    applyHideAllTitleBars(partial.hideAllTitleBars);
  }
}

/** Re-touch localStorage so other tabs / blocks pick up changes via storage event. */
export function broadcastPrefsChange() {
  try {
    localStorage.setItem('jz-code-prefs-touch', String(Date.now()));
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CODE_PREFS_CHANGE_EVENT));
  }
}

export function applyHideAllTitleBars(hide: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('jz-code-hide-all-titles', hide);
}

export function initCodeBlockGlobalPrefs() {
  applyHideAllTitleBars(loadCodeBlockPrefs().hideAllTitleBars);
}

export function applyPrefsToBlockElement(block: HTMLElement, prefs: CodeBlockPrefs) {
  // Respect a per-block theme baked in at render time — only blocks that
  // inherit the global default get re-themed when the global pref changes.
  if (block.dataset.codeThemeExplicit !== 'true') {
    block.dataset.codeTheme = prefs.theme;
  }
  block.classList.toggle('is-wrapped', prefs.wrap);
  block.classList.toggle('jz-code-no-line-numbers', !prefs.lineNumbers);
  const pre = block.querySelector<HTMLElement>('.jz-code-pre');
  if (pre) {
    pre.style.fontSize = `${prefs.fontSize}px`;
    pre.style.lineHeight = String(prefs.lineHeight);
    pre.style.tabSize = String(prefs.indentWidth);
  }
  const gutter = block.querySelector<HTMLElement>('.jz-line-numbers');
  if (gutter) {
    gutter.style.fontSize = `${prefs.fontSize}px`;
    gutter.style.lineHeight = String(prefs.lineHeight);
  }
  const bodyWrap = block.querySelector<HTMLElement>('.jz-code-body-wrap');
  if (bodyWrap) {
    bodyWrap.classList.toggle('has-line-numbers', prefs.lineNumbers);
  }
}

export function themeLabel(themeId: CodeThemeId): string {
  return CODE_THEMES.find((t) => t.id === themeId)?.label ?? themeId;
}

export { KEYS as CODE_BLOCK_PREF_KEYS };
