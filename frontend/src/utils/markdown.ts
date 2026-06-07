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
// @ts-expect-error — no types
import mdFootnote from 'markdown-it-footnote';
import mdMultimdTable from 'markdown-it-multimd-table';
import DOMPurify from 'dompurify';
import katex from 'katex';
// KaTeX's own stylesheet — without this the public blog reader has unstyled
// math (MathNode.tsx imports the same sheet for the editor; this duplicate
// import is dedup'd by Vite). Loaded eagerly so first-paint math doesn't FOUC.
import 'katex/dist/katex.min.css';
import { highlightCode, languageLabel, normalizeLanguage } from './codeBlocks';
import { loadCodeBlockPrefs, themeLabel } from './codeBlockPrefs';
import { parseCodeFenceInfo } from './codeFenceMeta';

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
md.use(mdFootnote);
md.use(mdMultimdTable, { multiline: true, rowspan: true, headerless: false });
md.use(katexPlugin);

/**
 * KaTeX plugin for markdown-it. Without this the public blog (which renders
 * pure Markdown — no Tiptap MathBlock to paper over the gap) leaves ``$$E=mc^2$$``
 * as literal dollar-sign text.
 *
 * Block rule: a ``$$`` opener at the start of a line, content (one or more
 * lines), closed by ``$$`` on the opener line or any later line. Renders as
 * ``<div class="jz-math-block">{katex html}</div>``.
 *
 * Inline rule: a paired ``$…$`` span inside a paragraph. To avoid stealing
 * currency notation we require: (a) no whitespace immediately after the
 * opening ``$``, (b) no whitespace immediately before the closing ``$``, and
 * (c) no digit immediately before the opener (so ``5$ to 10$`` reads as text).
 *
 * KaTeX runs with ``throwOnError: false`` so bad LaTeX shows a red message in
 * place of an exception. ``output: 'html'`` skips the MathML twin so DOMPurify
 * doesn't need to know about ``<math>``/``<mrow>``/… tags — every emitted node
 * is a ``span`` with a class, all already on the allowlist.
 */
