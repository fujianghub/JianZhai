import MarkdownIt from 'markdown-it';
import mdContainer from 'markdown-it-container';
// @ts-expect-error — these packages ship no type defs but their default export
// is a markdown-it plugin function, which is all `.use()` needs.
import mdTaskLists from 'markdown-it-task-lists';
// @ts-expect-error — no types
import mdSub from 'markdown-it-sub';
// @ts-expect-error — no types
import mdSup from 'markdown-it-sup';
// @ts-expect-error — no types
import mdMark from 'markdown-it-mark';
import DOMPurify from 'dompurify';
import { highlightCode, languageLabel, normalizeLanguage } from './codeBlocks';

export const md = new MarkdownIt({
  /**
   * Inline HTML is enabled to support Yuque-imported documents (which lean on
   * <font color>, <u>, <br>, <kbd>, etc.). Every render goes through
   * DOMPurify below, so the allowlist — not markdown-it — is what determines
   * what reaches the DOM.
   */
  html: true,
  linkify: true,
  breaks: true,
  /**
   * Custom highlighter — we emit the entire <pre><code> wrapper ourselves so
   * we can attach the language label + interactive toolbar. Returning empty
   * string would fall back to markdown-it's default escaping.
   */
  highlight: (str, lang) => renderCodeBlock(str, lang),
});

// Extra markdown features that are common in Yuque / Obsidian / Notion exports
// but aren't part of CommonMark proper. Each plugin is a one-liner.
md.use(mdTaskLists, { enabled: true, label: false, labelAfter: false });
md.use(mdSub);
md.use(mdSup);
md.use(mdMark);

/**
 * markdown-it normally wraps a fenced block in ``<pre><code class="…">…</code></pre>``
 * even when ``options.highlight`` returns custom HTML, unless that HTML
 * starts with ``<pre``. Our wrapper begins with ``<div class="jz-code-block">``,
 * so we override the ``fence`` renderer to emit the highlight output directly.
 */
md.renderer.rules.fence = (tokens, idx, options) => {
  const token = tokens[idx];
  const info = (token.info || '').trim();
  const lang = info.split(/\s+/g)[0] || '';
  const highlighted = options.highlight?.(token.content, lang, info) || '';
  return highlighted || `<pre><code>${escape(token.content)}</code></pre>`;
};

/**
 * ::: callouts — Yuque / VuePress / Docusaurus all use the same fenced syntax:
 *
 *   :::tips
 *   Heads-up text.
 *   :::
 *
 * Yuque additionally emits arbitrary palette names (``:::color1``, ``:::color2``)
 * for its colour-coded note blocks. We register a single catch-all container
 * (with a ``validate`` regex matching any word) so every variant renders even
 * without a per-keyword entry. Known names get a friendly Chinese label;
 * unknown ones echo the slug.
 */
/** All known callout slugs share one universal renderer.
 *
 * The "shape" is identical across kinds — colored left bar + tinted bg + a
 * small icon disc in the top-left corner. Each kind only contributes its
 * accent colour, which CSS pulls from per-class custom properties (``--c``,
 * ``--c-icon``). This is what the user asked for: "大而全" — one block that
 * handles every variant, with no inconsistency between ``:::info`` and
 * ``:::color2``.
 *
 * Title bar is **only** shown when the user supplied an explicit title via
 * ``:::info My Custom Title``. By default the icon disc is enough to signal
 * the kind; the first paragraph of the body acts as the natural heading.
 *
 * This matches Yuque / Notion's behaviour: content speaks for itself, no
 * stamped "说明" banner saying the obvious. */
