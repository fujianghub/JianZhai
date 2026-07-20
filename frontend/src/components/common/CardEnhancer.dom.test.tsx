// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/api/linkPreview', () => ({
  getLinkPreview: vi.fn(),
}));
vi.mock('@/api/linking', () => ({
  resolvePublicById: vi.fn(),
}));

import { getLinkPreview } from '@/api/linkPreview';
import { resolvePublicById } from '@/api/linking';
import CardEnhancer from './CardEnhancer';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let article: HTMLDivElement;
let root: Root;

function renderEnhancer(bindKey: unknown) {
  act(() => {
    root.render(createElement(CardEnhancer, { selector: '.jz-post-article', bindKey }));
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.mocked(getLinkPreview).mockReset();
  vi.mocked(resolvePublicById).mockReset();
  article = document.createElement('div');
  article.className = 'jz-post-article';
  document.body.appendChild(article);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  article.remove();
});

function linkCardShell(url: string): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-jz-link-card', '');
  el.dataset.url = url;
  el.className = 'jz-link-card';
  el.innerHTML = `<a class="jz-link-card-static" href="${url}"><span class="jz-link-card-title">${url}</span></a>`;
  article.appendChild(el);
  return el;
}

function docCardShell(id: number): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-jz-doc-card', '');
  el.dataset.docId = String(id);
  el.className = 'jz-doc-card';
  el.innerHTML = `<a class="doc-link" data-doc-id="${id}" href="/d/${id}">📄 文档卡片 #${id}</a>`;
  article.appendChild(el);
  return el;
}

describe('CardEnhancer', () => {
  it('hydrates link cards with OG metadata', async () => {
    vi.mocked(getLinkPreview).mockResolvedValue({
      url: 'https://github.com',
      title: 'GitHub',
      description: 'Where the world builds software',
      image: '',
      site_name: 'GitHub',
      favicon: '',
    });
    const el = linkCardShell('https://github.com');
    renderEnhancer('v1');
    await flush();
    expect(el.querySelector('.jz-link-card-title')?.textContent).toBe('GitHub');
    expect(el.querySelector('.jz-link-card-desc')?.textContent).toContain('builds software');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('https://github.com');
  });

  it('leaves the static shell untouched when preview fetch fails (401/403)', async () => {
    vi.mocked(getLinkPreview).mockRejectedValue(new Error('403'));
    const el = linkCardShell('https://x.com');
    renderEnhancer('v1');
    await flush();
    expect(el.querySelector('.jz-link-card-title')?.textContent).toBe('https://x.com');
    expect(el.dataset.jzHydrated).toBeUndefined();
  });

  it('hydrates doc cards with the resolved title and slug href', async () => {
    vi.mocked(resolvePublicById).mockResolvedValue({ id: 5, slug: 'my-post', title: '我的文章' });
    const el = docCardShell(5);
    renderEnhancer('v1');
    await flush();
    const a = el.querySelector('a')!;
    expect(a.textContent).toBe('📄 我的文章');
    expect(a.getAttribute('href')).toBe('/posts/my-post');
  });

  it('keeps the doc-card fallback when resolution fails (draft/invisible)', async () => {
    vi.mocked(resolvePublicById).mockRejectedValue(new Error('404'));
    const el = docCardShell(9);
    renderEnhancer('v1');
    await flush();
    expect(el.querySelector('a')?.textContent).toBe('📄 文档卡片 #9');
  });
});
