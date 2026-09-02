import { describe, expect, it } from 'vitest';
import { matchesChord, parseChord, toCmKey } from './keys';

function ev(init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, code: '', ...init } as KeyboardEvent;
}

describe('parseChord', () => {
  it('解析修饰键与键名别名', () => {
    expect(parseChord('Mod+Shift+X')).toEqual({ key: 'X', mod: true, shift: true });
    expect(parseChord('Alt+Mod+1')).toEqual({ key: '1', mod: true, alt: true });
    expect(parseChord('Space')).toEqual({ key: ' ' });
    expect(parseChord('Shift+Space')).toEqual({ key: ' ', shift: true });
    expect(parseChord('Mod+/')).toEqual({ key: '/', mod: true });
    expect(parseChord('+')).toEqual({ key: '+' });
    expect(parseChord('Mod+Shift+code:Space')).toEqual({ key: 'Space', code: 'Space', mod: true, shift: true });
  });
});

describe('matchesChord', () => {
  it('Mod 接受 meta 或 ctrl，字母不区分大小写', () => {
    expect(matchesChord(ev({ key: 's', ctrlKey: true }), 'Mod+S')).toBe(true);
    expect(matchesChord(ev({ key: 'S', metaKey: true }), 'Mod+S')).toBe(true);
    expect(matchesChord(ev({ key: 's' }), 'Mod+S')).toBe(false);
  });
  it('未声明的修饰键必须未按下（Mod+E 不误命中 E，E 不误命中 Mod+E）', () => {
    expect(matchesChord(ev({ key: 'e', ctrlKey: true }), 'E')).toBe(false);
    expect(matchesChord(ev({ key: 'e' }), 'Mod+E')).toBe(false);
    expect(matchesChord(ev({ key: 'k', ctrlKey: true, shiftKey: true }), 'Mod+K')).toBe(false);
  });
  it('code: 前缀按物理键判定（Shift+Space 时 key 仍是空格）', () => {
    expect(matchesChord(ev({ key: ' ', code: 'Space', ctrlKey: true, shiftKey: true }), 'Mod+Shift+code:Space')).toBe(true);
    expect(matchesChord(ev({ key: 'n', code: 'KeyN', ctrlKey: true, shiftKey: true }), 'Mod+Shift+code:Space')).toBe(false);
  });
  it('符号键不校验 Shift（? + @ 本身要按 Shift），且兼容中文输入法全角 ？', () => {
    expect(matchesChord(ev({ key: '？', shiftKey: true }), '?')).toBe(true);
    expect(matchesChord(ev({ key: '?', shiftKey: true }), '?')).toBe(true);
    expect(matchesChord(ev({ key: '+', shiftKey: true }), '+')).toBe(true);
    expect(matchesChord(ev({ key: '?', shiftKey: true, ctrlKey: true }), '?')).toBe(false);
  });
  it('命名键精确匹配', () => {
    expect(matchesChord(ev({ key: 'ArrowLeft', shiftKey: true }), 'Shift+ArrowLeft')).toBe(true);
    expect(matchesChord(ev({ key: 'Escape' }), 'Escape')).toBe(true);
    expect(matchesChord(ev({ key: 'Enter', ctrlKey: true }), 'Mod+Enter')).toBe(true);
  });
});

describe('toCmKey', () => {
  it('输出 CM6 键名（Mod-Alt-Shift-键，字母小写）', () => {
    expect(toCmKey('Mod+Shift+X')).toBe('Mod-Shift-x');
    expect(toCmKey('Mod+B')).toBe('Mod-b');
    expect(toCmKey('Shift+Tab')).toBe('Shift-Tab');
    expect(toCmKey('Enter')).toBe('Enter');
    expect(toCmKey('Alt+Mod+1')).toBe('Mod-Alt-1');
  });
});
