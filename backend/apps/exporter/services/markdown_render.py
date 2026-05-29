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

# Mermaid / PlantUML are intentionally rendered as **annotated** code blocks
# in offline exports — the reader has no JS to run mermaid.run(), so the best
# we can offer is a clearly-labelled "diagram source" panel that copy-pastes
# back into the editor cleanly. (Documented in CLAUDE.md "Mermaid/PlantUML
# 在离线导出中为带语言标签的代码块，无运行时渲染.")
_DIAGRAM_LANGS = {"mermaid", "plantuml", "puml"}


def _render_fence(self, tokens, idx, options, env):
    token = tokens[idx]
    info = (token.info or "").strip()
    lang = info.split()[0] if info else ""
    label = lang or "text"
    theme = _CODE_THEME["value"]
    if lang.lower() in _DIAGRAM_LANGS:
        # Distinct chrome — readers grok "this is a diagram source, not
        # ordinary code" without needing JS-driven rendering. The body keeps
        # plain text + a hint banner so users can paste it into a live
        # JianZhai instance to re-render.
        body_text = token.content.rstrip("\n")
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
    body = _highlight_code(token.content, lang)
    return (
        f'<div class="jz-code-block" data-code-theme="{_escape(theme)}" data-lang="{_escape(lang)}">'
        f'<div class="jz-code-toolbar"><span class="jz-code-lang">{_escape(label)}</span></div>'
        f'<pre class="jz-code-pre"><code class="language-{_escape(lang)} hljs">{body}</code></pre>'
        f"</div>\n"
    )


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
    return md


_RENDERER = _build_renderer()


_DOC_LINK_HREF = re.compile(r'href="doc:(\d+)"')


def _rewrite_doc_links(html: str) -> str:
    return _DOC_LINK_HREF.sub(r'href="#doc-\1"', html)


def render_markdown(text: str, *, code_theme: str | None = None) -> str:
    """Preprocess + render Markdown to an HTML fragment.

    ``code_theme`` overrides the code-block ``data-code-theme`` attribute so
    callers (interactive HTML, static-site export, …) can wire it through to
    a user preference instead of the hardcoded one-dark-pro default. Restored
    to default once the renderer returns so concurrent calls don't poison
    each other (the renderer instance is module-level for caching reasons).
    """
    prepared = preprocess_markdown(text)
    previous = _CODE_THEME["value"]
    if code_theme:
        _CODE_THEME["value"] = code_theme
    try:
        return _rewrite_doc_links(_RENDERER.render(prepared))
    finally:
        _CODE_THEME["value"] = previous
