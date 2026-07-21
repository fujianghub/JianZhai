// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import LongImageEnhancer from './LongImageEnhancer';

// React 18 requires this flag to use act() outside its own test renderer.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

function renderEnhancer(bindKey: unknown, enabled = true) {
  act(() => {
    root.render(
      createElement(LongImageEnhancer, {
        selector: '.jz-post-article',
        bindKey,
        enabled,
      }),
    );
  });
}

/** happy-dom 无真实布局：分类所需的全部尺寸都以实例属性桩入。 */
function stubImg(
  img: HTMLImageElement,
  { w, h, complete = true }: { w: number; h: number; complete?: boolean },
) {
  Object.defineProperty(img, 'naturalWidth', { value: w, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: h, configurable: true });
  Object.defineProperty(img, 'complete', { value: complete, configurable: true });
}

/** 正文异步落地（Spin 之后才有容器）——与 useImageLightbox.dom.test 同一套路。 */
function injectArticle(inner: string): HTMLElement {
  const article = document.createElement('div');
  article.className = 'jz-post-article';
  article.innerHTML = inner;
  // 容器内容宽 800px；视口高 1000px → 限高 700px
  Object.defineProperty(article, 'clientWidth', { value: 800, configurable: true });
  document.body.appendChild(article);
  return article;
}

beforeEach(() => {
  document.body.innerHTML = '';
  Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

describe('LongImageEnhancer（长图限高三段式）', () => {
  it('folded 包折叠容器、capped 只打居中类、普通图不动', () => {
    const article = injectArticle(
      '<img id="long" src="/m/long.png" alt="长图" />' +
        '<img id="tall" src="/m/tall.png" alt="竖图" />' +
        '<img id="plain" src="/m/plain.png" alt="横图" />',
    );
    stubImg(article.querySelector('#long')!, { w: 750, h: 8000 }); // cappedW≈66 → folded
    stubImg(article.querySelector('#tall')!, { w: 900, h: 1800 }); // cappedW=350 → capped
    stubImg(article.querySelector('#plain')!, { w: 1600, h: 1200 }); // renderH=600 → none
    renderEnhancer('v1');

    const long = document.querySelector('#long')!;
    const wrapper = long.closest('.jz-longimg')!;
    expect(wrapper).not.toBeNull();
    expect(wrapper.classList.contains('is-collapsed')).toBe(true);
    expect(long.parentElement?.classList.contains('jz-longimg-clip')).toBe(true);
    expect(long.classList.contains('jz-longimg-img')).toBe(true);
    const btn = wrapper.querySelector('.jz-longimg-toggle')!;
    expect(btn.textContent).toBe('展开长图');
    expect(btn.getAttribute('aria-expanded')).toBe('false');

    const tall = document.querySelector('#tall')!;
    expect(tall.classList.contains('jz-img-capped')).toBe(true);
    expect(tall.closest('.jz-longimg')).toBeNull();

    const plain = document.querySelector('#plain')!;
    expect(plain.classList.contains('jz-img-capped')).toBe(false);
    expect(plain.closest('.jz-longimg')).toBeNull();
  });

  it('幂等：同一 DOM 上重复增强只有一层 wrapper', () => {
    const article = injectArticle('<img src="/m/long.png" alt="长图" />');
    stubImg(article.querySelector('img')!, { w: 750, h: 8000 });
    renderEnhancer('v1');
    renderEnhancer('v2'); // bindKey 变但 DOM 未重渲（模拟 effect 重跑）

    expect(document.querySelectorAll('.jz-longimg').length).toBe(1);
    expect(document.querySelectorAll('.jz-longimg .jz-longimg').length).toBe(0);
  });

  it('点击按钮展开/收起：类、文案、aria 同步翻转', () => {
    const article = injectArticle('<img src="/m/long.png" alt="长图" />');
    stubImg(article.querySelector('img')!, { w: 750, h: 8000 });
    renderEnhancer('v1');

    const wrapper = document.querySelector('.jz-longimg')!;
    const btn = wrapper.querySelector<HTMLButtonElement>('.jz-longimg-toggle')!;

    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(wrapper.classList.contains('is-collapsed')).toBe(false);
    expect(btn.textContent).toBe('收起');
    expect(btn.getAttribute('aria-expanded')).toBe('true');

    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(wrapper.classList.contains('is-collapsed')).toBe(true);
    expect(btn.textContent).toBe('展开长图');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('豁免：带 width 属性（作者手动尺寸）与 <a> 内图片不处理', () => {
    const article = injectArticle(
      '<img id="manual" src="/m/long.png" width="400" alt="手动尺寸" />' +
        '<a href="/x"><img id="linked" src="/m/long2.png" alt="链接图" /></a>',
    );
    stubImg(article.querySelector('#manual')!, { w: 750, h: 8000 });
    stubImg(article.querySelector('#linked')!, { w: 750, h: 8000 });
    renderEnhancer('v1');

    expect(document.querySelector('.jz-longimg')).toBeNull();
    expect(document.querySelectorAll('.jz-img-capped').length).toBe(0);
  });

  it('lazy 图：load 落地后才分类包裹', () => {
    const article = injectArticle('<img src="/m/lazy.png" alt="懒加载长图" />');
    const img = article.querySelector<HTMLImageElement>('img')!;
    stubImg(img, { w: 0, h: 0, complete: false });
    renderEnhancer('v1');
    expect(document.querySelector('.jz-longimg')).toBeNull();

    stubImg(img, { w: 750, h: 8000, complete: true });
    act(() => {
      img.dispatchEvent(new Event('load'));
    });
    expect(img.closest('.jz-longimg')).not.toBeNull();
  });

  it('enabled=false：unwrap 干净还原（开关关闭时 html 不变、DOM 存活）', () => {
    const article = injectArticle(
      '<p id="para"><img id="long" src="/m/long.png" alt="长图" /></p>' +
        '<img id="tall" src="/m/tall.png" alt="竖图" />',
    );
    Object.defineProperty(article.querySelector('#para')!, 'clientWidth', {
      value: 800,
      configurable: true,
    });
    stubImg(article.querySelector('#long')!, { w: 750, h: 8000 });
    stubImg(article.querySelector('#tall')!, { w: 900, h: 1800 });
    renderEnhancer('v1');
    expect(document.querySelector('.jz-longimg')).not.toBeNull();

    renderEnhancer('v1', false);
    expect(document.querySelector('.jz-longimg')).toBeNull();
    expect(document.querySelectorAll('.jz-img-capped').length).toBe(0);
    const long = document.querySelector('#long')!;
    expect(long.classList.contains('jz-longimg-img')).toBe(false);
    // 图回到原来的 <p> 里
    expect(long.parentElement?.id).toBe('para');
  });
});
