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

  it('honours a per-block theme from the fence info and marks it explicit', () => {
    const md = '```python theme=yuque-light\nx = 1\n```\n';
    const html = renderMarkdown(md);
    expect(html).toContain('data-code-theme="yuque-light"');
    expect(html).toContain('data-code-theme-explicit="true"');
    expect(html).toContain('Yuque Light');
  });

  it('omits the explicit marker when no per-block theme is set', () => {
    const md = '```python\nx = 1\n```\n';
    const html = renderMarkdown(md);
    expect(html).not.toContain('data-code-theme-explicit');
  });

  it('emits data-mermaid-theme on a mermaid block pinned via the fence', () => {
    const md = '```mermaid mtheme=forest\nflowchart TD\nA-->B\n```\n';
    const html = renderMarkdown(md);
    expect(html).toContain('jz-code-mermaid');
    expect(html).toContain('data-mermaid-theme="forest"');
  });

  it('omits data-mermaid-theme when the diagram follows the document theme', () => {
    const md = '```mermaid\nflowchart TD\nA-->B\n```\n';
    const html = renderMarkdown(md);
    expect(html).not.toContain('data-mermaid-theme');
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
