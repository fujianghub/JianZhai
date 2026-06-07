import { describe, expect, it } from 'vitest';
import {
  parseListLine,
  enterListAction,
  indentListLine,
  dedentListLine,
} from './listRules';

describe('parseListLine', () => {
  it('parses bullet / ordered / quote / task lines', () => {
    expect(parseListLine('- 内容')?.kind).toBe('bullet');
    expect(parseListLine('  * 嵌套')?.indent).toBe('  ');
    expect(parseListLine('3. 第三')?.marker).toBe('3');
    expect(parseListLine('3) 括号分隔')?.delimiter).toBe(')');
    expect(parseListLine('> 引用')?.kind).toBe('quote');
    expect(parseListLine('- [ ] 任务')?.task).toBe('[ ] ');
    expect(parseListLine('- [x] 已完成')?.task).toBe('[x] ');
    expect(parseListLine('普通段落')).toBeNull();
    expect(parseListLine('-无空格不是列表')).toBeNull();
  });
});

describe('enterListAction', () => {
  it('continues a bullet item', () => {
    const r = enterListAction('- 内容文本', 6);
    expect(r).toEqual({ kind: 'continue', prefix: '- ' });
  });

  it('keeps indentation when continuing', () => {
    const r = enterListAction('    - 嵌套内容', 10);
    expect(r).toEqual({ kind: 'continue', prefix: '    - ' });
  });

  it('increments ordered list number', () => {
    const r = enterListAction('7. 第七项', 6);
    expect(r).toEqual({ kind: 'continue', prefix: '8. ' });
  });

  it('keeps ) delimiter', () => {
    const r = enterListAction('1) 项', 4);
    expect(r).toEqual({ kind: 'continue', prefix: '2) ' });
  });

  it('continues quote with > ', () => {
    const r = enterListAction('> 引用内容', 5);
    expect(r).toEqual({ kind: 'continue', prefix: '> ' });
  });

  it('resets task checkbox on continuation', () => {
    const r = enterListAction('- [x] 完成项', 9);
    expect(r).toEqual({ kind: 'continue', prefix: '- [ ] ' });
  });

  it('exits on empty item', () => {
    expect(enterListAction('- ', 2)).toEqual({ kind: 'exit', newLineText: '' });
    expect(enterListAction('1. ', 3)).toEqual({ kind: 'exit', newLineText: '' });
    expect(enterListAction('- [ ] ', 6)).toEqual({ kind: 'exit', newLineText: '' });
  });

  it('default when cursor is inside the marker area', () => {
    expect(enterListAction('- 内容', 1)).toEqual({ kind: 'default' });
  });

  it('default for non-list line', () => {
    expect(enterListAction('普通文字', 2)).toEqual({ kind: 'default' });
  });
});

describe('indent / dedent', () => {
  it('indents list line by two spaces', () => {
    expect(indentListLine('- 项')).toEqual({
      kind: 'replace-line',
      newLineText: '  - 项',
      colDelta: 2,
    });
  });

  it('returns null for non-list line', () => {
    expect(indentListLine('正文')).toBeNull();
  });

  it('dedents by two spaces, then one, then null', () => {
    expect(dedentListLine('  - 项')?.newLineText).toBe('- 项');
    expect(dedentListLine(' - 项')?.newLineText).toBe('- 项');
    expect(dedentListLine('- 项')).toBeNull();
  });
});
