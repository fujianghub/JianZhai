/**
 * 布局容器 / 块级占位符的 preprocess 转换与端到端渲染。
 *
 * 历史 bug 组：
 *   - catch-all callout 容器吞掉 :::details / :::cols-N / :::tabs（摘要丢失、
 *     分栏塌缩、标签页变 callout）
 *   - ::col / ::tab 只有 2 个冒号，markdown-it-container 永不可解析
 *   - [TOC] / [[doc-card:ID]] 的 parse 为空，重载后退化为字面文本
 *   - 管道表格走独立 tableMd 实例，表格内 $..$ 公式与 doc:N 链接失效
 */
import { describe, expect, it } from 'vitest';
import {
  convertBlockPlaceholders,
  convertLayoutBlocks,
  preprocessMarkdown,
  renderMarkdown,
  renderMarkdownWithToc,
} from './markdown';

describe('convertLayoutBlocks — :::details', () => {
  it('converts to <details>/<summary> with body wrapper', () => {
    const out = convertLayoutBlocks(':::details 点开看\n隐藏内容\n:::');
    expect(out).toContain('<details class="jz-details-block">');
    expect(out).toContain('<summary>点开看</summary>');
    expect(out).toContain('<div class="jz-details-body">');
    expect(out).toContain('隐藏内容');
    expect(out).toContain('</div></details>');
  });

  it('defaults the summary when omitted', () => {
    const out = convertLayoutBlocks(':::details\n正文\n:::');
    expect(out).toContain('<summary>详细内容</summary>');
  });

  it('escapes HTML in the summary', () => {
    const out = convertLayoutBlocks(':::details <b>x</b>\n正文\n:::');
    expect(out).toContain('<summary>&lt;b&gt;x&lt;/b&gt;</summary>');
  });

  it('leaves an unterminated fence untouched', () => {
    const src = ':::details 没有收尾\n内容';
    expect(convertLayoutBlocks(src)).toBe(src);
  });

  it('keeps nested callouts inside the body as markdown', () => {
    const out = convertLayoutBlocks(':::details 外\n:::info\n提示\n:::\n:::');
    expect(out).toContain(':::info');
    expect(out).toContain('</div></details>');
  });
});

describe('convertLayoutBlocks — :::cols-N', () => {
  it('splits on top-level ::col into column divs', () => {
    const out = convertLayoutBlocks(':::cols-2\n左边\n::col\n右边\n:::');
    expect(out).toContain('data-jz-columns');
    expect(out).toContain('jz-columns-2');
    expect((out.match(/data-jz-column=""/g) || []).length).toBe(2);
    expect(out).toContain('左边');
    expect(out).toContain('右边');
    expect(out).not.toContain('::col');
  });

  it('does not split on ::col nested inside an inner container', () => {
    const out = convertLayoutBlocks(
      ':::cols-2\n甲\n:::info\n::col\n:::\n::col\n乙\n:::',
    );
    // 内层 callout 里的 ::col 保留为字面文本，只有顶层那个分列
    expect((out.match(/data-jz-column=""/g) || []).length).toBe(2);
    expect(out).toContain('::col');
  });

  it('pads a single column to the schema minimum of 2', () => {
    const out = convertLayoutBlocks(':::cols-2\n只有一列\n:::');
    expect((out.match(/data-jz-column=""/g) || []).length).toBe(2);
  });
});

describe('convertLayoutBlocks — :::tabs', () => {
  it('splits ::tab Label into labelled panels', () => {
    const out = convertLayoutBlocks(
      ':::tabs\n::tab 安装\npnpm install\n::tab 运行\npnpm dev\n:::',
    );
    expect(out).toContain('data-jz-tabs');
    expect((out.match(/data-jz-tab-panel=""/g) || []).length).toBe(2);
    expect(out).toContain('data-label="安装"');
    expect(out).toContain('data-label="运行"');
    expect(out).toContain('jz-tab-panel-label');
    expect(out).toContain('jz-tab-panel-body');
    expect(out).not.toContain('::tab');
  });

  it('escapes quotes in tab labels', () => {
    const out = convertLayoutBlocks(':::tabs\n::tab a"b\nx\n:::');
    expect(out).toContain('data-label="a&quot;b"');
  });
});