md.use(mdContainer, 'callout', {
  validate(params: string): boolean {
    // Accept ``:::anything`` and ``:::anything Optional Title``. Hyphens,
    // digits, dots and dollar signs are allowed so ``:::color-2``, ``:::v1.0``
    // and ``:::$primary`` also work — anything word-ish makes a slug.
    return /^[^\s]+(\s+.*)?$/.test(params.trim());
  },
  render(tokens: Array<{ nesting: number; info: string }>, idx: number): string {
    const token = tokens[idx];
    if (token.nesting === 1) {
      const match = token.info.trim().match(/^(\S+)(?:\s+(.*))?$/);
      const rawKind = match?.[1] ?? 'note';
      const explicitTitle = (match?.[2] ?? '').trim();
      // Normalise: lowercase + strip everything but a-z/0-9/-/_ so weird
      // upstream slugs (``:::Info!``, ``:::Note?``) still produce a valid
      // CSS class.
      const kind = rawKind.toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'note';
      const opener =
        `<div class="jz-callout jz-callout-${escape(kind)}">` +
        (explicitTitle ? `<div class="jz-callout-title">${escape(explicitTitle)}</div>` : '') +
        `<div class="jz-callout-body">`;
      return opener;
    }
    return `</div></div>\n`;
  },
});

/**
 * DOMPurify allowlist — keep just enough tags/attributes for Yuque-imported
 * documents to render naturally without exposing the page to <script> / event
 * handlers from a malicious paste. Code blocks are pre-rendered into trusted
 * HTML by ``renderCodeBlock`` and survive the sweep because we explicitly
 * include their classes/data-attrs.
 */
const PURIFY_CONFIG: Parameters<typeof DOMPurify.sanitize>[1] = {
  ALLOWED_TAGS: [
    // basic block + inline
    'p', 'br', 'hr', 'div', 'span',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'mark', 'small', 'sub', 'sup', 'kbd',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'td', 'th', 'caption',
    'a', 'img', 'figure', 'figcaption',
    // legacy presentational tag (Yuque emits this for inline colour)
    'font',
    // task-list checkboxes; our own code-block toolbar buttons.
    'input', 'button',
    // SVG (mermaid)
    'svg', 'g', 'rect', 'circle', 'line', 'path', 'polygon', 'polyline', 'ellipse',
    'text', 'tspan', 'defs', 'marker', 'foreignObject', 'use', 'symbol', 'clipPath',
    'linearGradient', 'radialGradient', 'stop', 'mask', 'pattern', 'image', 'desc',
    'title', 'style',
  ],
  ALLOWED_ATTR: [
    'href', 'target', 'rel', 'name',
    'id', 'class', 'style',
    'title', 'alt', 'src', 'srcset', 'sizes', 'width', 'height', 'loading', 'decoding',
    'colspan', 'rowspan', 'align', 'valign', 'scope',
    'color', 'face', 'size',
    'type', 'checked', 'disabled', 'value',
    // mermaid + our own enhancers
    'data-lang', 'data-source', 'data-action', 'aria-label', 'aria-pressed', 'aria-live',
    'role', 'contenteditable', 'hidden',
    // SVG specifics
    'viewBox', 'd', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
    'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'stroke-dasharray', 'transform', 'points', 'opacity', 'fill-opacity',
    'stroke-opacity', 'preserveAspectRatio', 'xmlns', 'xmlns:xlink', 'xlink:href',
    'gradientUnits', 'gradientTransform', 'offset', 'stop-color', 'stop-opacity',
    'marker-end', 'marker-start', 'orient', 'refX', 'refY', 'markerWidth', 'markerHeight',
    'font-family', 'font-size', 'text-anchor', 'dominant-baseline', 'pointer-events',
  ],
  ALLOW_DATA_ATTR: false,
  // Block all event handlers (onclick=, onerror=, …) even on otherwise allowed tags.
  FORBID_ATTR: [
    'onclick', 'onerror', 'onload', 'onmouseover', 'onmouseout', 'onfocus', 'onblur',
    'onsubmit', 'onchange', 'oninput', 'onkeydown', 'onkeyup', 'onkeypress',
  ],
  // mermaid sets foreignObject; let it through.
  ADD_TAGS: ['foreignObject'],
};

function sanitize(html: string): string {
  if (typeof window === 'undefined') return html; // server-side: skip
  return DOMPurify.sanitize(html, PURIFY_CONFIG) as unknown as string;
}

