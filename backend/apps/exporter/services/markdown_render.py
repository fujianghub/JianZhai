"""Enhanced markdown-it renderer for offline HTML/PDF export."""
from __future__ import annotations

import html
import re

from markdown_it import MarkdownIt
from mdit_py_plugins.container import container_plugin
from mdit_py_plugins.deflist import deflist_plugin
from mdit_py_plugins.footnote import footnote_plugin
from mdit_py_plugins.gfm import gfm_plugin
from mdit_py_plugins.tasklists import tasklists_plugin

from pygments.lexers import get_lexer_by_name
from pygments.token import Token
from pygments.util import ClassNotFound

from .card_placeholders import (
    CardMeta,
    convert_card_placeholders,
    degrade_card_placeholders,
)
from .markdown_preprocess import preprocess_markdown

_CALLOUT_VALIDATE = re.compile(r"^[^\s]+(\s+.*)?$")


def _escape(text: str) -> str:
    return html.escape(text or "", quote=True)


def _render_callout(self, tokens, idx, options, env):
    token = tokens[idx]
    if token.nesting == 1:
        info = (token.info or "").strip()
        parts = info.split(None, 1)
        raw_kind = parts[0] if parts else "note"
        kind = re.sub(r"[^a-z0-9_-]", "", raw_kind.lower()) or "note"
        title = parts[1].strip() if len(parts) > 1 else ""
        title_html = (
            f'<div class="jz-callout-title">{_escape(title)}</div>' if title else ""
        )
        return (
            f'<div class="jz-callout jz-callout-{kind}">{title_html}'
            f'<div class="jz-callout-body">'
        )
    return "</div></div>\n"


def _token_to_hljs_class(ttype) -> str:
    """Map a Pygments token type to highlight.js-style class names."""
    if ttype in Token.Comment:
        return "hljs-comment"
    if ttype in Token.Keyword:
        return "hljs-keyword"
    if ttype in Token.String:
        return "hljs-string"
    if ttype in Token.Number:
        return "hljs-number"
    if ttype in Token.Name.Function:
        return "hljs-title function_"
    if ttype in Token.Name.Class:
        return "hljs-title class_"
    if ttype in Token.Name.Builtin:
        return "hljs-built_in"
    if ttype in Token.Name.Tag:
        return "hljs-tag"
    if ttype in Token.Name.Attribute:
        return "hljs-attr"
    if ttype in Token.Operator:
        return "hljs-operator"
    if ttype in Token.Literal:
        return "hljs-literal"
    if ttype in Token.Generic.Emph:
        return "hljs-emphasis"
    if ttype in Token.Generic.Strong:
        return "hljs-strong"
    if ttype in Token.Generic.Deleted:
        return "hljs-deletion"
    if ttype in Token.Generic.Inserted:
        return "hljs-addition"
    if ttype in Token.Text:
        return "hljs"
    return "hljs"


def _highlight_code(code: str, lang: str) -> str:
    text = code.rstrip("\n")
    if not text:
        return ""
    try:
        lexer = get_lexer_by_name(lang or "text", stripall=True)
    except ClassNotFound:
        try:
            lexer = get_lexer_by_name("text", stripall=True)
        except ClassNotFound:
            return _escape(text)
    parts: list[str] = []
    for ttype, value in lexer.get_tokens(text):
        if not value:
            continue
        if ttype in Token.Text and not value.strip():
            parts.append(_escape(value))
            continue
        css = _token_to_hljs_class(ttype)
        parts.append(f'<span class="{css}">{_escape(value)}</span>')
    return "".join(parts)


# Per-render code-block theme. Default keeps backwards compat with existing
# exports; render_markdown() accepts an override so future Admin UI / export
# options can flow user preference through cleanly.
DEFAULT_CODE_THEME = "one-dark-pro"
_CODE_THEME = {"value": DEFAULT_CODE_THEME}

