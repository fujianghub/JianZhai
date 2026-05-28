/** Update document title and Open Graph / canonical meta for SPA blog pages. */

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function upsertLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

export interface PageMetaOptions {
  title: string;
  description?: string;
  canonicalPath?: string;
  ogType?: 'website' | 'article';
  ogImage?: string;
}

const DEFAULT_TITLE = '简斋 / JianZhai';
const DEFAULT_DESC =
  '个人知识库 + 公开博客，一份内容既是私人笔记也是发布的文章。';

export function applyPageMeta(opts: PageMetaOptions) {
  const title = opts.title.trim() || DEFAULT_TITLE;
  document.title = title;
  const desc = (opts.description || DEFAULT_DESC).slice(0, 300);
  upsertMeta('name', 'description', desc);
  upsertMeta('property', 'og:title', title);
  upsertMeta('property', 'og:description', desc);
  upsertMeta('property', 'og:type', opts.ogType ?? 'website');
  upsertMeta('property', 'og:site_name', '简斋 / JianZhai');
  // Twitter Card — `summary_large_image` if we have a hero image, else
  // `summary`. The crawler reads both `og:*` and `twitter:*` but having the
  // explicit Twitter tags increases the chance of a rich preview on X / chat
  // apps that look at twitter:card specifically.
  upsertMeta('name', 'twitter:card', opts.ogImage ? 'summary_large_image' : 'summary');
  upsertMeta('name', 'twitter:title', title);
  upsertMeta('name', 'twitter:description', desc);
  if (opts.canonicalPath) {
    const canonical = new URL(opts.canonicalPath, window.location.origin).href;
    upsertLink('canonical', canonical);
    upsertMeta('property', 'og:url', canonical);
  }
  if (opts.ogImage) {
    upsertMeta('property', 'og:image', opts.ogImage);
    upsertMeta('name', 'twitter:image', opts.ogImage);
  }
}

export function resetPageMeta() {
  applyPageMeta({ title: DEFAULT_TITLE, description: DEFAULT_DESC, ogType: 'website' });
}