/**
 * Wrap highlighted code in a Yuque-style chrome:
 * - top bar with language label + toolbar buttons (copy / wrap / font-size)
 * - line numbers gutter via CSS counters
 * - data attributes consumed by CodeBlockEnhancer at runtime
 *
 * Buttons themselves are non-interactive HTML — the CodeBlockEnhancer
 * component attaches click handlers and toggles classes once the rendered
 * Markdown is mounted into the DOM.
 */
function renderCodeBlock(code: string, lang: string): string {
  const canon = normalizeLanguage(lang);
  const label = languageLabel(canon);

  // Mermaid intentionally takes a different path: the raw fence body is
  // emitted as a base64 attribute so the runtime enhancer can render it as
  // SVG without any markdown-it escaping shenanigans corrupting the source.
  if (canon === 'mermaid') {
    const b64 = base64UTF8(code.replace(/\n+$/, ''));
    return (
      `<div class="jz-code-block jz-code-mermaid" data-lang="mermaid" data-source="${b64}">` +
      `<div class="jz-code-toolbar" contenteditable="false">` +
      `<span class="jz-code-lang">${escape(label)}</span>` +
      `<span class="jz-code-toolbar-spacer"></span>` +
      `<button type="button" class="jz-code-btn" data-action="mermaid-source" title="查看源代码" aria-label="查看源代码">源码</button>` +
      `<button type="button" class="jz-code-btn" data-action="copy" title="复制" aria-label="复制">⧉</button>` +
      `</div>` +
      `<div class="jz-mermaid-canvas" aria-live="polite">` +
      `<div class="jz-mermaid-loading">正在渲染图表…</div>` +
      `</div>` +
      `<pre class="jz-code-pre hljs jz-mermaid-source" hidden><code class="hljs language-mermaid">${escape(code)}</code></pre>` +
      `</div>`
    );
  }

  // PlantUML 走和 mermaid 类似的"分图渲染"路径，但渲染目标是远端 svg URL，
  // 所以同样把源码 base64 出来留给运行时增强器处理。
  if (canon === 'plantuml') {
    const b64 = base64UTF8(code.replace(/\n+$/, ''));
    return (
      `<div class="jz-code-block jz-code-plantuml" data-lang="plantuml" data-source="${b64}">` +
      `<div class="jz-code-toolbar" contenteditable="false">` +
      `<span class="jz-code-lang">${escape(label)}</span>` +
      `<span class="jz-code-toolbar-spacer"></span>` +
      `<button type="button" class="jz-code-btn" data-action="plantuml-source" title="查看源代码" aria-label="查看源代码">源码</button>` +
      `<button type="button" class="jz-code-btn" data-action="copy" title="复制" aria-label="复制">⧉</button>` +
      `</div>` +
      `<div class="jz-mermaid-canvas" aria-live="polite">` +
      `<div class="jz-mermaid-loading">正在向 PlantUML 服务请求…</div>` +
      `</div>` +
      `<pre class="jz-code-pre hljs jz-mermaid-source" hidden><code class="hljs language-plantuml">${escape(code)}</code></pre>` +
      `</div>`
    );
  }

  const body = highlightCode(code, canon);
  // Split into lines so we can render a line-number gutter purely with CSS
  // counters — keeps the code copy-able without numbers.
  const lines = body.split('\n');
  // hljs leaves a trailing newline from the fence; drop it so we don't render
  // a bonus empty line.
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const numbered = lines
    .map((l) => `<span class="jz-code-line">${l || '​'}</span>`)
    .join('\n');

  return (
    `<div class="jz-code-block" data-lang="${canon}">` +
    `<div class="jz-code-toolbar" contenteditable="false">` +
    `<span class="jz-code-lang">${escape(label)}</span>` +
    `<span class="jz-code-toolbar-spacer"></span>` +
    `<button type="button" class="jz-code-btn" data-action="font-down" title="缩小字号" aria-label="缩小字号">A−</button>` +
    `<button type="button" class="jz-code-btn" data-action="font-up" title="放大字号" aria-label="放大字号">A+</button>` +
    `<button type="button" class="jz-code-btn" data-action="line-tight" title="缩小行距" aria-label="缩小行距">↕−</button>` +
    `<button type="button" class="jz-code-btn" data-action="line-loose" title="放大行距" aria-label="放大行距">↕+</button>` +
    `<button type="button" class="jz-code-btn" data-action="wrap" title="自动换行 / 滚动" aria-label="切换换行">⤶</button>` +
    `<button type="button" class="jz-code-btn" data-action="copy" title="复制" aria-label="复制">⧉</button>` +
    `</div>` +
    `<pre class="jz-code-pre hljs"><code class="hljs language-${canon}">${numbered}</code></pre>` +
    `</div>`
  );
}

