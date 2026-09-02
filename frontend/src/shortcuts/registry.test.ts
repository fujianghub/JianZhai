import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseChord, toCmKey } from './keys';
import { CM_KEYS, SHORTCUTS, shortcutsForScopes } from './registry';

describe('快捷键注册表', () => {
  it('id 唯一', () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(SHORTCUTS.map((s) => [s.id, s.chord] as const))('%s 的键位 %s 可解析', (_id, chord) => {
    expect(() => parseChord(chord)).not.toThrow();
  });

  it('同 scope 内键位不重复（重复须用 when 区分上下文）', () => {
    const seen = new Map<string, string>();
    const dups: string[] = [];
    for (const s of SHORTCUTS) {
      const key = `${s.scope}|${toCmKey(parseChord(s.chord))}|${s.when ?? ''}`;
      const prev = seen.get(key);
      if (prev) dups.push(`${prev} ↔ ${s.id} (${s.scope} ${s.chord})`);
      seen.set(key, s.id);
    }
    expect(dups).toEqual([]);
  });

  it('editor.* 子作用域不与 editor 撞键（同 chord 同 when）', () => {
    const base = new Set(SHORTCUTS.filter((s) => s.scope === 'editor').map((s) => `${s.chord}|${s.when ?? ''}`));
    const clashes = SHORTCUTS.filter((s) => s.scope.startsWith('editor.') && base.has(`${s.chord}|${s.when ?? ''}`)).map((s) => s.id);
    expect(clashes).toEqual([]);
  });

  it('owner=cm6 的条目在对应 keymap 源文件里以同名键串出现', () => {
    const missing: string[] = [];
    for (const s of SHORTCUTS) {
      if (s.owner !== 'cm6') continue;
      expect(s.file, `${s.id} 缺 file`).toBeTruthy();
      const src = readFileSync(resolve(__dirname, '..', s.file!), 'utf-8');
      const key = CM_KEYS[s.id];
      if (!src.includes(`'${key}'`) && !src.includes(`CM_KEYS['${s.id}']`) && !src.includes(`CM_KEYS.${s.id}`)) {
        missing.push(`${s.id} → ${key} 不在 ${s.file}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('shortcutsForScopes 让 editor.markdown 继承 editor 通用键并默认隐藏 hidden 项', () => {
    const list = shortcutsForScopes(['editor.markdown']);
    expect(list.some((s) => s.id === 'editor.save')).toBe(true);
    expect(list.some((s) => s.id === 'editor.markdown.bold')).toBe(true);
    expect(list.some((s) => s.hidden)).toBe(false);
  });
});
