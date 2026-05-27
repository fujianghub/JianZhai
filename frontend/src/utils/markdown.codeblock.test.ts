import { describe, expect, it } from 'vitest';
import { normalizeLanguage } from './codeBlocks';
import { renderMarkdown } from './markdown';

describe('renderMarkdown fenced code Yuque chrome', () => {
  it('emits block shell, default One Dark Pro theme label, hljs markup', () => {
    const md = "```python\n# 中文注释\nx = 1\n```\n";
    const html = renderMarkdown(md);
    expect(html).toContain('jz-code-block');
    expect(html).toContain('data-code-theme="one-dark-pro"');
    expect(html).toContain('jz-code-toolbar');
    expect(html).toContain('jz-code-theme-label');
    expect(html).toContain('One Dark Pro');
    expect(html).toContain('Python');
    expect(html).toContain('代码块');
    expect(html).toContain('hljs');
    expect(html).toContain('jz-code-lang');
    expect(html).toMatch(/hljs-comment|hljs-keyword|hljs-number/);
  });

  it('normalizes py alias like editor highlighter path', () => {
    expect(normalizeLanguage('py')).toBe('python');
  });

  it('does not insert newline text nodes between .jz-code-line spans', () => {
    const md = '```python\na = 1\nb = 2\n```\n';
    const html = renderMarkdown(md);
    expect(html).not.toContain('</span>\n<span class="jz-code-line">');
    expect(html).toContain('</span><span class="jz-code-line">');
  });
});
