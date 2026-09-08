import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * 方向图标纪律（2026-09-09）：
 * 全站尖角号只有一个来源 —— `common/Chevron`（四向 + 双尖角，2.0 圆头）；
 * 披露三角只有 `common/Disclosure`。此前翻页 / 上下篇 / 下拉 caret / 子菜单 /
 * 搜索上下处分别直用 AntD Left/Right/Up/DownOutlined（约 1px 发丝线，与 1.5
 * 线稿并排读作一根针）、CaretDownOutlined（实心族）、ArrowUp/DownOutlined
 * （带尾杆箭头），共 5 套画法 19 处。这里禁止再从 `@ant-design/icons` 引入
 * 这些方向图标；innerHTML 面用 `actionIconSvg('chevron-right' | 'caret')`。
 *
 * 带尾杆的 ArrowLeft/RightOutlined 不在此列：「返回」「缩进」「阅 →」是
 * 箭头语义而非尖角号，保留。
 */
const srcDir = resolve(__dirname, '..', '..');

const ALLOWLIST = new Set<string>([]);

const BANNED = /\b(?:Left|Right|Up|Down|CaretLeft|CaretRight|CaretUp|CaretDown|ArrowUp|ArrowDown|StepBackward|StepForward|DoubleLeft|DoubleRight|VerticalLeft|VerticalRight)Outlined\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'vendor') continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

describe('方向图标纪律（Chevron 唯一来源）', () => {
  const offenders: string[] = [];
  const stale: string[] = [];
  for (const file of walk(srcDir)) {
    const rel = relative(srcDir, file);
    const src = stripComments(readFileSync(file, 'utf-8'));
    const hit = BANNED.test(src);
    if (hit && !ALLOWLIST.has(rel)) offenders.push(rel);
    if (!hit && ALLOWLIST.has(rel)) stale.push(rel);
  }

  it('无文件直用 AntD 方向图标（改用 common/Chevron / Disclosure）', () => {
    expect(offenders, `改用 <Chevron direction=…>：${offenders.join(', ')}`).toEqual([]);
  });

  it('允许清单不含已经干净的文件', () => {
    expect(stale).toEqual([]);
  });

  it('Chevron / Disclosure / actionIconSvg 三处字形与 tokens.css 的 mask 令牌同源', () => {
    const chevron = readFileSync(resolve(srcDir, 'components/common/Chevron.tsx'), 'utf-8');
    const disclosure = readFileSync(resolve(srcDir, 'components/common/Disclosure.tsx'), 'utf-8');
    const svgs = readFileSync(resolve(srcDir, 'utils/actionIconSvg.ts'), 'utf-8');
    const tokens = readFileSync(resolve(srcDir, 'styles/tokens.css'), 'utf-8');
    const chevPath = /CHEVRON_PATH = '([^']+)'/.exec(chevron)?.[1];
    const discPath = /d="([^"]+)"/.exec(disclosure)?.[1];
    expect(chevPath).toBeTruthy();
    expect(discPath).toBeTruthy();
    expect(svgs).toContain(`'chevron-right': '<path d="${chevPath}"/>'`);
    expect(tokens).toContain(`--jz-chevron-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='${chevPath}'`);
    expect(tokens).toContain(`--jz-disclosure-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='${discPath}'`);
    // CSS 侧不得再内联披露三角 data URI（tiptap.css 曾复制两份）
    const tiptap = readFileSync(resolve(srcDir, 'styles/tiptap.css'), 'utf-8');
    expect(tiptap).not.toMatch(/data:image\/svg\+xml[^"]*M8\.5 6\.2 17 12/);
  });
});