# Mermaid blocks are rendered to inline SVG ahead of time by
# ``diagram_render`` (headless Chromium) and threaded in via ``env`` so offline
# HTML/PDF exports show the actual diagram. When that SVG isn't available
# (Playwright missing, syntax error, or a PlantUML block we don't render), the
# fence degrades to a clearly-labelled "diagram source" panel that copy-pastes
# back into the editor cleanly.
_DIAGRAM_LANGS = {"mermaid", "plantuml", "puml"}
# Only Mermaid is rendered to SVG server-side; PlantUML needs a separate server.
MERMAID_LANGS = {"mermaid"}

# Per-diagram graphic palette pinned via the ``mtheme=`` fence token (frontend
# CodeBlock ``mermaidTheme`` attribute). Mirrors the frontend allow-list — an
# unrecognised value is ignored so we never feed arbitrary input to Mermaid.
_MERMAID_BUILTIN_THEMES = {"default", "base", "dark", "forest", "neutral"}
_MTHEME_RE = re.compile(r"\bmtheme=([A-Za-z0-9-]+)")


def _fence_lang(token) -> str:
    info = (token.info or "").strip()
    return (info.split()[0] if info else "").lower()


def _mermaid_theme_from_info(info: str) -> str:
    """Extract a validated ``mtheme=`` graphic theme from a fence info line."""
    m = _MTHEME_RE.search(info or "")
    if not m:
        return ""
    theme = m.group(1)
    return theme if theme in _MERMAID_BUILTIN_THEMES else ""


def _apply_mermaid_theme(body: str, theme: str) -> str:
    """Prepend a Mermaid ``%%{init}%%`` directive pinning this diagram's palette.

    The directive travels with the source so it both (a) overrides the global
    ``theme:default`` during headless render and (b) makes the source-keyed SVG
    map distinct per theme. Used identically by ``collect_mermaid_sources`` (the
    render key) and ``_render_fence`` (the lookup key) so the two always line up.
    Leaves an author's own leading ``%%{init}%%`` directive untouched.
    """
    if not theme:
        return body
    if body.lstrip().startswith("%%{init"):
        return body
    # Plain concatenation — neither %-formatting (eats ``%%``) nor str.format
    # (chokes on the ``{`` ``}``) survive this literal cleanly.
    return '%%{init: {"theme": "' + theme + '"}}%%\n' + body


def _render_diagram_source_panel(lang: str, body_text: str, theme: str) -> str:
    label = lang or "text"
    return (
        f'<div class="jz-code-block jz-code-diagram jz-code-{_escape(lang)}" '
        f'data-code-theme="{_escape(theme)}" data-lang="{_escape(lang)}">'
        f'<div class="jz-code-toolbar">'
        f'<span class="jz-code-lang">{_escape(label)}</span>'
        f'<span class="jz-code-diagram-hint">图表源码（离线导出不渲染图）</span>'
        f'</div>'
        f'<pre class="jz-code-pre"><code class="language-{_escape(lang)} hljs">'
        f"{_escape(body_text)}</code></pre>"
        f"</div>\n"
    )


def _render_fence(self, tokens, idx, options, env):
    token = tokens[idx]
    info = (token.info or "").strip()
    lang = info.split()[0] if info else ""
    label = lang or "text"
    theme = _CODE_THEME["value"]
    if lang.lower() in _DIAGRAM_LANGS:
        body_text = token.content.rstrip("\n")
        # A per-diagram graphic theme (mtheme=) is baked into the render key as
        # an init directive, so look up with the same directive-injected source
        # ``collect_mermaid_sources`` used. PlantUML carries no theme.
        keyed = (
            _apply_mermaid_theme(body_text, _mermaid_theme_from_info(info))
            if lang.lower() in MERMAID_LANGS
            else body_text
        )
        # Pre-rendered SVG (keyed by the exact fence body) wins — show the real
        # diagram. Otherwise fall back to the labelled source panel.
        svgs = env.get("diagram_svgs") if isinstance(env, dict) else None
        svg = svgs.get(keyed) if isinstance(svgs, dict) else None
        if svg:
            return (
                f'<div class="jz-diagram jz-diagram-{_escape(lang)}" '
                f'data-lang="{_escape(lang)}">{svg}</div>\n'
            )
        return _render_diagram_source_panel(lang, body_text, theme)
    body = _highlight_code(token.content, lang)
    return (
        f'<div class="jz-code-block" data-code-theme="{_escape(theme)}" data-lang="{_escape(lang)}">'
        f'<div class="jz-code-toolbar"><span class="jz-code-lang">{_escape(label)}</span></div>'
        f'<pre class="jz-code-pre"><code class="language-{_escape(lang)} hljs">{body}</code></pre>'
        f"</div>\n"
    )


