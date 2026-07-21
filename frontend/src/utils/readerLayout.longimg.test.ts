// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT,
  clearReaderLayout,
  loadReaderLayout,
  saveReaderLayout,
} from './readerLayout';

// longImageLimit（长图限高开关）的 localStorage 持久化回归。
// 现有 readerLayout.test.ts 跑在 node 环境（无 localStorage），故单独开 happy-dom 文件。
describe('readerLayout longImageLimit persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('默认开启（无存储键时）', () => {
    expect(DEFAULT_LAYOUT.longImageLimit).toBe(true);
    expect(loadReaderLayout().longImageLimit).toBe(true);
  });

  it('save(off) → load 得 false；save(on) → load 得 true', () => {
    saveReaderLayout({ ...DEFAULT_LAYOUT, longImageLimit: false });
    expect(loadReaderLayout().longImageLimit).toBe(false);

    saveReaderLayout({ ...DEFAULT_LAYOUT, longImageLimit: true });
    expect(loadReaderLayout().longImageLimit).toBe(true);
  });

  it('clear 后回落默认开启', () => {
    saveReaderLayout({ ...DEFAULT_LAYOUT, longImageLimit: false });
    clearReaderLayout();
    expect(loadReaderLayout().longImageLimit).toBe(true);
    expect(localStorage.getItem('jz-reader-longimg')).toBeNull();
  });

  it('非法存储值不当作关闭（只有 "off" 才关）', () => {
    localStorage.setItem('jz-reader-longimg', 'garbage');
    expect(loadReaderLayout().longImageLimit).toBe(true);
  });
});
