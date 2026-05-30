/**
 * Cache-behaviour smoke tests for ``renderMarkdownWithToc``.
 *
 * The LRU cache is the perf optimisation behind PostDetail's
 * ``useMemo(() => renderMarkdownWithToc(post.published_content), [post])`` —
 * background refetches that don't change the byte stream still trigger a
 * re-render, and without the cache each would re-parse the entire post.
 *
 * We can't easily measure timing in a unit test, so we assert the cache's
 * **identity contract**: same input ⇒ same returned object reference; size
 * cap evicts oldest; cache-miss after eviction returns a fresh object.
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdownWithToc } from './markdown';

describe('renderMarkdownWithToc — LRU cache', () => {
  it('returns the same object reference for identical input', () => {
    const src = '# Heading one\n\nBody paragraph.';
    const a = renderMarkdownWithToc(src);
    const b = renderMarkdownWithToc(src);
    expect(b).toBe(a);
  });

  it('returns different references for different input', () => {
    const a = renderMarkdownWithToc('# A');
    const b = renderMarkdownWithToc('# B');
    expect(a).not.toBe(b);
    expect(a.html).not.toEqual(b.html);
  });

  it('evicts the oldest entry after RENDER_CACHE_MAX=20 unique inputs', () => {
    // Hit 21 unique inputs so the first one falls out.
    const first = renderMarkdownWithToc('# entry-0');
    for (let i = 1; i < 21; i++) {
      renderMarkdownWithToc(`# entry-${i}`);
    }
    // The first entry must now be re-computed (returns a new object).
    const refetchedFirst = renderMarkdownWithToc('# entry-0');
    expect(refetchedFirst).not.toBe(first);
    // …but it must still produce the SAME HTML (cache correctness).
    expect(refetchedFirst.html).toEqual(first.html);
  });

  it('handles empty source without crashing', () => {
    const result = renderMarkdownWithToc('');
    expect(result.html).toBe('');
    expect(result.toc).toEqual([]);
  });

  it('handles undefined / null gracefully', () => {
    // The function signature is ``string`` but JS callers can still pass
    // ``undefined`` via ``post?.published_content``. We guard with ``?? ''``.
    const result = renderMarkdownWithToc(undefined as unknown as string);
    expect(result.html).toBe('');
    expect(result.toc).toEqual([]);
  });
});