/** Base64-encode a UTF-8 string in a way that works in both browsers and
 * Node (used at SSR / test time). Mermaid sources can contain non-ASCII
 * labels — `btoa` would throw without this transform. */
function base64UTF8(s: string): string {
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    // encodeURIComponent → UTF-8 bytes → btoa
    return window.btoa(
      encodeURIComponent(s).replace(/%([0-9A-F]{2})/g, (_, h) =>
        String.fromCharCode(parseInt(h, 16))
      )
    );
  }
  // Node fallback
  return Buffer.from(s, 'utf8').toString('base64');
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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
  return sanitize(md.render(stripOcrComments(source ?? '')));
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
  const html = md.render(stripOcrComments(source ?? ''), env);
  return { html: sanitize(html), toc: env.toc };
}

/**
 * Yuque exports often leave behind annotations like
 * ``<!-- 这是一张图片，ocr 内容为： -->`` that are noise for the reader. We
 * strip every standalone HTML comment before handing the source to
 * markdown-it (and before DOMPurify, which would also nuke them but might
 * leave whitespace artefacts in their place).
 *
 * The same preprocessing stage also repairs broken bold spans that Yuque
 * frequently emits — see ``normalizeYuqueEmphasis`` below.
 */
function stripOcrComments(src: string): string {
  let out = src.replace(/<!--[\s\S]*?-->/g, '');
  out = unglueContainerFences(out);
  out = unwrapBacktickedHtml(out);
  out = normalizeYuqueEmphasis(out);
  return out;
}

/**
 * Yuque exports often glue a ``:::info`` opener directly onto whatever
 * preceded it, with no blank line in between. The most common offender is an
 * image followed by a callout::
 *
 *   ![](https://cdn.nlark.com/yuque/.../foo.png):::info
 *   **Title**
 *   ...
 *   :::
 *
 * markdown-it-container requires the ``:::`` fence to start at the beginning
 * of a paragraph (i.e., a blank line in front of it), so this glued pattern
 * silently degrades to plain text. We insert the missing newlines here.
 *
 * Same treatment is applied to a glued *closing* ``:::`` so e.g. trailing
 * text right after the fence doesn't kill the close.
 */
function unglueContainerFences(src: string): string {
  // Opener: ``...text:::info`` → ``...text\n\n:::info``.
  // Anchor on a non-newline char before ``:::`` and a word char after, so
  // we never split a literal ``::: separator (no following word)``.
  let out = src.replace(/([^\n])(:::[a-zA-Z][\w-]*)/g, '$1\n\n$2');
  // Closing: ``content:::`` → ``content\n\n:::``. Bare ``:::`` followed by
  // line-end or another fence, glued after non-newline content.
  out = out.replace(/([^\n]):::(\s*\n|$)/g, '$1\n\n:::$2');
  return out;
}

/**
 * Yuque's exporter sometimes wraps presentational HTML tags (``<font>``,
 * ``<u>``, ``<br>``, ``<mark>``, ``<kbd>``, ``<sub>``, ``<sup>``) in
 * backticks, e.g.
 *
 *   `<font style="color:rgb(245,158,11)">404 Page not found</font>`
 *   `**<font style="color:#ED740C;">urls.py</font>**`     (bold + font)
 *
 * markdown-it then treats the whole thing as inline code and emits the
 * tags as literal text, defeating the colour/underline intent. We unwrap
 * the backticks so the inner HTML renders.
 *
 * We accept an OPTIONAL ``**`` (or ``__``) marker on each side of the tag
 * so the common Yuque pattern of *bold + colour highlight* round-trips
 * correctly. Real code samples like `` `<div>` `` / `` `<App />` `` stay
 * untouched because their tag name isn't on the presentational allow-list.
 */
