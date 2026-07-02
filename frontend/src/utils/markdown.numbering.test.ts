import { describe, it, expect } from 'vitest';
import { renderMarkdownWithToc } from './markdown';

const DOC = `# 引言\n\ntext\n\n## 背景\n\ntext\n\n#### 细节\n\ntext\n\n# 结论\n`;

describe('renderMarkdownWithToc — heading numbering (display layer)', () => {
  it('injects hierarchical numbers into headings + TOC when enabled', () => {
    const { html, toc } = renderMarkdownWithToc(DOC, { numbering: true });
    // Compacted numbering: h1,h2,h4,h1 → 1,1.1,1.1.1,2
    expect(toc.map((t) => t.numbering)).toEqual(['1', '1.1', '1.1.1', '2']);
    expect(html).toContain('<span class="jz-heading-num">1.1</span>');
    expect(html).toContain('<span class="jz-heading-num">1.1.1</span>');
  });

  it('leaves headings clean when numbering is disabled', () => {
    const { html, toc } = renderMarkdownWithToc(DOC, { numbering: false });
    expect(html).not.toContain('jz-heading-num');
    expect(toc.every((t) => t.numbering === undefined)).toBe(true);
  });

  it('does not let the numbering flag collide in the LRU cache', () => {
    // Same source, both flag states — must return distinct renders.
    const on = renderMarkdownWithToc(DOC, { numbering: true });
    const off = renderMarkdownWithToc(DOC, { numbering: false });
    expect(on.html).toContain('jz-heading-num');
    expect(off.html).not.toContain('jz-heading-num');
  });

  it('expands [TOC] with numbers when enabled', () => {
    const src = `[TOC]\n\n# 一\n\n## 二\n`;
    const { html } = renderMarkdownWithToc(src, { numbering: true });
    expect(html).toContain('jz-inline-toc');
    expect(html).toContain('<span class="jz-toc-num">1</span>');
    expect(html).toContain('<span class="jz-toc-num">1.1</span>');
  });
});
