import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import type { ViewUpdate } from '@codemirror/view';
import { changeMayAffectNumbering } from './headingNumber';

/** 用 EditorState 事务伪造 ViewUpdate 的最小形状（函数只读这三个字段）。 */
function makeUpdate(
  doc: string,
  changes: { from: number; to?: number; insert?: string },
): ViewUpdate {
  const state = EditorState.create({ doc });
  const tr = state.update({ changes });
  return {
    changes: tr.changes,
    startState: state,
    state: tr.state,
  } as unknown as ViewUpdate;
}

const DOC = '# 标题一\n正文一段。\n## 标题二\n另一段正文。';

describe('changeMayAffectNumbering（普通打字跳过全文重扫的门控）', () => {
  it('正文行内敲普通字符 → false（免重建，仅平移装饰）', () => {
    const pos = DOC.indexOf('正文一段') + 2;
    expect(changeMayAffectNumbering(makeUpdate(DOC, { from: pos, insert: '呀' }))).toBe(false);
  });

  it('正文行内删一个字符 → false', () => {
    const pos = DOC.indexOf('正文一段');
    expect(
      changeMayAffectNumbering(makeUpdate(DOC, { from: pos, to: pos + 1 })),
    ).toBe(false);
  });

  it('插入 # → true（可能敲出新标题）', () => {
    const pos = DOC.indexOf('正文一段');
    expect(changeMayAffectNumbering(makeUpdate(DOC, { from: pos, insert: '#' }))).toBe(true);
  });

  it('插入含换行 → true（可能拆出标题行）', () => {
    const pos = DOC.indexOf('正文一段') + 2;
    expect(
      changeMayAffectNumbering(makeUpdate(DOC, { from: pos, insert: 'x\ny' })),
    ).toBe(true);
  });

  it('在标题行上编辑 → true（标题文字变化需重排）', () => {
    const pos = DOC.indexOf('标题一');
    expect(changeMayAffectNumbering(makeUpdate(DOC, { from: pos, insert: '新' }))).toBe(true);
  });

  it('跨行删除 → true（可能吞掉标题行）', () => {
    const from = DOC.indexOf('正文一段');
    const to = DOC.indexOf('## 标题二') + 3;
    expect(changeMayAffectNumbering(makeUpdate(DOC, { from, to }))).toBe(true);
  });

  it('fence 行上编辑 → true（fence 边界影响后续行是否算标题）', () => {
    const doc = '```\n# 注释里的井号\n```\n正文';
    expect(changeMayAffectNumbering(makeUpdate(doc, { from: 3, to: 3, insert: 'j' }))).toBe(
      true,
    );
  });

  it('把普通行删成疑似标题行前缀 → true（新状态行匹配）', () => {
    // "x# 标题" 删掉行首 x 后该行变成 "# 标题"
    const doc = 'x# 假标题\n正文';
    expect(changeMayAffectNumbering(makeUpdate(doc, { from: 0, to: 1 }))).toBe(true);
  });
});
