import { describe, it, expect } from 'vitest';
import { renderMarkdownWithToc } from './markdown';

/** Pull the list of anchor hrefs out of a rendered ``.jz-inline-toc`` block. */
function tocLinks(html: string): string[] {
  return Array.from(html.matchAll(/<a href="#([^"]+)"/g)).map((m) => m[1]);
}

describe('[TOC] whole-document table of contents', () => {
  it('lists every heading', () => {
    const src = `[TOC]\n\n# A\n\n## A1\n\n# B\n`;
    const { html } = renderMarkdownWithToc(src);
    expect(html).toContain('jz-inline-toc');
    expect(tocLinks(html)).toEqual(['a', 'a1', 'b']);
  });
});

describe('[TOC:section] section table of contents', () => {
  it('lists only the subtree under the enclosing heading', () => {
    // Section TOC sits under "A"; it should list A1, A2, A2a but NOT B / B1.
    const src = [
      '# A',
      '',
      '[TOC:section]',
      '',
      '## A1',
      '',
      '## A2',
      '',
      '### A2a',
      '',
      '# B',
      '',
      '## B1',
      '',
    ].join('\n');
    const { html } = renderMarkdownWithToc(src);
    expect(tocLinks(html)).toEqual(['a1', 'a2', 'a2a']);
  });

  it('coexists with a whole-doc [TOC] in the same document', () => {
    const src = [
      '[TOC]',
      '',
      '# A',
      '',
      '## A1',
      '',
      '# B',
      '',
      '[TOC:section]',
      '',
      '## B1',
      '',
      '## B2',
      '',
    ].join('\n');
    const { html } = renderMarkdownWithToc(src);
    const blocks = html.split('jz-inline-toc-title');
    // First TOC block (whole doc) lists every heading.
    expect(tocLinks(blocks[1])).toEqual(['a', 'a1', 'b', 'b1', 'b2']);
    // Second TOC block (section under B) lists only B's children.
    expect(tocLinks(blocks[2])).toEqual(['b1', 'b2']);
  });

  it('numbers section entries when numbering is enabled', () => {
    const src = `# A\n\n[TOC:section]\n\n## A1\n\n## A2\n`;
    const { html } = renderMarkdownWithToc(src, { numbering: true });
    expect(html).toContain('<span class="jz-toc-num">1.1</span>');
    expect(html).toContain('<span class="jz-toc-num">1.2</span>');
  });
});