describe('convertBlockPlaceholders', () => {
  it('converts whole-line [TOC] to the placeholder div', () => {
    const out = convertBlockPlaceholders('前言\n\n[TOC]\n\n正文');
    expect(out).toContain('<div data-jz-toc=""');
  });

  it('ignores inline [TOC] mentions', () => {
    const out = convertBlockPlaceholders('句中提到 [TOC] 不转换');
    expect(out).not.toContain('data-jz-toc');
  });

  it('converts [[doc-card:N]] to a doc-card div with link', () => {
    const out = convertBlockPlaceholders('[[doc-card:42]]');
    expect(out).toContain('data-jz-doc-card=""');
    expect(out).toContain('data-doc-id="42"');
    expect(out).toContain('href="/d/42"');
  });
});

describe('preprocessMarkdown integration', () => {
  it('does not convert layout fences inside code blocks', () => {
    const src = '```\n:::details 示例\n:::\n```';
    const out = preprocessMarkdown(src);
    expect(out).toContain(':::details 示例');
    expect(out).not.toContain('<details');
  });

  it('runs layout conversion before pipe-table conversion', () => {
    const src = ':::details 表\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n:::';
    const out = preprocessMarkdown(src);
    expect(out).toContain('<details');
    expect(out).toContain('jz-table-wrap');
  });
});

describe('rendered output (blog reader path)', () => {
  it(':::details renders as <details>, NOT a callout', () => {
    const html = renderMarkdown(':::details 点开\n秘密\n:::');
    expect(html).toContain('<details');
    expect(html).toContain('<summary>点开</summary>');
    expect(html).not.toContain('jz-callout-details');
  });

  it(':::cols-2 renders columns, NOT a callout', () => {
    const html = renderMarkdown(':::cols-2\n左\n::col\n右\n:::');
    expect(html).toContain('jz-columns-2');
    expect(html).not.toContain('jz-callout-cols-2');
  });

  it(':::tabs renders panels, NOT a callout', () => {
    const html = renderMarkdown(':::tabs\n::tab 甲\n一\n::tab 乙\n二\n:::');
    expect(html).toContain('jz-tab-panel');
    expect(html).not.toContain('jz-callout-tabs');
  });

  it('normal callouts still work', () => {
    const html = renderMarkdown(':::info\n提示内容\n:::');
    expect(html).toContain('jz-callout-info');
  });

  it('[TOC] expands into a heading list with anchors', () => {
    const { html } = renderMarkdownWithToc('[TOC]\n\n# 甲\n\n## 乙');
    expect(html).toContain('jz-inline-toc');
    expect(html).toContain('目录');
    expect(html).toMatch(/<a href="#[^"]*">甲<\/a>/);
    expect(html).not.toContain('[TOC]');
  });

  it('[TOC] with no headings is removed, not left literal', () => {
    const { html } = renderMarkdownWithToc('[TOC]\n\n没有标题的正文');
    expect(html).not.toContain('[TOC]');
    expect(html).not.toContain('jz-inline-toc-placeholder');
  });

  it('[[doc-card:N]] renders a /d/N link', () => {
    const html = renderMarkdown('[[doc-card:7]]');
    expect(html).toContain('href="/d/7"');
    expect(html).not.toContain('[[doc-card');
  });
});

describe('pipe tables — inline features inside cells', () => {
  it('renders $..$ math inside a pipe table', () => {
    const html = renderMarkdown('| 式 |\n| --- |\n| $x^2$ |');
    expect(html).toContain('jz-table-wrap');
    expect(html).toContain('katex');
    expect(html).not.toContain('$x^2$');
  });

  it('rewrites doc:N links inside a pipe table', () => {
    const html = renderMarkdown('| 链 |\n| --- |\n| [文](doc:5) |');
    expect(html).toContain('href="/d/5"');
    expect(html).toContain('doc-link');
  });
});
