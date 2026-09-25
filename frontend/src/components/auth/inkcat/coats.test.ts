import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { coatForTheme } from './coats';

const css = readFileSync(resolve(__dirname, '../../../styles/login.css'), 'utf8');

describe('coats — 只有黑白两色，随主题明暗', () => {
  it('light themes get the black cat, dark themes the white cat', () => {
    for (const m of ['light', 'springwater', 'wintersnow'] as const) expect(coatForTheme(m)).toBe('black');
    for (const m of ['dark', 'starry', 'deepsea'] as const) expect(coatForTheme(m)).toBe('white');
  });

  it('the white coat has its CSS rule; no leftover multi-coat rules', () => {
    expect(css).toContain(".jz-inkcat[data-coat='white']");
    for (const old of ['xuanmao', 'qingci', 'yingfen', 'chiyu', 'jinbei', 'daiqing', 'xueli']) {
      expect(css).not.toContain(`data-coat='${old}'`);
    }
  });
});
