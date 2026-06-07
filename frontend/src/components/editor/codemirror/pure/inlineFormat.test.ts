import { describe, expect, it } from 'vitest';
import { toggleWrap, makeLink, clearInlineFormat, toggleLinePrefix } from './inlineFormat';

describe('toggleWrap', () => {
  const doc = '这是一段测试文字';

  it('wraps a selection', () => {
    const r = toggleWrap(doc, 2, 4, '**');
    expect(r.insert).toBe('**一段**');
    expect(doc.slice(0, r.from) + r.insert + doc.slice(r.to)).toBe('这是**一段**测试文字');
    expect([r.selFrom, r.selTo]).toEqual([4, 6]);
  });

  it('unwraps when markers sit outside the selection', () => {
    const d = '这是**一段**测试';
    const r = toggleWrap(d, 4, 6, '**'); // 选中「一段」
    expect(d.slice(0, r.from) + r.insert + d.slice(r.to)).toBe('这是一段测试');
  });

  it('unwraps when selection includes the markers', () => {
    const d = '这是**一段**测试';
    const r = toggleWrap(d, 2, 8, '**'); // 选中「**一段**」
    expect(d.slice(0, r.from) + r.insert + d.slice(r.to)).toBe('这是一段测试');
  });

  it('inserts placeholder for empty selection and selects it', () => {
    const r = toggleWrap('abc', 3, 3, '*', '斜体');
    expect(r.insert).toBe('*斜体*');
    expect([r.selFrom, r.selTo]).toEqual([4, 6]);
  });
});

describe('makeLink', () => {
  it('turns selection into link and selects the url placeholder', () => {
    const r = makeLink('点这里', 0, 3);
    expect(r.insert).toBe('[点这里](https://)');
    const selected = r.insert.slice(r.selFrom - r.from, r.selTo - r.from);
    expect(selected).toBe('https://');
  });
});

describe('clearInlineFormat', () => {
  it('strips markers and inline html', () => {
    const d = '**粗** *斜* ~~删~~ `码` <u>线</u> <span style="color:red">红</span> ==亮==';
    const r = clearInlineFormat(d, 0, d.length);
    expect(r.insert).toBe('粗 斜 删 码 线 红 亮');
  });
});

describe('toggleLinePrefix', () => {
  it('sets / replaces / removes heading', () => {
    expect(toggleLinePrefix('标题', 'heading-2')).toBe('## 标题');
    expect(toggleLinePrefix('# 标题', 'heading-2')).toBe('## 标题');
    expect(toggleLinePrefix('## 标题', 'heading-2')).toBe('标题');
  });

  it('toggles bullet across multiple lines', () => {
    expect(toggleLinePrefix('甲\n乙', 'bullet')).toBe('- 甲\n- 乙');
    expect(toggleLinePrefix('- 甲\n- 乙', 'bullet')).toBe('甲\n乙');
  });

  it('numbers ordered lines sequentially', () => {
    expect(toggleLinePrefix('甲\n乙\n丙', 'ordered')).toBe('1. 甲\n2. 乙\n3. 丙');
  });

  it('toggles quote', () => {
    expect(toggleLinePrefix('甲\n乙', 'quote')).toBe('> 甲\n> 乙');
    expect(toggleLinePrefix('> 甲\n> 乙', 'quote')).toBe('甲\n乙');
  });
});
