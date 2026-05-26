import { describe, expect, it, beforeEach } from 'vitest';
import { resetSlashCommandsCache } from '../slashCommandRegistry';
import {
  filterInsertMenu,
  getInsertMenuItems,
  insertMenuSecondaryDesc,
  insertMenuShortcut,
  INSERT_MENU_SECTIONS,
} from './insertMenuRegistry';
import { getSlashCommands } from '../slashCommandRegistry';

describe('insertMenuRegistry', () => {
  beforeEach(() => {
    resetSlashCommandsCache();
  });

  it('includes all menu sections when query empty', () => {
    const groups = filterInsertMenu('');
    const sections = groups.map((g) => g.section);
    expect(sections).toContain('基础');
    expect(sections).toContain('智能专区');
    expect(sections).toContain('程序员专区');
    expect(INSERT_MENU_SECTIONS.every((s) => sections.includes(s) || s === '画板类')).toBe(true);
  });

  it('filterInsertMenu finds 代码块 by dmk', () => {
    const groups = filterInsertMenu('dmk');
    const flat = groups.flatMap((g) => g.items);
    expect(flat.some((i) => i.id === 'code-block')).toBe(true);
  });

  it('getInsertMenuItems only returns items with menuSection', () => {
    const items = getInsertMenuItems();
    expect(items.every((i) => i.menuSection)).toBe(true);
    expect(items.some((i) => i.id === 'image')).toBe(true);
    expect(items.some((i) => i.id === 'h1')).toBe(false);
  });

  it('insertMenuShortcut for basic grid items', () => {
    const cmds = getSlashCommands();
    const byId = (id: string) => cmds.find((c) => c.id === id)!;
    expect(insertMenuShortcut(byId('image'))).toBe('/tp');
    expect(insertMenuShortcut(byId('attachment'))).toBe('/fj');
    expect(insertMenuShortcut(byId('table'))).toBe('/bg');
    expect(insertMenuShortcut(byId('callout-tips'))).toBe('/glk');
  });

  it('insertMenuSecondaryDesc omits alias-only descriptions', () => {
    const cmds = getSlashCommands();
    const ai = cmds.find((c) => c.id === 'ai')!;
    expect(insertMenuSecondaryDesc(ai)).toBeUndefined();
    const video = cmds.find((c) => c.id === 'video')!;
    if (video.description?.startsWith('/')) {
      expect(insertMenuSecondaryDesc(video)).toBeUndefined();
    }
  });
});
