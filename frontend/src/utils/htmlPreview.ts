/**
 * HTML source prepared for the sandboxed host frame (``SandboxedHtmlFrame`` /
 * ``/embed/html-frame.html``) — shared by HtmlEditor / LivePreviewPane previews
 * and HtmlPostReader.
 */

/** Author HTML is written into ``/embed/html-frame.html`` (a real same-origin
 *  URL, unlike the old srcdoc frame whose document URL was opaque). A leading
 *  ``<base href="/">`` makes relative *and* root-relative URLs resolve against
 *  the site root instead of ``/embed/``, and — because the first ``<base>``
 *  wins — overrides author ``<base href="/app/">`` tags. ``/`` needs no
 *  ``window`` (resolves against the document URL), so this stays pure. */
const SITE_ROOT_BASE = '<base href="/">';

/** Insert an arbitrary `<base href>` as the first child of `<head>` (or the
 *  document start). The FIRST `<base>` in a document wins per the HTML spec,
 *  so prepending lets it override author `<base href="/">` tags that would
 *  otherwise resolve against the embedding page origin. ``href`` is
 *  attribute-escaped. */
export function withBaseHref(html: string, href: string): string {
  const esc = href.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const baseTag = `<base href="${esc}">`;
  if (!html) return baseTag;
  const head = /<head[^>]*>/i.exec(html);
  if (head) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + baseTag + html.slice(at);
  }
  const htmlTag = /<html[^>]*>/i.exec(html);
  if (htmlTag) {
    const at = htmlTag.index + htmlTag[0].length;
    return html.slice(0, at) + baseTag + html.slice(at);
  }
  return baseTag + html;
}

/** Insert `<base href="/">` as the first child of `<head>` (or the document
 *  start). Always prepended so it wins over author `<base>` tags. */
export function withSiteRootBase(html: string): string {
  if (!html) return SITE_ROOT_BASE;
  if (/<base\s[^>]*href\s*=\s*["']\/["']/i.test(html)) return html;
  return withBaseHref(html, '/');
}

/** Rewrite root-relative `/media/…` / `/static/…` URLs to absolute backend URLs
 *  so user-embedded images / stylesheets / scripts load even when the media
 *  host differs from the SPA origin (``VITE_MEDIA_BASE_URL``). With the site-root
 *  base above this is a no-op for same-origin deployments; kept for split
 *  hosts. The iframe sandbox lacks `allow-same-origin` so its origin is opaque —
 *  cross-origin image loads are permitted (img/script src don't need CORS). */
function MEDIA_HOST_ROOT(): string {
  const env = (import.meta.env.VITE_MEDIA_BASE_URL as string | undefined) ?? '';
  if (env) return env.replace(/\/media\/?$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export function rewriteRootRelativeAssets(html: string): string {
  if (!html) return html;
  const root = MEDIA_HOST_ROOT();
  if (!root) return html;
  // Match `src="/media/…"`, `href='/static/…'`, also `action`, `poster`,
  // `formaction`. Quoted form only — unquoted attrs are uncommon and risky to
  // parse with a single regex.
  return html.replace(
    /(\s(?:src|href|action|poster|formaction)\s*=\s*)(["'])(\/(?:media|static)\/[^"']+)\2/gi,
    (_m, attr: string, q: string, path: string) => `${attr}${q}${root}${path}${q}`,
  );
}

export function buildHtmlPreviewDoc(html: string): string {
  return withSiteRootBase(rewriteRootRelativeAssets(html ?? ''));
}
