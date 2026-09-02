/**
 * 平台感知的快捷键显示（2026-09-02）。
 *
 * macOS：符号序 ⌃ ⌥ ⇧ ⌘、无分隔（`⌘⇧X`、`⌥⌘1`、`⌘Space`）；
 * 其它：`Ctrl+Shift+X`。`aria-keyshortcuts` 用 W3C 语法（`Meta+Shift+X Control+Shift+X`）。
 * 平台探测优先 navigator.userAgentData.platform，回退 navigator.platform / userAgent；
 * SSR / 测试环境默认非 Mac，可用 setPlatformOverride 注入。
 */
import { parseChord, type Chord } from './keys';
import { getChord } from './registry';

export type Platform = 'mac' | 'win';

let override: Platform | null = null;
let cached: Platform | null = null;

export function setPlatformOverride(p: Platform | null): void {
  override = p;
  cached = null;
}

export function detectPlatform(): Platform {
  if (override) return override;
  if (cached) return cached;
  let mac = false;
  if (typeof navigator !== 'undefined') {
    const uad = (navigator as { userAgentData?: { platform?: string } }).userAgentData;
    const p = uad?.platform || navigator.platform || navigator.userAgent || '';
    mac = /mac|iphone|ipad|ipod/i.test(p);
  }
  cached = mac ? 'mac' : 'win';
  return cached;
}

const MAC_KEY: Record<string, string> = {
  ' ': 'Space',
  Escape: 'Esc',
  Enter: '↩',
  Backspace: '⌫',
  Delete: '⌦',
  Tab: '⇥',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
};
const WIN_KEY: Record<string, string> = {
  ' ': 'Space',
  Escape: 'Esc',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
};

function keyLabel(c: Chord, platform: Platform): string {
  const k = c.code ? c.code : c.key;
  const table = platform === 'mac' ? MAC_KEY : WIN_KEY;
  if (table[k]) return table[k];
  if (k.length === 1) return k.toUpperCase();
  return k;
}

/** 每个键一段，供 <Kbd> 分片渲染。 */
export function formatChord(chord: string | Chord, platform: Platform = detectPlatform()): string[] {
  const c = typeof chord === 'string' ? parseChord(chord) : chord;
  const parts: string[] = [];
  if (platform === 'mac') {
    if (c.alt) parts.push('⌥');
    if (c.shift) parts.push('⇧');
    if (c.mod) parts.push('⌘');
  } else {
    if (c.mod) parts.push('Ctrl');
    if (c.alt) parts.push('Alt');
    if (c.shift) parts.push('Shift');
  }
  parts.push(keyLabel(c, platform));
  return parts;
}

/** 单行文案：mac `⌘⇧X`，win `Ctrl+Shift+X`。 */
export function formatChordText(chord: string | Chord, platform: Platform = detectPlatform()): string {
  const parts = formatChord(chord, platform);
  return platform === 'mac' ? parts.join('') : parts.join('+');
}

export function formatShortcut(id: string, platform: Platform = detectPlatform()): string {
  return formatChordText(getChord(id), platform);
}

/** Tooltip 常用形态：`加粗 (⌘B)` / `加粗 (Ctrl+B)`。 */
export function withShortcut(label: string, id: string, platform: Platform = detectPlatform()): string {
  return `${label} (${formatShortcut(id, platform)})`;
}

const ARIA_KEY: Record<string, string> = { ' ': 'Space', '+': 'Plus', '-': 'Minus', '/': 'Slash', '?': 'Shift+Slash', '.': 'Period', ',': 'Comma', '@': 'Shift+2', '0': '0' };

/** W3C aria-keyshortcuts：Mod 展开为 Meta 与 Control 两组（空格分隔）。 */
export function ariaKeyshortcuts(idOrChord: string): string {
  const chord = idOrChord.includes('.') && !idOrChord.includes('+') ? getChord(idOrChord) : idOrChord;
  const c = parseChord(chord);
  const key = c.code ? c.code : ARIA_KEY[c.key] ?? (c.key.length === 1 ? c.key.toUpperCase() : c.key);
  const rest = [c.alt ? 'Alt' : '', c.shift ? 'Shift' : '', key].filter(Boolean).join('+');
  if (!c.mod) return rest;
  return `Meta+${rest} Control+${rest}`;
}

/** innerHTML 面的键帽（代码块设置面板等无 React 处）；文本经转义。 */
export function kbdHtml(id: string, platform: Platform = detectPlatform()): string {
  const parts = formatChord(getChord(id), platform);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const inner = parts
    .map((p, i) => `<span class="jz-kbd-key">${platform !== 'mac' && i > 0 ? '<span class="jz-kbd-sep" aria-hidden="true">+</span>' : ''}${esc(p)}</span>`)
    .join('');
  return `<kbd class="jz-kbd" aria-keyshortcuts="${ariaKeyshortcuts(id)}">${inner}</kbd>`;
}
