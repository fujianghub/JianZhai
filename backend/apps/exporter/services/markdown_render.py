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
    """
    prepared = preprocess_markdown(text)
    previous = _CODE_THEME["value"]
    if code_theme:
        _CODE_THEME["value"] = code_theme
    env = {"diagram_svgs": diagram_svgs or {}}
    try:
        return _rewrite_doc_links(_RENDERER.render(prepared, env))
    finally:
        _CODE_THEME["value"] = previous