function katexPlugin(mdInst: MarkdownIt): void {
  // Block: $$...$$
  mdInst.block.ruler.before(
    'fence',
    'math_block',
    (state, startLine, endLine, silent) => {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      if (start + 2 > max) return false;
      if (state.src.slice(start, start + 2) !== '$$') return false;

      // close on same line: $$expr$$
      const restOfLine = state.src.slice(start + 2, max).trimEnd();
      let content: string;
      let lastLine = startLine;
      if (restOfLine.endsWith('$$')) {
        content = restOfLine.slice(0, -2);
      } else {
        const parts: string[] = [restOfLine];
        let l = startLine + 1;
        let closed = false;
        while (l < endLine) {
          const ls = state.bMarks[l] + state.tShift[l];
          const lm = state.eMarks[l];
          const lineText = state.src.slice(ls, lm);
          if (lineText.trimEnd().endsWith('$$')) {
            parts.push(lineText.replace(/\$\$\s*$/, ''));
            lastLine = l;
            closed = true;
            break;
          }
          parts.push(lineText);
          l++;
        }
        if (!closed) return false;
        content = parts.join('\n');
      }
      if (silent) return true;
      const token = state.push('math_block', 'div', 0);
      token.block = true;
      token.content = content.trim();
      token.markup = '$$';
      token.map = [startLine, lastLine + 1];
      state.line = lastLine + 1;
      return true;
    },
    { alt: [] },
  );

  // Inline: $...$
  mdInst.inline.ruler.after('escape', 'math_inline', (state, silent) => {
    const pos = state.pos;
    if (state.src[pos] !== '$') return false;
    // Disallow $$ here (block-level handles that)
    if (state.src[pos + 1] === '$') return false;
    // Reject currency: digit immediately before $ → almost always money.
    const prev = pos > 0 ? state.src[pos - 1] : '';
    if (prev && /\d/.test(prev)) return false;
    // Opening $ must not be followed by whitespace
    const afterOpen = state.src[pos + 1];
    if (!afterOpen || /\s/.test(afterOpen)) return false;

    // Walk to the closing $
    let end = pos + 1;
    const max = state.posMax;
    while (end < max) {
      const ch = state.src[end];
      if (ch === '\\' && end + 1 < max) {
        end += 2;
        continue;
      }
      if (ch === '\n') return false;
      if (ch === '$') {
        // Closing $ must not be preceded by whitespace
        const beforeClose = state.src[end - 1];
        if (/\s/.test(beforeClose)) {
          end++;
          continue;
        }
        // Don't close on $$ — leave it for the block rule or text
        if (state.src[end + 1] === '$') return false;
        // Reject currency on close side too (e.g. `… 5$`)
        const afterClose = state.src[end + 1] ?? '';
        if (afterClose && /\d/.test(afterClose)) {
          end++;
          continue;
        }
        if (silent) return true;
        const token = state.push('math_inline', 'span', 0);
        token.content = state.src.slice(pos + 1, end);
        token.markup = '$';
        state.pos = end + 1;
        return true;
      }
      end++;
    }
    return false;
  });

  mdInst.renderer.rules.math_block = (tokens, idx) => {
    try {
      const html = katex.renderToString(tokens[idx].content, {
        displayMode: true,
        throwOnError: false,
        output: 'html',
      });
      return `<div class="jz-math-block">${html}</div>\n`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '公式渲染失败';
      return `<div class="jz-math-block jz-math-error" title="${escape(msg)}">${escape(tokens[idx].content)}</div>\n`;
    }
  };

  mdInst.renderer.rules.math_inline = (tokens, idx) => {
    try {
      return katex.renderToString(tokens[idx].content, {
        displayMode: false,
        throwOnError: false,
        output: 'html',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '公式渲染失败';
      return `<span class="jz-math-inline jz-math-error" title="${escape(msg)}">${escape(tokens[idx].content)}</span>`;
    }
  };
}

/** Minimal markdown-it instance for GFM pipe-table → HTML conversion in preprocess. */
const tableMd = new MarkdownIt({ html: true, linkify: false, breaks: false });
tableMd.use(mdMultimdTable, { multiline: true, rowspan: true, headerless: false });

/** Pipe tables normally reach ``md`` pre-rendered by ``convertGfmPipeTables``,
 * but GFM tables written without outer pipes are parsed natively by ``md`` —
 * wrap those in the same scroll container the preprocess path emits, so wide
 * tables scroll horizontally instead of being clipped. */
md.renderer.rules.table_open = () => '<div class="jz-table-wrap">\n<table>\n';
md.renderer.rules.table_close = () => '</table>\n</div>\n';

/**
 * markdown-it normally wraps a fenced block in ``<pre><code class="…">…</code></pre>``
 * even when ``options.highlight`` returns custom HTML, unless that HTML
 * starts with ``<pre``. Our wrapper begins with ``<div class="jz-code-block">``,
 * so we override the ``fence`` renderer to emit the highlight output directly.
 */
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  const info = (token.info || '').trim();
  const lang = info.split(/\s+/g)[0] || '';
  const highlighted = renderCodeBlock(token.content, lang, info) || '';
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
    // SVG filter primitives — mermaid emits <filter> defs; stripping the def
    // while a ``style="filter:url(#id)"`` reference survives leaves a dangling
    // filter, which can stop the referencing element painting at all.
    'filter', 'feFlood', 'feGaussianBlur', 'feComposite', 'feMerge', 'feMergeNode',
    'feOffset', 'feColorMatrix', 'feDropShadow', 'feBlend',
    // KaTeX uses span/svg + class for HTML-only output; allow ``annotation``
    // so users who embed MathML round-trip cleanly too.
    'annotation', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac',
    'msqrt', 'mtext', 'math',
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
    'markerUnits', 'font-family', 'font-size', 'text-anchor', 'dominant-baseline',
    'pointer-events', 'aria-roledescription',
    // SVG text row offsets — mermaid (htmlLabels:false) positions each label
    // row with ``dy="1.1em"``; stripping it stacked every row 1.1em too high,
    // so node borders struck straight through their own labels.
    'dy', 'dx', 'alignment-baseline', 'font-style', 'font-weight',
    'fill-rule', 'clip-rule', 'clip-path',
    // filter primitive attrs (see filter tags above)
    'in', 'in2', 'result', 'mode', 'operator', 'flood-color', 'flood-opacity',
    'stdDeviation', 'filterUnits', 'primitiveUnits',
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
 * Public sanitizer for untrusted HTML that does NOT come from our Markdown
 * pipeline — e.g. DOCX converted by mammoth before rendering via
 * ``dangerouslySetInnerHTML``. Shares the same allowlist as Markdown output.
 */
export function sanitizeHtml(html: string): string {
  return sanitize(html);
}

function renderYuqueToolbar(opts: {
  label: string;
  titleText: string;
  themeName: string;
  extraActions?: string;
}): string {
  return (
    `<div class="jz-code-toolbar" contenteditable="false">` +
    `<span class="jz-code-collapse-placeholder" aria-hidden="true">▾</span>` +
    `<span class="jz-code-title-area"><span class="jz-code-title-text">${escape(opts.titleText)}</span></span>` +
    `<span class="jz-code-toolbar-spacer"></span>` +
    `<span class="jz-code-lang">${escape(opts.label)}</span>` +
    `<span class="jz-code-toolbar-divider" aria-hidden="true"></span>` +
    `<span class="jz-code-theme-label">${escape(opts.themeName)}</span>` +
    `<span class="jz-code-toolbar-divider" aria-hidden="true"></span>` +
    `<div class="jz-code-toolbar-actions">` +
    (opts.extraActions ?? '') +
    `<button type="button" class="jz-code-btn jz-code-btn-icon" data-action="copy" title="复制" aria-label="复制">⧉</button>` +
    `<button type="button" class="jz-code-btn jz-code-btn-icon" data-action="more" title="更多" aria-label="更多">⋯</button>` +
    `</div>` +
    `</div>`
  );
}

function readRenderPrefs() {
  return typeof window !== 'undefined'
    ? loadCodeBlockPrefs()
    : { theme: 'one-dark-pro' as const, wrap: false, lineNumbers: true, fontSize: 13, lineHeight: 1.6 };
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
function renderCodeBlock(code: string, lang: string, fenceInfo?: string): string {
  const meta = parseCodeFenceInfo(fenceInfo ?? lang);
  const canon = normalizeLanguage(meta.language || lang);
  const label = languageLabel(canon);
  const prefs = readRenderPrefs();
  const themeName = themeLabel(prefs.theme);
  const titleText = meta.title.trim() || `${label} · 代码块`;
  const collapsedClass = meta.collapsed ? ' is-collapsed' : '';
  const titleAttr = meta.title ? ` data-title="${escape(meta.title)}"` : '';
  const collapsedAttr = meta.collapsed ? ' data-collapsed="true"' : '';
  const wrapClass = prefs.wrap ? ' is-wrapped' : '';
  const lineNumClass = prefs.lineNumbers ? '' : ' jz-code-no-line-numbers';

  // Mermaid / PlantUML render Yuque-style: just the diagram in a clean frame,
  // no always-on toolbar. A floating action row in the top-right fades in on
  // hover/focus and exposes the four useful operations (source toggle, copy
  // source, download SVG, fullscreen). Single-click on the canvas also flips
  // to source mode — see ``wireCanvasClickToSource`` in CodeBlockEnhancer.
  //
  // Backward compat: the wrapper keeps ``jz-code-block`` + ``jz-code-mermaid``
  // /``jz-code-plantuml`` classes so existing tests, CSS hooks and the
  // CodeBlockEnhancer hydration logic all keep working. The new
  // ``jz-diagram-block`` modifier opts into the Yuque-style chrome (which
  // drops the heavy ``.jz-code-toolbar`` in favour of the floating row).
  if (canon === 'mermaid' || canon === 'plantuml') {
    const isMermaid = canon === 'mermaid';
    const b64 = base64UTF8(code.replace(/\n+$/, ''));
    const langClass = isMermaid ? 'jz-code-mermaid' : 'jz-code-plantuml';
    const sourceAction = isMermaid ? 'mermaid-source' : 'plantuml-source';
    const loadingText = isMermaid
      ? '正在渲染图表…'
      : '正在向 PlantUML 服务请求…';
    return (
      `<div class="jz-code-block jz-diagram-block ${langClass}${collapsedClass}" ` +
      `data-lang="${canon}" data-source="${b64}" data-code-theme="${prefs.theme}"${titleAttr}${collapsedAttr}>` +
      `<div class="jz-diagram-actions" role="toolbar" aria-label="图表操作" contenteditable="false">` +
      `<button type="button" class="jz-diagram-action" data-action="${sourceAction}" title="查看源代码" aria-label="查看源代码">` +
      `<span class="jz-diagram-action-icon" aria-hidden="true">&lt;/&gt;</span>` +
      `<span class="jz-diagram-action-label">源码</span>` +
      `</button>` +
      `<button type="button" class="jz-diagram-action jz-diagram-action-icon-only" data-action="copy" title="复制源代码" aria-label="复制源代码">⧉</button>` +
      `<button type="button" class="jz-diagram-action jz-diagram-action-icon-only" data-action="diagram-download" title="下载 SVG" aria-label="下载 SVG">⤓</button>` +
      `<button type="button" class="jz-diagram-action jz-diagram-action-icon-only" data-action="diagram-fullscreen" title="全屏查看 (Esc 退出)" aria-label="全屏查看">⤢</button>` +
      `</div>` +
      `<div class="jz-mermaid-canvas" aria-live="polite">` +
      `<div class="jz-mermaid-loading"><span class="jz-mermaid-spinner" aria-hidden="true"></span>${loadingText}</div>` +
      `</div>` +
      `<pre class="jz-code-pre hljs jz-mermaid-source" hidden><code class="hljs language-${canon}">${escape(code)}</code></pre>` +
      `</div>`
    );
  }

  const body = highlightCode(code, canon);
  const sourceB64 = base64UTF8(code.replace(/\n+$/, ''));
  const lines = body.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const numbered = lines
    .map((l) => `<span class="jz-code-line">${l || '​'}</span>`)
    .join('');

  return (
    `<div class="jz-code-block${collapsedClass}${wrapClass}${lineNumClass}" data-lang="${canon}" data-code-source="${sourceB64}" data-code-theme="${prefs.theme}"${titleAttr}${collapsedAttr}>` +
    renderYuqueToolbar({ label, titleText, themeName }) +
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

/** Inject `loading="lazy" decoding="async"` on every <img> that doesn't already
 *  declare them. Applied after sanitization so DOMPurify can't strip the attrs;
 *  both attrs are on its allow-list above. */
function addImgLazyAttrs(html: string): string {
  return html.replace(/<img\b([^>]*?)>/gi, (_m, attrs: string) => {
    let next = attrs;
    if (!/\bloading\s*=/i.test(next)) next += ' loading="lazy"';
    if (!/\bdecoding\s*=/i.test(next)) next += ' decoding="async"';
    return `<img${next}>`;
  });
}

export function renderMarkdown(source: string): string {
  return addImgLazyAttrs(sanitize(md.render(preprocessMarkdown(source ?? ''))));
}

export interface TocEntry {
  id: string;
  level: number;
  text: string;
}

/* ------------------------------------------------------------------ *
 *  Module-level LRU cache for ``renderMarkdownWithToc``.
 *
 *  Why: PostDetail re-runs the renderer inside ``useMemo`` whenever the
 *  ``post`` object identity changes, which happens on every background
 *  refetch even when the Markdown source is byte-identical. For a 30-字
 *  post the parse + sanitize cycle costs ~80–200 ms; cached repeat hits
 *  return in O(1).
 *
 *  Cache size is small (20 entries) — we expect a single reader to be
 *  navigating between a handful of recently-opened posts. Memory cost
 *  is bounded by the source length × 20 + the rendered HTML; sanity
 *  upper-bound ~5–10 MB which is well within a tab budget.
 * ------------------------------------------------------------------ */
const RENDER_CACHE_MAX = 20;
const renderCache = new Map<string, { html: string; toc: TocEntry[] }>();

/**
 * Render Markdown and extract a flat TOC of H1–H4 headings. Each heading gets
 * a deterministic, document-unique `id` attribute so the TOC links scroll to
 * the right spot via the URL fragment.
 */
export function renderMarkdownWithToc(source: string): { html: string; toc: TocEntry[] } {
  const raw = source ?? '';
  const cached = renderCache.get(raw);
  if (cached) {
    // Bump for LRU: re-insert so it becomes the most-recently-used. Map
    // iteration order = insertion order so deleting + re-adding moves the
    // entry to the tail in O(1).
    renderCache.delete(raw);
    renderCache.set(raw, cached);
    return cached;
  }
  const env: { toc: TocEntry[] } = { toc: [] };
  const html = md.render(preprocessMarkdown(raw), env);
  const result = { html: addImgLazyAttrs(sanitize(html)), toc: env.toc };
  renderCache.set(raw, result);
  // Evict the oldest if over capacity. ``Map.keys().next()`` is O(1).
  if (renderCache.size > RENDER_CACHE_MAX) {
    const oldest = renderCache.keys().next().value;
    if (oldest !== undefined) renderCache.delete(oldest);
  }
  return result;
}

/**
 * Apply `fn` to source segments that lie OUTSIDE fenced code blocks
 * (``` or ~~~). Code-fence contents are passed through verbatim so
 * preprocessors don't mangle inline HTML / table syntax shown as
 * code samples.
 */
export function mapOutsideFencedCodeBlocks(src: string, fn: (s: string) => string): string {
  const lines = src.split('\n');
  const out: string[] = [];
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  let buf: string[] = [];

  const flush = (transform: boolean) => {
    if (!buf.length) return;
    out.push(transform ? fn(buf.join('\n')) : buf.join('\n'));
    buf = [];
  };

  for (const line of lines) {
    const m = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if (m) {
      const ch = m[2]![0]!;
      const len = m[2]!.length;
      if (!inFence) {
        flush(true);
        inFence = true;
        fenceChar = ch;
        fenceLen = len;
        buf.push(line);
        continue;
      }
      if (ch === fenceChar && len >= fenceLen) {
        buf.push(line);
        flush(false);
        inFence = false;
        continue;
      }
    }
    buf.push(line);
  }
  flush(!inFence);
  return out.join('\n');
}

/**
 * Shared Markdown preprocessing for blog preview, rich-text editor load, and
 * paste. Repairs Yuque export quirks before markdown-it / tiptap-markdown parse.
 *
 * Stage ordering matters:
 *   1. Strip HTML comments (Yuque puts editor metadata in them).
 *   2. Unglue container fences glued to surrounding text (fence-external only).
 *   3. {@link applyYuqueCompatMode} — Yuque bold/colour/image quirks (fence-external only).
 *   4. GFM pipe tables → HTML (fence-external only).
 */
export function preprocessMarkdown(src: string): string {
  let out = (src ?? '').replace(/<!--[\s\S]*?-->/g, '');
  out = mapOutsideFencedCodeBlocks(out, unglueContainerFences);
  out = mapOutsideFencedCodeBlocks(out, applyYuqueCompatMode);
  out = mapOutsideFencedCodeBlocks(out, convertGfmPipeTables);
  return out;
}

/**
 * Yuque / 语雀 Markdown 兼容模式：在 fence 外统一修复导出怪癖，避免逐条补丁遗漏。
 * 顺序：反引号 unwrap → 图片 emoji → font→span → emphasis 合并 → 括号 bold → bold+HTML。
 */
export function applyYuqueCompatMode(src: string): string {
  let out = src;
  out = unwrapBacktickedEmphasis(out);
  out = normalizeYuqueImages(out);
  out = unwrapBacktickedHtml(out);
  out = normalizeLegacyHtmlTags(out);
  out = normalizeYuqueEmphasis(out);
  out = normalizeBoldWithInteriorParens(out);
  out = normalizeBoldWrappingInlineHtml(out);
  return out;
}

/** Map legacy ``<font>`` tags to ``<span style>`` so Tiptap Color can parse them.
 *
 * Iteratively replaces the **innermost** ``<font>`` tag (one whose body does
 * NOT contain another ``<font>``) up to a fixed point. This is the only safe
 * way to handle nested ``<font>`` from Yuque exports — a greedy/non-greedy
 * outer match would either pair the wrong close or cut the inner span off.
 */
export function normalizeLegacyHtmlTags(src: string): string {
  // Innermost-font: no other `<font` inside the body.
  const INNER_FONT = /<font\b([^>]*)>((?:(?!<font\b)[\s\S])*?)<\/font>/gi;
  let out = src;
  for (let i = 0; i < 32; i++) {
    const next = out.replace(INNER_FONT, replaceFontOnce);
    if (next === out) break;
    out = next;
  }
  return out;
}

function replaceFontOnce(_match: string, attrs: string, inner: string): string {
  const styleMatch = attrs.match(/style\s*=\s*(["'])([\s\S]*?)\1/i);
  let style = styleMatch?.[2]?.trim() ?? '';
  const colorAttr = attrs.match(/color\s*=\s*(["'])([\s\S]*?)\1/i)?.[2]?.trim();
  const face = attrs.match(/face\s*=\s*(["'])([\s\S]*?)\1/i)?.[2]?.trim();
  if (colorAttr && !/color\s*:/i.test(style)) {
    style = style ? `${style}; color: ${colorAttr}` : `color: ${colorAttr}`;
  }
  if (face && !/font-family\s*:/i.test(style)) {
    style = style ? `${style}; font-family: ${face}` : `font-family: ${face}`;
  }
  return style ? `<span style="${style}">${inner}</span>` : `<span>${inner}</span>`;
}

function isGfmTableLine(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isGfmTableSeparator(line: string): boolean {
  return /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(line);
}

/** Convert GFM pipe tables to HTML ``<table>`` blocks for tiptap-markdown (html:true).
 *
 * Returns the input unchanged when no plausible pipe-table line is present —
 * avoids the split('\n')/join cycle (and accidental ‘\r\n’ normalisation) for
 * the overwhelming majority of documents that have no tables.
 */
export function convertGfmPipeTables(src: string): string {
  // Quick short-circuit: nothing remotely table-shaped → bail before split.
  if (!/^\s*\|.*\|\s*$/m.test(src)) return src;

  const lines = src.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (isGfmTableLine(lines[i]!)) {
      const tableLines: string[] = [];
      while (i < lines.length && isGfmTableLine(lines[i]!)) {
        tableLines.push(lines[i]!);
        i++;
      }
      if (tableLines.length >= 2 && isGfmTableSeparator(tableLines[1]!)) {
        // Wrap in a scroll container so wide tables get horizontal scroll in
        // the reader instead of being clipped (see .jz-table-wrap in
        // markdown.css). Kept on one chunk with no blank lines so markdown-it
        // treats the whole thing as a single html_block.
        out.push(`<div class="jz-table-wrap">\n${tableMd.render(tableLines.join('\n')).trim()}\n</div>`);
      } else {
        out.push(...tableLines);
      }
    } else {
      out.push(lines[i]!);
      i++;
    }
  }
  return out.join('\n');
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
 *
 * Literal ``:::`` inside an inline code span (e.g. a docs table cell showing
 * `` `:::details 标题` ``) must NOT be unglued — splitting there breaks the
 * table and spawns a runaway container. {@link isInsideInlineCodeSpan} guards
 * every match; fenced code blocks are excluded at the call site via
 * {@link mapOutsideFencedCodeBlocks}.
 */
function isInsideInlineCodeSpan(src: string, index: number): boolean {
  // Count backtick *runs* between the line start and `index`: an odd count
  // means an inline code span is still open at that position. Runs (not raw
  // chars) so double-backtick delimiters (``code``) count once each.
  const lineStart = src.lastIndexOf('\n', index - 1) + 1;
  let runs = 0;
  for (let i = lineStart; i < index; i++) {
    if (src[i] === '`') {
      runs++;
      while (i + 1 < index && src[i + 1] === '`') i++;
    }
  }
  return runs % 2 === 1;
}

function unglueContainerFences(src: string): string {
  // Opener: ``...text:::info`` → ``...text\n\n:::info``.
  // Anchor on a non-newline char before ``:::`` and a word char after, so
  // we never split a literal ``::: separator (no following word)``.
  const out = src.replace(
    /([^\n])(:::[a-zA-Z][\w-]*)/g,
    (match, pre: string, fence: string, offset: number, whole: string) =>
      isInsideInlineCodeSpan(whole, offset + pre.length) ? match : `${pre}\n\n${fence}`,
  );
  // Closing: ``content:::`` → ``content\n\n:::``. Bare ``:::`` followed by
  // line-end or another fence, glued after non-newline content.
  return out.replace(
    /([^\n]):::(\s*\n|$)/g,
    (match, pre: string, tail: string, offset: number, whole: string) =>
      isInsideInlineCodeSpan(whole, offset + pre.length) ? match : `${pre}\n\n:::${tail}`,
  );
}

/**
 * Yuque sometimes wraps pure emphasis markers in backticks, e.g.
 *
 *   `**ORM（Object-Relational Mapping，对象关系映射）**`
 *
 * markdown-it treats the whole span as inline code, leaving literal ``**``
 * visible. We unwrap so emphasis can render normally. Runs before
 * {@link unwrapBacktickedHtml} so `` `**<font>…</font>**` `` chains cleanly.
 */
export function unwrapBacktickedEmphasis(src: string): string {
  let out = src;
  // **…** and __…__ — symmetric strong markers.
  out = out.replace(/`(\*\*)([^`]+?)\1`/g, '$1$2$1');
  out = out.replace(/`(__)([^`]+?)\1`/g, '$1$2$1');
  // *…* italic — body must not contain * to avoid greedy false positives.
  out = out.replace(/`(\*)([^*`]+?)\1`/g, '$1$2$1');
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
  // Include <span> — colour-picker now emits <span style="color:…"> instead
  // of <font>, and Yuque exports increasingly include backticked spans too.
  const tags = '(?:font|span|u|mark|kbd|sub|sup|br)';
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

/** Yuque inline whitespace inside emphasis (NBSP, ideographic space). */
const YUQUE_INNER_WS = '[ \\t\\u00a0\\u3000]';

/**
 * Yuque exports prefix markdown images with a picture emoji, e.g.
 * ``🖼️![](https://cdn.nlark.com/...)``. The emoji breaks markdown-it's
 * image tokenization so the whole line renders as plain text.
 */
export function normalizeYuqueImages(src: string): string {
  let out = src;
  // Strip zero-width / BOM immediately before image syntax.
  out = out.replace(/[\u200b\uFEFF]+(?=\s*!\[)/g, '');
  // Yuque picture emoji (with optional VS16) before ![
  out = out.replace(/🖼\uFE0F?(?=\s*!\[)/g, '');
  return out;
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
    const inlineTag = '(?:font|span|u|mark|kbd|sub|sup)';
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
  // intended spaces. Includes NBSP / full-width space from Yuque exports.
  const wsOpen = new RegExp(`(?<![\\w*])\\*\\*${YUQUE_INNER_WS}+([^*\\n]+?)\\*\\*(?![\\w*])`, 'g');
  const wsClose = new RegExp(`(?<![\\w*])\\*\\*([^*\\n]+?)${YUQUE_INNER_WS}+\\*\\*(?![\\w*])`, 'g');
  out = out.replace(wsOpen, '**$1**');
  out = out.replace(wsClose, '**$1**');

  // (4) Merge two adjacent bolds separated only by whitespace into one:
  // ``**A** **B**`` → ``**A B**``. Yuque's exporter often closes/reopens
  // bold across a stray space so this collapses them back into one clean
  // span. Iterate to handle long chains ``**A** **B** **C**`` → ``**A B C**``.
  // The callback joins the two halves with a single space and collapses any
  // resulting double-spacing from trailing whitespace inside ``A`` or leading
  // whitespace inside ``B``.
  const adjWs = new RegExp(`\\*\\*([^*\\n]+?)\\*\\*(${YUQUE_INNER_WS}+)\\*\\*([^*\\n]+?)\\*\\*`, 'g');
  for (let i = 0; i < 8; i++) {
    const next = out.replace(
      adjWs,
      (_, a: string, _gap: string, c: string) =>
        '**' + (a.trimEnd() + ' ' + c.trimStart()).replace(/\s+/g, ' ') + '**',
    );
    if (next === out) break;
    out = next;
  }

  // (5) Same for the alternate ``__…__`` strong syntax.
  const uOpen = new RegExp(`__${YUQUE_INNER_WS}+([^_\\n]+?)__`, 'g');
  const uClose = new RegExp(`__([^_\\n]+?)${YUQUE_INNER_WS}+__`, 'g');
  out = out.replace(uOpen, '__$1__');
  out = out.replace(uClose, '__$1__');

  // (6) Italic ``_…_`` — Yuque often emits ``_ word_`` or ``_word _`` because
  // its WYSIWYG exporter is sloppy about inner whitespace. CommonMark forbids
  // both forms so the entire span ends up as raw underscores. We anchor on
  // ``\w`` lookbehind/lookahead so ``snake_case`` identifiers stay untouched
  // (those have word chars on both sides of every ``_``).
  const iOpen = new RegExp(`(?<!\\w)_${YUQUE_INNER_WS}+([^_\\n]+?)_(?!\\w)`, 'g');
  const iClose = new RegExp(`(?<!\\w)_([^_\\n]+?)${YUQUE_INNER_WS}+_(?!\\w)`, 'g');
  out = out.replace(iOpen, '_$1_');
  out = out.replace(iClose, '_$1_');

  return out;
}

/**
 * CommonMark / markdown-it refuse ``**foo (bar)**`` when parentheses sit
 * inside the delimiter run (left-/right-flanking rules). Yuque exports
 * many such terms — convert to ``<strong>`` HTML (``html: true``).
 */
export function normalizeBoldWithInteriorParens(src: string): string {
  return src.replace(
    /\*\*([^*\n]+?[(\uFF08][^*\n]*?[)\uFF09][^*\n]*?)\*\*/g,
    '<strong>$1</strong>',
  );
}

const YUQUE_INLINE_HTML_TAG = '(?:font|span|u|mark|kbd|sub|sup)';

/**
 * markdown-it cannot parse ``**<span>…</span>**`` (delimiter runs must not cross
 * inline HTML). Yuque often colours a bold phrase with ``<font>``/``<span>``.
 * Convert to ``<strong>…</strong>`` so bold + colour both render.
 */
export function normalizeBoldWrappingInlineHtml(src: string): string {
  const tag = YUQUE_INLINE_HTML_TAG;
  let out = src;

  const reWhole = new RegExp(
    `\\*\\*(<(${tag})\\b[^>]*>[^*\\n]*?</\\2>)\\*\\*`,
    'gi',
  );
  out = out.replace(reWhole, '<strong>$1</strong>');

  const reInner = new RegExp(
    `\\*\\*([^*\\n]*<(?:${tag})\\b[^>]*>[^*\\n]*)\\*\\*`,
    'gi',
  );
  out = out.replace(reInner, '<strong>$1</strong>');

  const reWholeAlt = new RegExp(`__(<(${tag})\\b[^>]*>[^_\\n]*?</\\2>)__`, 'gi');
  out = out.replace(reWholeAlt, '<strong>$1</strong>');

  const reInnerAlt = new RegExp(`__([^_\\n]*<(?:${tag})\\b[^>]*>[^_\\n]*)__`, 'gi');
  out = out.replace(reInnerAlt, '<strong>$1</strong>');

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
