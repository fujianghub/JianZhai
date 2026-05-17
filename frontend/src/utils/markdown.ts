import MarkdownIt from 'markdown-it';

export const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

// Override link rendering: rewrite `doc:NN` hrefs to internal `/d/NN` route
// so @[title](doc:NN) mentions become clickable links.
const defaultLinkOpen =
  md.renderer.rules.link_open ||
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options);
  };

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const href = token.attrGet('href') ?? '';
  const docMatch = /^doc:(\d+)$/.exec(href);
  if (docMatch) {
    token.attrSet('href', `/d/${docMatch[1]}`);
    token.attrJoin('class', 'doc-link');
    token.attrSet('data-doc-id', docMatch[1]);
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

export function renderMarkdown(source: string): string {
  return md.render(source ?? '');
}

export interface TocEntry {
  id: string;
  level: number;
  text: string;
}

/**
 * Render Markdown and extract a flat TOC of H1–H4 headings. Each heading gets
 * a deterministic, document-unique `id` attribute so the TOC links scroll to
 * the right spot via the URL fragment.
 */
export function renderMarkdownWithToc(source: string): { html: string; toc: TocEntry[] } {
  const env: { toc: TocEntry[] } = { toc: [] };
  const html = md.render(source ?? '', env);
  return { html, toc: env.toc };
}

// Slugify heading text into a URL-safe id. Keeps CJK characters intact so
// Chinese headings remain readable in the fragment; falls back to a sequential
// suffix if two headings share the same slug.
function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s]+/g, '-')
    .replace(/[!@#$%^&*()+={}[\]|\\;:'",.<>/?`~]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
}

// Intercept heading_open to assign an id; the next inline token holds the
// heading text, so we peek at it from the token stream.
md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const level = Number(token.tag.slice(1)); // h2 → 2
  const inline = tokens[idx + 1];
  const text = inline?.children
    ? inline.children
        .filter((c) => c.type === 'text' || c.type === 'code_inline')
        .map((c) => c.content)
        .join('')
    : inline?.content || '';

  if (level <= 4 && text) {
    const e = env as { toc?: TocEntry[]; _ids?: Map<string, number> };
    e._ids ??= new Map<string, number>();
    e.toc ??= [];
    const base = slugify(text);
    const n = e._ids.get(base) ?? 0;
    const id = n === 0 ? base : `${base}-${n}`;
    e._ids.set(base, n + 1);
    token.attrSet('id', id);
    e.toc.push({ id, level, text });
  }
  return self.renderToken(tokens, idx, options);
};

export function wordCount(source: string): number {
  if (!source) return 0;
  const cjk = source.match(/[一-鿿㐀-䶿]/g)?.length ?? 0;
  const words = source.match(/[A-Za-z0-9_]+/g)?.length ?? 0;
  return cjk + words;
}
