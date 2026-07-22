/**
 * LaTeX 反斜杠定界符归一化 + 行内数学输入/粘贴正则测试。
 *
 * 归一化镜像后端 ``markdown_preprocess.normalize_latex_delimiters``——两侧
 * 用例保持同构，改边界规则须两端同步。
 */
import { describe, expect, it } from 'vitest';
import { normalizeLatexDelimiters, preprocessMarkdown, renderMarkdown } from './markdown';
import {
  INLINE_MATH_INPUT_RE,
  INLINE_MATH_PASTE_RE,
} from '@/components/editor/mathPatterns';

describe('normalizeLatexDelimiters', () => {
  it('converts inline \\(..\\) to $..$', () => {
    expect(normalizeLatexDelimiters('设 \\(x^2 + y\\) 为…')).toBe('设 $x^2 + y$ 为…');
  });

  it('trims padding inside \\( x \\)', () => {
    expect(normalizeLatexDelimiters('\\( x \\)')).toBe('$x$');
  });

  it('converts multi-line \\[..\\] block to $$..$$', () => {
    expect(normalizeLatexDelimiters('\\[\nE=mc^2\n\\]')).toBe('$$\nE=mc^2\n$$');
  });

  it('converts single-line \\[ .. \\] block', () => {
    expect(normalizeLatexDelimiters('\\[ E=mc^2 \\]')).toBe('$$\nE=mc^2\n$$');
  });

  it('leaves escaped brackets mid-text alone', () => {
    const src = '这是 \\[不是链接\\] 的写法';
    expect(normalizeLatexDelimiters(src)).toBe(src);
  });

  it('leaves \\(..\\) inside inline code alone', () => {
    const src = '行内代码 `\\(x\\)` 保持字面';
    expect(normalizeLatexDelimiters(src)).toBe(src);
  });

  it('is fence-protected via preprocessMarkdown', () => {
    const out = preprocessMarkdown('```\n\\(x\\)\n\\[y\\]\n```\n');
    expect(out).not.toContain('$');
  });

  it('renders normalized delimiters as KaTeX through the reading pipeline', () => {
    const html = renderMarkdown('圆面积 \\(\\pi r^2\\)：\n\n\\[\nA = \\pi r^2\n\\]\n');
    expect(html).toContain('katex');
    expect(html).toContain('jz-math-block');
  });
});

describe('INLINE_MATH_INPUT_RE（打完闭合 $ 触发）', () => {
  const matches = (s: string) => INLINE_MATH_INPUT_RE.exec(s);

  it('matches $x$ at end of typed text (single char)', () => {
    expect(matches('$x$')?.[1]).toBe('x');
  });

  it('matches $a_1+b$ with preceding text', () => {
    expect(matches('设 $a_1+b$')?.[1]).toBe('a_1+b');
  });

  it('rejects currency: digit before opening $', () => {
    expect(matches('价格 5$ 到 10$')).toBeNull();
  });

  it('rejects whitespace-padded content', () => {
    expect(matches('$ x $')).toBeNull();
    expect(matches('$x $')).toBeNull();
  });

  it('rejects escaped \\$ opener', () => {
    expect(matches('\\$x$')).toBeNull();
  });

  it('rejects $$ block form', () => {
    expect(matches('$$x$')).toBeNull();
  });
});

describe('INLINE_MATH_PASTE_RE', () => {
  const all = (s: string) => [...s.matchAll(INLINE_MATH_PASTE_RE)].map((m) => m[1]);

  it('extracts multiple formulas from pasted text', () => {
    expect(all('有 $a_1$ 与 $b_2$ 两式')).toEqual(['a_1', 'b_2']);
  });

  it('skips currency ranges', () => {
    expect(all('从 5$ 到 10$，约 $8 上下')).toEqual([]);
  });
});
