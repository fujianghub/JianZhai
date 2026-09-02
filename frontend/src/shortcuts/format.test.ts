import { afterEach, describe, expect, it } from 'vitest';
import { ariaKeyshortcuts, formatChord, formatChordText, formatShortcut, setPlatformOverride, withShortcut } from './format';
import { SHORTCUTS } from './registry';

afterEach(() => setPlatformOverride(null));

describe('formatChord / formatChordText', () => {
  it('macOS：Apple HIG 符号序 ⌥⇧⌘、无分隔', () => {
    setPlatformOverride('mac');
    expect(formatChordText('Mod+Shift+X')).toBe('⇧⌘X');
    expect(formatChordText('Alt+Mod+1')).toBe('⌥⌘1');
    expect(formatChordText('Mod+Shift+code:Space')).toBe('⇧⌘Space');
    expect(formatChordText('Escape')).toBe('Esc');
    expect(formatChordText('Mod+Enter')).toBe('⌘↩');
    expect(formatChordText('Shift+ArrowLeft')).toBe('⇧←');
    expect(formatChord('Mod+K')).toEqual(['⌘', 'K']);
  });
  it('Windows / Linux：Ctrl+Alt+Shift+键', () => {
    setPlatformOverride('win');
    expect(formatChordText('Mod+Shift+X')).toBe('Ctrl+Shift+X');
    expect(formatChordText('Alt+Mod+1')).toBe('Ctrl+Alt+1');
    expect(formatChordText('Mod+Shift+code:Space')).toBe('Ctrl+Shift+Space');
    expect(formatChordText('Mod+Enter')).toBe('Ctrl+Enter');
    expect(formatChordText('F9')).toBe('F9');
  });
  it('formatShortcut / withShortcut 按 id 取键位', () => {
    setPlatformOverride('win');
    expect(formatShortcut('admin.search')).toBe('Ctrl+K');
    expect(withShortcut('搜索', 'admin.search')).toBe('搜索 (Ctrl+K)');
    setPlatformOverride('mac');
    expect(withShortcut('搜索', 'admin.search')).toBe('搜索 (⌘K)');
  });
});

describe('ariaKeyshortcuts', () => {
  it('Mod 展开为 Meta 与 Control 两组', () => {
    expect(ariaKeyshortcuts('Mod+Shift+X')).toBe('Meta+Shift+X Control+Shift+X');
    expect(ariaKeyshortcuts('admin.search')).toBe('Meta+K Control+K');
    expect(ariaKeyshortcuts('Escape')).toBe('Escape');
    expect(ariaKeyshortcuts('Mod+/')).toBe('Meta+Slash Control+Slash');
  });
});

describe('全表两平台输出（快照）', () => {
  it('mac', () => {
    setPlatformOverride('mac');
    expect(Object.fromEntries(SHORTCUTS.map((s) => [s.id, formatChordText(s.chord)]))).toMatchSnapshot();
  });
  it('win', () => {
    setPlatformOverride('win');
    expect(Object.fromEntries(SHORTCUTS.map((s) => [s.id, formatChordText(s.chord)]))).toMatchSnapshot();
  });
});
