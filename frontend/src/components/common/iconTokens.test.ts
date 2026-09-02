import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 图标令牌作用域防回归（2026-09-02）：
 *
 * JzIcon / JzIconKit 内联的 `fill="var(--jz-icon-*)"` 令牌必须在 tokens.css 的
 * `:root {}` 块里有兜底定义。此前只定义在 `.jz-glass` 作用域，portal 到
 * <body> 的斜杠菜单 / emoji 建议 / 表格浮层拿不到，`fill` 计算为 none，
 * 19 枚插入图标只剩线稿 + 一个彩点（Playwright 实测 68 个节点）。
 */

const here = resolve(__dirname);
const tokensCss = readFileSync(resolve(here, '../../styles/tokens.css'), 'utf-8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

function rootBlock(css: string): string {
  const start = css.indexOf(':root {');
  expect(start, 'tokens.css 缺少 :root 块').toBeGreaterThanOrEqual(0);
  const end = css.indexOf('\n}', start);
  return css.slice(start, end);
}

function iconVarsIn(file: string): string[] {
  const src = readFileSync(resolve(here, file), 'utf-8');
  const names = new Set<string>();
  // --jz-icon-tone 是 Wrap 注入的内联变量（tone prop），不是令牌。
  for (const m of src.matchAll(/var\((--jz-icon-[a-z-]+)/g)) if (m[1] !== '--jz-icon-tone') names.add(m[1]);
  return [...names].sort();
}

describe('JzIcon 令牌在 tokens.css :root 有兜底', () => {
  const root = rootBlock(tokensCss);
  const used = [...new Set([...iconVarsIn('JzIcon.tsx'), ...iconVarsIn('JzIconKit.tsx')])];

  it('至少用到了 fill / fill-strong / spot 三枚', () => {
    expect(used).toEqual(expect.arrayContaining(['--jz-icon-fill', '--jz-icon-fill-strong', '--jz-icon-spot']));
  });

  it.each(used)('%s 定义于 :root', (name) => {
    expect(root, `${name} 只在 .jz-glass 作用域定义，portal 弹层内会丢失`).toMatch(
      new RegExp(`${name}\\s*:`),
    );
  });
});
