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


def _render_fence(self, tokens, idx, options, env):
    token = tokens[idx]
    info = (token.info or "").strip()
    lang = info.split()[0] if info else ""
    label = lang or "text"
    body = _highlight_code(token.content, lang)
    return (
        f'<div class="jz-code-block" data-code-theme="one-dark-pro" data-lang="{_escape(lang)}">'
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


def render_markdown(text: str) -> str:
    """Preprocess + render Markdown to an HTML fragment."""
    prepared = preprocess_markdown(text)
    return _rewrite_doc_links(_RENDERER.render(prepared))
