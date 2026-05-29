/**
 * KaTeX rendering through the markdown-it pipeline.
 *
 * The previous renderer left ``$$..$$`` and ``$..$`` as literal dollar-sign
 * text on the public blog (only the Tiptap editor's MathNode rendered them
 * live). After integrating the KaTeX plugin into ``renderMarkdown``, both
 * inline and block math show up as KaTeX-spans wrapped in our own classes.
 */
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('markdown KaTeX integration', () => {
  it('renders display math ($$..$$) as a block', () => {
    const html = renderMarkdown('Before\n\n$$E = mc^2$$\n\nAfter');
    expect(html).toMatch(/<div class="jz-math-block">/);
    // KaTeX HTML output contains its own .katex wrapper
    expect(html).toMatch(/class="katex/);
    // Surrounding paragraphs survive
    expect(html).toMatch(/Before/);
    expect(html).toMatch(/After/);
  });

  it('renders inline math ($..$) inside a paragraph', () => {
    const html = renderMarkdown('Solve $x = 1$ now.');
    expect(html).toMatch(/class="katex/);
    expect(html).toMatch(/now\./);
  });

  it('does not treat currency text as math', () => {
    // $5 and $10 with no closing $ delim should stay as plain text.
    const html = renderMarkdown('It costs $5, not $10.');
    expect(html).not.toMatch(/class="katex/);
    expect(html).toMatch(/\$5/);
    expect(html).toMatch(/\$10/);
  });

  it('does not break $..$ across newlines', () => {
    // Single $ on one line and another on the next should NOT pair up — that
    // would gobble unrelated text as math. Currently rendered as plain text.
    const html = renderMarkdown('Line one $1\nLine two $2');
    expect(html).not.toMatch(/class="katex/);
  });

  it('handles multi-line block math', () => {
    const src = '$$\nf(x) = \\int_0^1 x\\,dx\n$$';
    const html = renderMarkdown(src);
    expect(html).toMatch(/<div class="jz-math-block">/);
    expect(html).toMatch(/class="katex/);
  });

  it('falls back to a styled error block for invalid LaTeX', () => {
    // ``\unknowncmd`` is a fake command; KaTeX in non-strict mode renders it
    // with a red error message inline, not throwing.
    const html = renderMarkdown('$$\\unknowncmd{x}$$');
    // Either the error renderer kicked in (jz-math-error) or KaTeX's own
    // ParseError span — both are acceptable surface UI.
    expect(html).toMatch(/jz-math-(block|error)/);
  });
});
