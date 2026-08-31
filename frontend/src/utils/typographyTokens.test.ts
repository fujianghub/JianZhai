import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { LINE_HEIGHT_OPTIONS } from './readerLayout';

/**
 * 排版令牌防回归（2026-09-01 字体统一批次）：
 *
 * 1. tokens.css 的 --jz-lh-ui/read/loose 与 readerLayout.ts 行距三档是同一
 *    组数值的两份手写副本（CSS 无法 import TS）——此前仅靠注释约束，曾
 *    出现「令牌定义了但零消费、注释声称同源却无测试锁定」。改任一侧必须
 *    同步另一侧，否则此测试红。
 * 2. styles/ 下除 tokens.css（令牌唯一定义处）与 fonts.css（@font-face
 *    唯一入口）外，禁止出现裸 font-family 栈 —— 一律引用 var(--jz-font-*)
 *    （或 inherit 拉回继承链）。2026-08-10 收敛过 120 处散栈，勿再回潮。
 */

const stylesDir = resolve(__dirname, '../styles');

function readCssStripped(file: string): string {
  return readFileSync(resolve(stylesDir, file), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('行高令牌 ↔ readerLayout 三档同源', () => {
  const tokensCss = readCssStripped('tokens.css');
  const tokenValue = (name: string): number => {
    const m = tokensCss.match(new RegExp(`${name}\\s*:\\s*([\\d.]+);`));
    expect(m, `tokens.css 缺少 ${name}`).not.toBeNull();
    return Number(m![1]);
  };

  it.each([
    ['compact', '--jz-lh-ui'],
    ['normal', '--jz-lh-read'],
    ['loose', '--jz-lh-loose'],
  ])('readerLayout %s 档 === tokens.css %s', (key, token) => {
    const opt = LINE_HEIGHT_OPTIONS.find((o) => o.key === key);
    expect(opt, `readerLayout 缺少 ${key} 档`).toBeDefined();
    expect(opt!.value).toBe(tokenValue(token));
  });
});

describe('样式层 font-family 纪律', () => {
  const exempt = new Set(['tokens.css', 'fonts.css']);
  const cssFiles = readdirSync(stylesDir).filter(
    (f) => f.endsWith('.css') && !exempt.has(f),
  );

  it.each(cssFiles)('%s 无裸 font-family 栈（只允许 var(--jz-font-*) / inherit）', (file) => {
    const css = readCssStripped(file);
    const offenders: string[] = [];
    for (const m of css.matchAll(/font-family\s*:\s*([^;]+);/g)) {
      const value = m[1].replace(/\s+/g, ' ').trim();
      // 合法形态：令牌引用、读者字体通道（--jz-article-font，兜底位仍是令牌）、
      // 继承拉回。其余一律视为散栈回潮。
      if (
        !value.startsWith('var(--jz-font') &&
        !value.startsWith('var(--jz-article-font') &&
        value !== 'inherit'
      ) {
        offenders.push(value);
      }
    }
    expect(offenders, `发现裸 font-family：${offenders.join(' | ')}`).toEqual([]);
  });
});
