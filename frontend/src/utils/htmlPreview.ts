/**
 * HTML source used as iframe srcDoc for live preview (matches HtmlEditor behaviour).
 */

/** A `srcdoc` iframe resolves relative URLs and `#anchor` links against the
 *  *embedding page's* URL (here `http://localhost:3001/`), not the iframe.
 *  When the frame is sandboxed without `allow-same-origin` its origin is
 *  opaque, so the browser blocks that resolution with:
 *    "Unsafe attempt to load URL http://localhost:3001/ from frame with URL
 *     chrome-error://chromewebdata/. Domains, protocols and ports must match."
 *  Setting `<base href="about:srcdoc">` makes relative URLs resolve inside the
 *  frame instead. See https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#srcdoc */
const SRCDOC_BASE = '<base href="about:srcdoc">';

/** Insert `<base href="about:srcdoc">` as the first child of `<head>` (or the
 *  document start). Always prepended so it wins over author `<base href="/">`
 *  tags that would otherwise resolve to the embedding page origin. */
export function withSrcdocBase(html: string): string {
  if (!html) return SRCDOC_BASE;
  if (/<base\s[^>]*href\s*=\s*["']about:srcdoc["']/i.test(html)) return html;
  const head = /<head[^>]*>/i.exec(html);
  if (head) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + SRCDOC_BASE + html.slice(at);
  }
  const htmlTag = /<html[^>]*>/i.exec(html);
  if (htmlTag) {
    const at = htmlTag.index + htmlTag[0].length;
    return html.slice(0, at) + SRCDOC_BASE + html.slice(at);
  }
  return SRCDOC_BASE + html;
}

export function buildHtmlPreviewSrcdoc(html: string): string {
  return withSrcdocBase(html ?? '');
}
