import { describe, it, expect } from 'vitest';
import { renderMarkdownWithToc } from './markdown';

/** Rendered <img> tags must drop the referer so anti-hotlinking CDNs (Yuque's
 *  cdn.nlark.com 403s a foreign Referer) still serve the image until the backend
 *  mirrors it to local /media. loading/decoding hints ride along. */
describe('rendered image attributes', () => {
  it('adds referrerpolicy=no-referrer + lazy loading to remote images', () => {
    const src = `![alt](https://cdn.nlark.com/yuque/0/x.png)`;
    const { html } = renderMarkdownWithToc(src);
    expect(html).toContain('referrerpolicy="no-referrer"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
  });

  it('also applies to local /media images (harmless, same-origin)', () => {
    const src = `![alt](/media/uploads/2026/07/x.png)`;
    const { html } = renderMarkdownWithToc(src);
    expect(html).toContain('referrerpolicy="no-referrer"');
  });
});
