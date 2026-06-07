import { describe, expect, it } from 'vitest';
import { buildLineMap } from './lineMap';

describe('buildLineMap', () => {
  it('identity when texts are equal', () => {
    const text = ['# 标题', '', '正文一', '正文二', '', '## 小节', '内容'].join('\n');
    const map = buildLineMap(text, text);
    for (let i = 0; i < 7; i++) {
      expect(map.origToTrans(i)).toBeCloseTo(i, 5);
      expect(map.transToOrig(i)).toBeCloseTo(i, 5);
    }
  });

  it('maps across an inserted region (preprocess expanded a block)', () => {
    const orig = ['# A', '| a | b |', '| - | - |', '| 1 | 2 |', '# B', 'tail'].join('\n');
    // 预处理把 3 行表格展开成 6 行 HTML
    const trans = [
      '# A',
      '<table>',
      '<tr><th>a</th><th>b</th></tr>',
      '<tr><td>1</td><td>2</td></tr>',
      '</table>',
      '',
      '# B',
      'tail',
    ].join('\n');
    const map = buildLineMap(orig, trans);
    // 锚点行精确
    expect(map.origToTrans(0)).toBeCloseTo(0, 5);
    expect(map.origToTrans(4)).toBeCloseTo(6, 5);
    expect(map.origToTrans(5)).toBeCloseTo(7, 5);
    // 表格中间行落在 (0,6) 区间内且单调
    const mid = map.origToTrans(2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(6);
    // 反向
    expect(map.transToOrig(6)).toBeCloseTo(4, 5);
    expect(map.transToOrig(7)).toBeCloseTo(5, 5);
  });

  it('maps across a removed region (comments stripped)', () => {
    const orig = ['line A', '<!-- meta', 'still meta -->', 'line B', 'line C'].join('\n');
    const trans = ['line A', '', 'line B', 'line C'].join('\n');
    const map = buildLineMap(orig, trans);
    expect(map.origToTrans(0)).toBeCloseTo(0, 5);
    expect(map.origToTrans(3)).toBeCloseTo(2, 5);
    expect(map.origToTrans(4)).toBeCloseTo(3, 5);
    expect(map.transToOrig(2)).toBeCloseTo(3, 5);
  });

  it('is monotonic even with repeated non-anchor lines', () => {
    const orig = ['x', '', 'x', '唯一锚一', 'x', '', 'x', '唯一锚二', 'x'].join('\n');
    const trans = ['x', '插入', '', 'x', '唯一锚一', 'x', '', 'x', '唯一锚二', 'x'].join('\n');
    const map = buildLineMap(orig, trans);
    let prev = -Infinity;
    for (let i = 0; i < 9; i++) {
      const t = map.origToTrans(i);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
    expect(map.origToTrans(3)).toBeCloseTo(4, 5);
    expect(map.origToTrans(7)).toBeCloseTo(8, 5);
  });

  it('extrapolates beyond the last anchor by offset', () => {
    const orig = ['锚', 'a', 'b', 'c'].join('\n');
    const trans = ['前置', '锚', 'a', 'b', 'c'].join('\n');
    const map = buildLineMap(orig, trans);
    expect(map.origToTrans(3)).toBeCloseTo(4, 5);
  });

  it('falls back to identity-ish mapping with no anchors', () => {
    const map = buildLineMap('a\nb', 'c\nd');
    expect(map.origToTrans(1)).toBeCloseTo(1, 5);
  });
});