def _render_table_open(self, tokens, idx, options, env) -> str:
    # Scroll wrapper so wide tables overflow with a scrollbar in interactive
    # HTML exports instead of being clipped (mirrors the reader's pipeline;
    # styles in export-markdown.css).
    return '<div class="jz-table-wrap">\n<table>\n'


def _render_table_close(self, tokens, idx, options, env) -> str:
    return "</table>\n</div>\n"


# ── heading anchors + numbering + [TOC] expansion ─────────────────────────
# Mirrors the frontend reader pipeline (``frontend/src/utils/markdown.ts`` +
# ``utils/headingNumber.ts``) so exported HTML/PDF/site get the same anchor ids,
# Yuque-style hierarchical numbers and expanded tables of contents.

# Keep byte-for-byte parity with the frontend ``slugify``: lowercase, spaces →
# dash, strip a fixed punctuation set, keep CJK intact, collapse dashes.
_SLUG_STRIP = re.compile(r"[!@#$%^&*()+={}\[\]|\\;:'\",.<>/?`~]")
_SLUG_SPACE = re.compile(r"\s+")
_SLUG_DASHES = re.compile(r"-+")


def _slugify(text: str) -> str:
    s = _SLUG_SPACE.sub("-", (text or "").strip().lower())
    s = _SLUG_STRIP.sub("", s)
    s = _SLUG_DASHES.sub("-", s).strip("-")
    return s or "section"


def _next_heading_number(stack: list[list[int]], level: int, min_l: int = 1, max_l: int = 6) -> str:
    """Advance the numbering cursor by one heading (see ``nextHeadingNumber``).

    ``stack`` entries are ``[level, count]``. Depth follows nesting depth, not
    raw markdown level, so ``h1→h2→h4`` yields ``1 / 1.1 / 1.1.1``.
    """
    if level < min_l or level > max_l:
        return ""
    while stack and stack[-1][0] > level:
        stack.pop()
    if stack and stack[-1][0] == level:
        stack[-1][1] += 1
    else:
        stack.append([level, 1])
    return ".".join(str(c) for _, c in stack)


def _heading_text(inline_token) -> str:
    if inline_token is None:
        return ""
    children = getattr(inline_token, "children", None)
    if children:
        return "".join(c.content for c in children if c.type in ("text", "code_inline"))
    return inline_token.content or ""


def _render_heading_open(self, tokens, idx, options, env):
    token = tokens[idx]
    level = int(token.tag[1:])  # h2 → 2
    text = _heading_text(tokens[idx + 1] if idx + 1 < len(tokens) else None)

    # Advance the numbering cursor for EVERY heading so depth stays correct even
    # when h5/h6 sit between numbered ones; only h1–h4 surface a visible number.
    number = ""
    if env.get("numbering"):
        number = _next_heading_number(env.setdefault("_num_stack", []), level)

    if level <= 4 and text:
        ids = env.setdefault("_ids", {})
        toc = env.setdefault("toc", [])
        base = _slugify(text)
        n = ids.get(base, 0)
        anchor = base if n == 0 else f"{base}-{n}"
        ids[base] = n + 1
        token.attrSet("id", anchor)
        toc.append({"id": anchor, "level": level, "text": text, "numbering": number or None})
        if number:
            return (
                self.renderToken(tokens, idx, options, env)
                + f'<span class="jz-heading-num">{_escape(number)}</span> '
            )
    return self.renderToken(tokens, idx, options, env)


