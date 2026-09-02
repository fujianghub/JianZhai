/**
 * 快捷键底层：键位串解析 / 事件匹配 / IME 与输入焦点守卫 / CM6 键名转换。
 *
 * 键位串（chord）语法：`Mod+Shift+X`、`Alt+Mod+1`、`Escape`、`Shift+ArrowLeft`、
 * `Space`、`?`、`Mod+/`。`Mod` = macOS ⌘ 或其它平台 Ctrl（运行时 metaKey||ctrlKey）。
 * 键名用 KeyboardEvent.key 的值（字母不区分大小写）；`Space` 是 ' ' 的别名。
 * 需要物理键判定时（Shift 下 key 会变）用 `code:` 前缀，如 `Mod+Shift+code:Space`。
 */

export interface Chord {
  key: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** 用 KeyboardEvent.code 而非 key 判定 */
  code?: string;
}

const KEY_ALIASES: Record<string, string> = {
  space: ' ',
  esc: 'Escape',
  return: 'Enter',
  plus: '+',
  minus: '-',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
};

export function parseChord(chord: string): Chord {
  const parts = chord.split('+');
  // 键位本身可能就是 '+'：'Mod++' 会被 split 出空串
  const out: Chord = { key: '' };
  const keyParts: string[] = [];
  for (const raw of parts) {
    const p = raw.trim();
    const low = p.toLowerCase();
    if (low === 'mod' || low === 'cmd' || low === 'ctrl') out.mod = true;
    else if (low === 'shift') out.shift = true;
    else if (low === 'alt' || low === 'option') out.alt = true;
    else keyParts.push(p);
  }
  let key = keyParts.join('+');
  if (key === '' && chord.endsWith('+')) key = '+';
  if (key.startsWith('code:')) {
    out.code = key.slice(5);
    out.key = out.code;
  } else {
    out.key = KEY_ALIASES[key.toLowerCase()] ?? key;
  }
  if (!out.key) throw new Error(`invalid chord: ${chord}`);
  return out;
}

export function isImeEvent(e: KeyboardEvent): boolean {
  return e.isComposing || e.keyCode === 229;
}

/** 焦点是否在输入区（input/textarea/select/contentEditable，含 CM6/ProseMirror）。 */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function keyEquals(evKey: string, want: string): boolean {
  if (evKey === want) return true;
  // 中文输入法下 Shift+/ 常产出全角问号
  if (want === '?' && evKey === '？') return true;
  if (evKey.length === 1 && want.length === 1) return evKey.toLowerCase() === want.toLowerCase();
  return false;
}

/** '?' '+' '@' 这类符号本身就要按 Shift 才打得出，键位未声明 Shift 时不校验 shiftKey。 */
function shiftAgnostic(c: Chord): boolean {
  return !c.shift && !c.code && c.key.length === 1 && !/[a-z0-9 ]/i.test(c.key);
}

/** 事件是否命中键位。修饰键严格匹配：未声明的 Shift/Alt 必须未按下；
 *  `mod` 未声明时 meta/ctrl 都必须未按下（避免 Mod+E 误命中 E）。 */
export function matchesChord(e: KeyboardEvent, chord: Chord | string): boolean {
  const c = typeof chord === 'string' ? parseChord(chord) : chord;
  const modDown = e.metaKey || e.ctrlKey;
  if (!!c.mod !== modDown) return false;
  if (!shiftAgnostic(c) && !!c.shift !== e.shiftKey) return false;
  if (!!c.alt !== e.altKey) return false;
  if (c.code) return e.code === c.code;
  return keyEquals(e.key, c.key);
}

/** CM6 keymap 键名：`Mod-Shift-x`（字母小写，命名键保留大小写）。 */
export function toCmKey(chord: Chord | string): string {
  const c = typeof chord === 'string' ? parseChord(chord) : chord;
  const parts: string[] = [];
  if (c.mod) parts.push('Mod');
  if (c.alt) parts.push('Alt');
  if (c.shift) parts.push('Shift');
  const key = c.key === ' ' ? 'Space' : c.key.length === 1 ? c.key.toLowerCase() : c.key;
  parts.push(key);
  return parts.join('-');
}

/** ProseMirror / Tiptap addKeyboardShortcuts 键名与 CM6 同形。 */
export const toPmKey = toCmKey;
