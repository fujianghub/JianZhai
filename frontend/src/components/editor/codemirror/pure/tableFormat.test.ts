import { describe, expect, it } from 'vitest';
import {
  isTableLine,
  isSeparatorLine,
  findTableRange,
  splitCells,
  displayWidth,
  formatTable,
  addRowAfter,
  deleteRow,
  addColumnAfter,
  deleteColumn,
  cellContentRange,
  cellIndexAt,
} from './tableFormat';

const TABLE = ['| 名称 | 数量 |', '| --- | --- |', '| 苹果 | 3 |', '| pear | 12 |'].join('\n');

describe('detection', () => {
  it('isTableLine / isSeparatorLine', () => {
    expect(isTableLine('| a | b |')).toBe(true);
    expect(isTableLine('普通行')).toBe(false);
    expect(isSeparatorLine('| --- | :--: |')).toBe(true);
    expect(isSeparatorLine('| a | b |')).toBe(false);
  });

  it('findTableRange finds contiguous block', () => {
    const lines = ['前文', ...TABLE.split('\n'), '后文'];
    expect(findTableRange(lines, 2)).toEqual({ start: 1, end: 4 });
    expect(findTableRange(lines, 0)).toBeNull();
  });
});

describe('cells', () => {
  it('splitCells handles escaped pipes', () => {
    expect(splitCells('| a | b\\|c |')).toEqual([' a ', ' b\\|c ']);
  });

  it('displayWidth counts CJK as 2', () => {
    expect(displayWidth('ab')).toBe(2);
    expect(displayWidth('苹果')).toBe(4);
    expect(displayWidth('a苹')).toBe(3);
  });

  it('cellContentRange / cellIndexAt', () => {
    const line = '| 苹果 | 3 |';
    const r = cellContentRange(line, 0)!;
    expect(line.slice(r.from, r.to)).toBe('苹果');
    expect(cellIndexAt(line, 3)).toBe(0);
    expect(cellIndexAt(line, line.indexOf('3'))).toBe(1);
  });
});

describe('formatTable', () => {
  it('aligns columns by CJK-aware width', () => {
    const out = formatTable(TABLE);
    const lines = out.split('\n');
    // 所有行长度一致（对齐后）
    expect(new Set(lines.map(displayWidth)).size).toBe(1);
    expect(lines[0]).toContain('| 名称');
    expect(isSeparatorLine(lines[1])).toBe(true);
  });

  it('keeps alignment markers', () => {
    const t = ['| a | b |', '| :--- | --: |', '| 1 | 2 |'].join('\n');
    const out = formatTable(t).split('\n');
    expect(out[1]).toMatch(/\| :-+ \| -+: \|/);
  });

  it('pads ragged rows to max column count', () => {
    const t = ['| a | b | c |', '| - | - | - |', '| 1 |'].join('\n');
    const out = formatTable(t).split('\n');
    expect(splitCells(out[2]).length).toBe(3);
  });
});

describe('row / column ops', () => {
  it('addRowAfter inserts after separator at minimum', () => {
    const out = addRowAfter(TABLE, 0).split('\n');
    expect(out.length).toBe(5);
    expect(isSeparatorLine(out[1])).toBe(true);
    expect(out[2].trim()).toMatch(/^\|\s*\|\s*\|$/);
  });

  it('deleteRow refuses header / separator', () => {
    expect(deleteRow(TABLE, 0)).toBeNull();
    expect(deleteRow(TABLE, 1)).toBeNull();
    const out = deleteRow(TABLE, 2)!;
    expect(out).not.toContain('苹果');
  });

  it('addColumnAfter / deleteColumn act on every line', () => {
    const out = addColumnAfter(TABLE, 1).split('\n');
    expect(splitCells(out[0]).length).toBe(3);
    expect(isSeparatorLine(out[1])).toBe(true);
    const back = deleteColumn(out.join('\n'), 2)!.split('\n');
    expect(splitCells(back[0]).length).toBe(2);
  });

  it('deleteColumn refuses last column', () => {
    const single = ['| a |', '| - |', '| 1 |'].join('\n');
    expect(deleteColumn(single, 0)).toBeNull();
  });
});