_TOC_MARK_RE = re.compile(r'data-jz-toc="(section)?"')


def _render_html_block(self, tokens, idx, options, env):
    """Record ``[TOC]`` / ``[TOC:section]`` placeholder positions in document
    order (``at`` = headings seen so far) so a section TOC can later scope to the
    subtree under its enclosing heading. Non-TOC html blocks pass through."""
    content = tokens[idx].content
    m = _TOC_MARK_RE.search(content)
    if m:
        env.setdefault("_toc_marks", []).append(
            {"scope": "section" if m.group(1) == "section" else "all", "at": len(env.get("toc", []))}
        )
    return content


# Whole-line ``[TOC]`` / ``[TOC:section]`` → placeholder divs (mirrors the
# frontend ``convertBlockPlaceholders``). Only outside fenced code.
_TOC_LINE_RE = re.compile(r"^\[TOC\]\s*$")
_TOC_SECTION_LINE_RE = re.compile(r"^\[TOC:section\]\s*$")


def _convert_toc_placeholders(src: str) -> str:
    if "[TOC]" not in src and "[TOC:section]" not in src:
        return src
    out: list[str] = []
    in_fence = False
    for line in src.split("\n"):
        stripped = line.strip()
        if stripped.startswith("```") or stripped.startswith("~~~"):
            in_fence = not in_fence
            out.append(line)
            continue
        if not in_fence:
            if _TOC_LINE_RE.match(line):
                out.append('<div data-jz-toc="" class="jz-inline-toc-placeholder"></div>')
                continue
            if _TOC_SECTION_LINE_RE.match(line):
                out.append('<div data-jz-toc="section" class="jz-inline-toc-placeholder"></div>')
                continue
        out.append(line)
    return "\n".join(out)


_TOC_PLACEHOLDER_RE = re.compile(r'<div data-jz-toc="(section)?"[^>]*></div>')


def _render_toc_list(entries: list[dict]) -> str:
    if not entries:
        return ""
    min_level = min(e["level"] for e in entries)
    items = []
    for e in entries:
        num = e.get("numbering")
        num_html = f'<span class="jz-toc-num">{_escape(num)}</span> ' if num else ""
        items.append(
            f'<li class="jz-inline-toc-l{e["level"] - min_level + 1}">'
            f'<a href="#{_escape(e["id"])}">{num_html}{html.escape(e["text"], quote=False)}</a></li>'
        )
    return (
        '<div class="jz-inline-toc"><div class="jz-inline-toc-title">目录</div><ul>'
        + "".join(items)
        + "</ul></div>"
    )


def _section_entries(toc: list[dict], at: int) -> list[dict]:
    anchor_idx = at - 1
    if anchor_idx < 0 or anchor_idx >= len(toc):
        return []
    anchor_level = toc[anchor_idx]["level"]
    out: list[dict] = []
    for k in range(at, len(toc)):
        if toc[k]["level"] <= anchor_level:
            break
        out.append(toc[k])
    return out


def _expand_toc_placeholders(html_str: str, toc: list[dict], marks: list[dict]) -> str:
    if "data-jz-toc" not in html_str:
        return html_str
    counter = {"i": 0}

    def repl(match: re.Match) -> str:
        i = counter["i"]
        counter["i"] += 1
        mark = marks[i] if i < len(marks) else None
        scope = mark["scope"] if mark else ("section" if match.group(1) == "section" else "all")
        entries = _section_entries(toc, mark["at"]) if (scope == "section" and mark) else toc
        return _render_toc_list(entries)

    return _TOC_PLACEHOLDER_RE.sub(repl, html_str)


