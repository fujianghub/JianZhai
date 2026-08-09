import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FONT_TOKEN_MAP, resolveFontVar, FONT_STACK_SERIF } from './fontStacks';

/**
 * tokens.css 的 --jz-font-* 与 fontStacks.ts 常量是同一份栈的两份手写副本
 * （CSS 无法 import TS）。本测试读真实 tokens.css，把每个令牌值归一化空白后
 * 与 JS 常量逐字比对 —— 两边漂移即红。
 */

const tokensCss = readFileSync(
  resolve(__dirname, '../styles/tokens.css'),
  'utf-8',
);

/** 提取 :root 里某个自定义属性的值（容忍多行书写），归一化空白。 */
function cssTokenValue(name: string): string | null {
  // 值一直取到分号；令牌值内不含分号（字体栈无 url() 等）
  const re = new RegExp(`${name}\\s*:\\s*([^;]+);`);
  const m = tokensCss.match(re);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

describe('fontStacks ↔ tokens.css 一致性', () => {
  it.each(Object.entries(FONT_TOKEN_MAP))('%s 与 JS 常量逐字一致', (token, stack) => {
    const cssValue = cssTokenValue(token);
    expect(cssValue, `tokens.css 缺少 ${token}`).not.toBeNull();
    expect(cssValue).toBe(stack);
  });

  it('--jz-font-ui 在 tokens.css 中定义且引用 sans（admin 覆盖另行断言）', () => {
    expect(cssTokenValue('--jz-font-ui')).toBe('var(--jz-font-sans)');
  });
});

describe('resolveFontVar', () => {
  it('无 document 环境回退到传入 fallback', () => {
    // vitest node 环境无 document
    expect(resolveFontVar('--jz-font-serif', FONT_STACK_SERIF)).toBe(FONT_STACK_SERIF);
  });
});