function unwrapBacktickedHtml(src: string): string {
  const tags = '(?:font|u|mark|kbd|sub|sup|br)';
  // Allow the same marker around both sides (matched via a backreference so
  // ``**X**`` works but ``**X__`` wouldn't accidentally collapse).
  const marker = '(\\*\\*|__)?';
  const closingMarker = '\\1'; // backref to whichever opener matched
  const re = new RegExp(
    '`' + marker + '(<' + tags + '\\b[^`<>]*?(?:/>|>[^`]*?</' + tags + '>))' + closingMarker + '`',
    'gi',
  );
  // ``$1`` is the optional bold marker (may be empty); ``$2`` is the tag.
  return src.replace(re, '$1$2$1');
}

/**
 * Fix the emphasis patterns Yuque's Markdown exporter emits incorrectly:
 *
 *   1. ``**word****next**`` — four adjacent asterisks. Yuque uses this to
 *      join two adjacent bold spans, but CommonMark interprets the middle
 *      ``****`` as an unmatched run and leaves it as raw text. We split it
 *      back into ``**word** **next**``.
 *   2. ``** word **`` — extra whitespace immediately inside the bold span.
 *      CommonMark requires the opener NOT to be followed by whitespace and
 *      the closer NOT to be preceded by it, so the entire span ends up as
 *      plain literal asterisks. We strip the inner whitespace.
 *
 * Same two transforms applied to ``__…__`` (the alternate strong syntax)
 * and a single-asterisk ``* italic *`` variant, which Yuque can also export.
 */
