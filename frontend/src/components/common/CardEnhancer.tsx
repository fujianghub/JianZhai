/**
 * 阅读端卡片水合器（selector+bindKey 范式，与 ImageLightboxEnhancer /
 * TableEnhancer 同构 —— 勿改回依赖 containerRef 的写法，正文异步落地前
 * ref 为 null 会导致 effect 永不重绑，见 CLAUDE.md 陷阱）。
 *
 * - `div[data-jz-link-card]`：取 link-preview OG 元数据，把静态壳
 *   （域名 + URL）升级为完整卡片（favicon/站名/标题/描述）。匿名或
 *   闸门拦截（401/403）→ 保持静态壳优雅降级。
 * - `div[data-jz-doc-card]`：按 id 解析公开文章，把「📄 文档卡片 #ID」
 *   换成真实标题并指向 /posts/:slug；解析失败（草稿/不可见）保持原样。
 */
import { useEffect } from 'react';
import { getLinkPreview } from '@/api/linkPreview';
import { resolvePublicById } from '@/api/linking';
import { postReadHref } from '@/utils/docLinks';

function hydrateLinkCard(el: HTMLElement): void {
  const url = el.dataset.url || '';
  if (!url || el.dataset.jzHydrated) return;
  el.dataset.jzHydrated = '1';
  getLinkPreview(url)
    .then((data) => {
      if (!el.isConnected) return;
      const a = document.createElement('a');
      a.className = 'jz-link-card-shell';
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';

      const text = document.createElement('div');
      text.className = 'jz-link-card-text';

      const site = document.createElement('div');
      site.className = 'jz-link-card-site';
      if (data.favicon) {
        const icon = document.createElement('img');
        icon.className = 'jz-link-card-favicon';
        icon.src = data.favicon;
        icon.alt = '';
        icon.referrerPolicy = 'no-referrer';
        icon.onerror = () => {
          icon.style.display = 'none';
        };
        site.appendChild(icon);
      }
      const siteName = document.createElement('span');
      siteName.className = 'jz-link-card-site-name';
      siteName.textContent = data.site_name || new URL(url).hostname;
      site.appendChild(siteName);
      text.appendChild(site);

      const title = document.createElement('div');
      title.className = 'jz-link-card-title';
      title.textContent = data.title || url;
      text.appendChild(title);

      if (data.description) {
        const desc = document.createElement('div');
        desc.className = 'jz-link-card-desc';
        desc.textContent = data.description;
        text.appendChild(desc);
      }

      const urlRow = document.createElement('div');
      urlRow.className = 'jz-link-card-url';
      urlRow.textContent = url;
      text.appendChild(urlRow);

      a.appendChild(text);
      el.replaceChildren(a);
    })
    .catch(() => {
      // 匿名 401 / 闸门 403 / 网络失败：保持静态壳
      delete el.dataset.jzHydrated;
    });
}

function hydrateDocCard(el: HTMLElement): void {
  const anchor = el.querySelector<HTMLAnchorElement>('a[data-doc-id]');
  const id = Number(anchor?.dataset.docId || el.dataset.docId || 0);
  if (!anchor || !id || el.dataset.jzHydrated) return;
  el.dataset.jzHydrated = '1';
  resolvePublicById(id)
    .then((post) => {
      if (!anchor.isConnected || !post?.title) return;
      anchor.textContent = `📄 ${post.title}`;
      if (post.slug) anchor.href = postReadHref(post.slug);
    })
    .catch(() => {
      delete el.dataset.jzHydrated;
    });
}

export default function CardEnhancer({
  selector,
  bindKey,
}: {
  selector: string;
  bindKey: unknown;
}) {
  useEffect(() => {
    const container = document.querySelector(selector);
    if (!container) return;
    container
      .querySelectorAll<HTMLElement>('div[data-jz-link-card]')
      .forEach(hydrateLinkCard);
    container
      .querySelectorAll<HTMLElement>('div[data-jz-doc-card]')
      .forEach(hydrateDocCard);
  }, [selector, bindKey]);
  return null;
}
