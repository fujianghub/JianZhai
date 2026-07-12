// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ImageLightboxEnhancer from './useImageLightbox';

// React 18 requires this flag to use act() outside its own test renderer.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement; // React root for the (null-rendering) enhancer
let root: Root;

function renderEnhancer(bindKey: unknown) {
  act(() => {
    root.render(
      createElement(ImageLightboxEnhancer, { selector: '.jz-post-article', bindKey }),
    );
  });
}

function dblclick(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

/** Simulate the real reader lifecycle: the article HTML is injected *after*
 *  an async fetch, so the container does not exist at the enhancer's first
 *  mount. The regression this guards: a `[containerRef]`-keyed effect binds
 *  once against a null container and never rebinds, silently disabling zoom. */
function injectArticle(inner: string) {
  const article = document.createElement('div');
  article.className = 'jz-post-article';
  article.innerHTML = inner;
  document.body.appendChild(article);
}

describe('ImageLightboxEnhancer (double-click image preview)', () => {
  it('binds after the article mounts async and opens an overlay on dblclick', () => {
    // 1. Enhancer mounts while the article is still absent (Spin phase).
    renderEnhancer('v1-empty');
    expect(document.querySelector('.jz-post-article')).toBeNull();

    // 2. Article HTML lands; the reader re-renders the enhancer with new html.
    injectArticle('<p>hi</p><img src="/media/pic.png" alt="示意图" />');
    renderEnhancer('v2-loaded');

    // 3. Double-clicking the image opens the lightbox overlay.
    const img = document.querySelector('.jz-post-article img')!;
    dblclick(img);

    const overlay = document.querySelector('.jz-lightbox.jz-image-lightbox');
    expect(overlay).not.toBeNull();
    // happy-dom resolves img.src to an absolute URL; the hook copies the
    // resolved src onto the overlay image, so match on the suffix.
    expect(
      overlay!.querySelector('img.jz-image-lightbox-img')?.getAttribute('src'),
    ).toMatch(/\/media\/pic\.png$/);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('closes on Escape and restores scroll', () => {
    injectArticle('<img src="/media/a.png" alt="a" />');
    renderEnhancer('loaded');
    dblclick(document.querySelector('.jz-post-article img')!);
    expect(document.querySelector('.jz-image-lightbox')).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(document.querySelector('.jz-image-lightbox')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('skips images wrapped in a link and data-no-lightbox opt-outs', () => {
    injectArticle(
      '<a href="/x"><img src="/media/link.png" alt="l" /></a>' +
        '<img src="/media/skip.png" data-no-lightbox="true" alt="s" />',
    );
    renderEnhancer('loaded');

    document
      .querySelectorAll('.jz-post-article img')
      .forEach((img) => dblclick(img));

    expect(document.querySelector('.jz-image-lightbox')).toBeNull();
  });
});