function normalizeYuqueEmphasis(src: string): string {
  let out = src;

  // (0) Yuque splits a bold span around an inline HTML tag (typically
  // ``<font color>`` used to highlight a term mid-sentence). It comes out in
  // two flavours:
  //
  //   tight:   **A**<font ...>x</font>**B**
  //   spaced:  **A** **<font ...>x</font>** **B**   (each piece its own bold)
  //
  // Both should render as one continuous bold span wrapping the inline tag.
  // We handle each variant with its own regex; both iterate so chains
  // ``**A**<t1>x</t1>**B**<t2>y</t2>**C**`` collapse cleanly.
  {
    const inlineTag = '(?:font|u|mark|kbd|sub|sup)';
    // Spaced FIRST — its pattern is more specific (requires the inner bold
    // around the tag), so handling it before the tight one prevents the
    // tight regex from matching the inner ``** **`` pair as a phantom bold.
    const reSpaced = new RegExp(
      `\\*\\*([^*\\n]+?)\\*\\*[ \\t]+\\*\\*(<(${inlineTag})\\b[^>]*>[^*\\n<]*?</\\3>)\\*\\*[ \\t]+\\*\\*([^*\\n]+?)\\*\\*`,
      'gi',
    );
    for (let i = 0; i < 8; i++) {
      const next = out.replace(reSpaced, '**$1 $2 $4**');
      if (next === out) break;
      out = next;
    }
    const reTight = new RegExp(
      `\\*\\*([^*\\n]+?)\\*\\*(<(${inlineTag})\\b[^>]*>[^*\\n<]*?</\\3>)\\*\\*([^*\\n]+?)\\*\\*`,
      'gi',
    );
    for (let i = 0; i < 8; i++) {
      const next = out.replace(reTight, '**$1$2$4**');
      if (next === out) break;
      out = next;
    }
  }

  // (1) Yuque sometimes emits ``**A**B**`` (three ``**`` runs in a row) when
  // its WYSIWYG editor split a single bold span around a cursor edit. The
  // visual intent is **AB** as one bold, but CommonMark parses the second
  // ``**`` as a close, leaving B plain. We merge by stripping the middle
  // closer/opener pair: ``**A**B**C**`` → ``**AB**C**`` → ``**ABC**`` after
  // repeated application. Apply iteratively until stable.
  //
  // To avoid touching legitimate cases like ``**A** plain **B**`` we restrict
  // the connector segment ``[^*\n ]+`` so it can't contain spaces or stars
  // (only word/punct chars). That covers the Yuque export pattern but
  // preserves intentional adjacent bolds.
  for (let i = 0; i < 8; i++) {
    // Anchored on lookbehind / lookahead so the regex won't accidentally
    // treat the closing ``**`` of one bold as the opening of a new one
    // (which would let `**A** **B** **C**` collapse incorrectly).
    const next = out.replace(
      /(?<![\w*])\*\*([^*\n]+?)\*\*([^*\n ]+?)\*\*([^*\n]+?)\*\*(?![\w*])/g,
      '**$1$2$3**',
    );
    if (next === out) break;
    out = next;
  }

  // (2) Split runs of 4+ consecutive asterisks into ``** **`` pairs so each
  // adjacent bold can render independently.
  out = out.replace(/\*{4,}/g, '** **');
  out = out.replace(/_{4,}/g, '__ __');

  // (3) Strip whitespace immediately inside a bold span ``**…**``.
  // Anchored on ``(?<![\w*])`` / ``(?![\w*])`` so the opening ``**`` we match
  // can't be a *closing* one from a preceding bold span (and vice versa for
  // the close). Without these lookarounds ``**a** plain text **b**`` would
  // misread the middle as ``**(space)plain text(space)**`` and strip the
  // intended spaces.
  out = out.replace(/(?<![\w*])\*\*[ \t]+([^*\n]+?)\*\*(?![\w*])/g, '**$1**');
  out = out.replace(/(?<![\w*])\*\*([^*\n]+?)[ \t]+\*\*(?![\w*])/g, '**$1**');

  // (4) Merge two adjacent bolds separated only by whitespace into one:
  // ``**A** **B**`` → ``**A B**``. Yuque's exporter often closes/reopens
  // bold across a stray space so this collapses them back into one clean
  // span. Iterate to handle long chains ``**A** **B** **C**`` → ``**A B C**``.
  // The callback joins the two halves with a single space and collapses any
  // resulting double-spacing from trailing whitespace inside ``A`` or leading
  // whitespace inside ``B``.
  for (let i = 0; i < 8; i++) {
    const next = out.replace(
      /\*\*([^*\n]+?)\*\*([ \t]+)\*\*([^*\n]+?)\*\*/g,
      (_, a: string, _gap: string, c: string) =>
        '**' + (a.trimEnd() + ' ' + c.trimStart()).replace(/\s+/g, ' ') + '**',
    );
    if (next === out) break;
    out = next;
  }

  // (5) Same for the alternate ``__…__`` strong syntax.
  out = out.replace(/__[ \t]+([^_\n]+?)__/g, '__$1__');
  out = out.replace(/__([^_\n]+?)[ \t]+__/g, '__$1__');

  // (6) Italic ``_…_`` — Yuque often emits ``_ word_`` or ``_word _`` because
  // its WYSIWYG exporter is sloppy about inner whitespace. CommonMark forbids
  // both forms so the entire span ends up as raw underscores. We anchor on
  // ``\w`` lookbehind/lookahead so ``snake_case`` identifiers stay untouched
  // (those have word chars on both sides of every ``_``).
  out = out.replace(/(?<!\w)_[ \t]+([^_\n]+?)_(?!\w)/g, '_$1_');
  out = out.replace(/(?<!\w)_([^_\n]+?)[ \t]+_(?!\w)/g, '_$1_');

  return out;
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

/**
 * 阅读时长估算（分钟，向上取整，最小 1 分钟）。
 * 标准：中文 ~300 字/分钟，英文单词 ~200 字/分钟。把两类字数按各自权重折合。
 */
export function readingMinutes(source: string): number {
  if (!source) return 0;
  const cjk = source.match(/[一-鿿㐀-䶿]/g)?.length ?? 0;
  const words = source.match(/[A-Za-z0-9_]+/g)?.length ?? 0;
  const minutes = cjk / 300 + words / 200;
  return Math.max(1, Math.ceil(minutes));
}
