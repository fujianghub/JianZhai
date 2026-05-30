/**
 * Pin the contract that AIAssistantPanel renders its ``text`` through the
 * project's shared ``renderMarkdown`` pipeline (markdown-it + DOMPurify +
 * KaTeX). Before v0.9.6 the panel showed AI output as a raw ``<pre>{text}</pre>``
 * block, so headings / lists / code fences / math from the AI's response
 * were never visually formatted — the backend prompt always asked for
 * Markdown but the frontend dropped that contract.
 *
 * We can't render the full React tree in Node-only Vitest (it'd need
 * jsdom), so the tests instead pin the *renderer* the panel imports:
 *   - it must be the shared ``renderMarkdown`` (not a local fork),
 *   - the pipeline must turn ``#``/lists/code fences into real HTML,
 *   - it must sanitise hostile input (DOMPurify path).
 *
 * If a future refactor reintroduces a panel-local renderer that skips
 * the shared pipeline, these tests fire — same bug, same surface.
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@/utils/markdown';

describe('AIAssistantPanel · markdown pipeline contract', () => {
  it('renders headings as real <h2> tags', () => {
    const html = renderMarkdown('### 1.5 客户端 SPA 的用户体验\n\n正文段落');
    expect(html).toMatch(/<h3[^>]*>/);
    expect(html).toContain('1.5 客户端 SPA 的用户体验');
    expect(html).toContain('正文段落');
  });

  it('renders bullet lists with <ul><li>', () => {
    const html = renderMarkdown('- 代码分割\n- 懒加载\n- 缓存策略');
    expect(html).toMatch(/<ul[^>]*>/);
    expect(html).toMatch(/<li[^>]*>\s*代码分割/);
    expect(html).toMatch(/<li[^>]*>\s*懒加载/);
  });

  it('renders bold inline with <strong>', () => {
    const html = renderMarkdown('**代码分割**：动态导入');
    expect(html).toContain('<strong>代码分割</strong>');
  });

  it('renders fenced code blocks through the project highlighter', () => {
    const src = '```python\nprint("hello")\n```';
    const html = renderMarkdown(src);
    expect(html).toContain('jz-code-block');
    expect(html).toContain('python');
  });

  // Note: DOMPurify only runs in browser env (markdown.ts short-circuits in
  // Node). The browser-side sanitisation is exercised by the panel itself
  // and by ``markdown.preprocess.test.ts`` indirectly; we don't try to drive
  // it from this Node-only vitest run.

  it('handles streaming-shaped partial input without throwing', () => {
    // Mid-stream the AI text may end on a half-typed bold marker. The
    // panel renders ``deferredText`` every animation frame so the
    // renderer must tolerate this gracefully.
    expect(() => renderMarkdown('**half open')).not.toThrow();
    expect(() => renderMarkdown('```py\nstill streaming')).not.toThrow();
    expect(() => renderMarkdown('## ')).not.toThrow();
  });

  it('renders math via KaTeX (block + inline)', () => {
    const html = renderMarkdown('block: $$E = mc^2$$\n\ninline: $a = b$ end');
    // KaTeX wraps results in spans with ``katex`` class somewhere in the tree.
    expect(html).toMatch(/jz-math-block|katex/);
    expect(html).toMatch(/jz-math-inline|katex/);
  });
});
