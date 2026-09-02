import { describe, expect, it } from 'vitest';
import { ICON_SIZE } from './iconSize';

describe('ICON_SIZE 阶梯', () => {
  it('八档严格单调递增、全为整数像素', () => {
    const values = Object.values(ICON_SIZE);
    expect(values).toHaveLength(8);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
    for (const v of values) expect(Number.isInteger(v)).toBe(true);
  });

  it('nav 档与博客顶栏历史常量一致（22）', () => {
    expect(ICON_SIZE.nav).toBe(22);
  });
});