def _build_renderer() -> MarkdownIt:
    md = MarkdownIt("commonmark", {"breaks": True, "linkify": True, "html": True})
    gfm_plugin(md)
    tasklists_plugin(md)
    footnote_plugin(md)
    deflist_plugin(md)
    container_plugin(
        md,
        "callout",
        marker=":",
        validate=lambda params, name: bool(_CALLOUT_VALIDATE.match(params.strip())),
        render=_render_callout,
    )
    md.add_render_rule("fence", _render_fence)
    md.add_render_rule("table_open", _render_table_open)
    md.add_render_rule("table_close", _render_table_close)
    md.add_render_rule("heading_open", _render_heading_open)
    md.add_render_rule("html_block", _render_html_block)
    return md


_RENDERER = _build_renderer()


_DOC_LINK_HREF = re.compile(r'href="doc:(\d+)"')


def _rewrite_doc_links(html: str) -> str:
    return _DOC_LINK_HREF.sub(r'href="#doc-\1"', html)


def collect_mermaid_sources(text: str) -> list[str]:
    r"""Return the body of every ``\`\`\`mermaid`` fence, keyed exactly as the
    renderer keys them (so a pre-rendered SVG map lines up at render time).

    Parses through the same preprocess + tokenizer ``render_markdown`` uses, so
    ``token.content.rstrip("\\n")`` here is byte-for-byte the lookup key used in
    ``_render_fence``.
    """
    prepared = preprocess_markdown(text)
    out: list[str] = []
    for token in _RENDERER.parse(prepared, {}):
        if token.type == "fence" and _fence_lang(token) in MERMAID_LANGS:
            body = token.content.rstrip("\n")
            if body.strip():
                # Bake the pinned graphic theme into the render key so the
                # headless render honours it and the SVG map stays distinct
                # per theme. Must match ``_render_fence``'s lookup key exactly.
                out.append(_apply_mermaid_theme(body, _mermaid_theme_from_info(token.info or "")))
    return out


def render_markdown(
    text: str,
    *,
    code_theme: str | None = None,
    diagram_svgs: dict[str, str] | None = None,
    numbering: bool = False,
    card_meta: CardMeta | None = None,
) -> str:
    """Preprocess + render Markdown to an HTML fragment.

    ``code_theme`` overrides the code-block ``data-code-theme`` attribute so
    callers (interactive HTML, static-site export, …) can wire it through to
    a user preference instead of the hardcoded one-dark-pro default. Restored
    to default once the renderer returns so concurrent calls don't poison
    each other (the renderer instance is module-level for caching reasons).

    ``diagram_svgs`` maps a Mermaid fence body to its pre-rendered SVG (see
    ``collect_mermaid_sources`` + ``diagram_render``); matched blocks render as
    inline SVG, unmatched ones fall back to the source panel.

    ``numbering`` enables Yuque-style hierarchical heading numbering (from the
    document's ``heading_numbering`` flag). Headings always get anchor ids and
    ``[TOC]`` / ``[TOC:section]`` placeholders always expand — numbering only
    controls whether the visible ``1.2.1`` prefixes appear.

    ``card_meta`` 提供 ``[[doc-card:]]``/``[[link-card:]]`` 的元数据 →
    渲染成样式化卡片；未提供时兜底降级为普通链接，任何调用方都不会把
    ``[[...]]`` 字面量泄进导出物。
    """
    prepared = _convert_toc_placeholders(preprocess_markdown(text))
    if card_meta is not None:
        prepared = convert_card_placeholders(
            prepared, doc_titles=card_meta.doc_titles, link_meta=card_meta.link_meta
        )
    else:
        prepared = degrade_card_placeholders(prepared)
    previous = _CODE_THEME["value"]
    if code_theme:
        _CODE_THEME["value"] = code_theme
    env: dict = {"diagram_svgs": diagram_svgs or {}, "numbering": numbering}
    try:
        rendered = _RENDERER.render(prepared, env)
        rendered = _expand_toc_placeholders(
            rendered, env.get("toc", []), env.get("_toc_marks", [])
        )
        return _rewrite_doc_links(rendered)
    finally:
        _CODE_THEME["value"] = previous
