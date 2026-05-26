"""Shared helpers for export services."""
from __future__ import annotations

import base64
import mimetypes
import re
import uuid
import zipfile
from io import BytesIO
from pathlib import Path

from django.conf import settings

from ..scope import ExportScope
from . import markdown_render

# Cap per-file embed size for standalone HTML/PDF (avoids multi-hundred-MB exports).
MAX_EMBED_BYTES = 10 * 1024 * 1024

_MEDIA_URL_RE = re.compile(
    r"""(?P<attr>src|href)\s*=\s*["'](?P<url>/media/[^"']+)["']""",
    re.I,
)
_MD_IMAGE_RE = re.compile(r"!\[[^\]]*\]\((?P<url>/media/[^)]+)\)")

_HTML_BODY_RE = re.compile(r"<body[^>]*>(.*?)</body>", re.S | re.I)


def html_body_or_self(html: str) -> str:
    """Return the contents of ``<body>…</body>`` if present, else the input.

    Used to embed an HTML-format document inside our export shell without the
    nested ``<html>``/``<head>`` tags clobbering the wrapper page.
    """
    if not html:
        return ""
    match = _HTML_BODY_RE.search(html)
    return match.group(1) if match else html


_HEAD_RE = re.compile(r"<head[^>]*>(.*?)</head>", re.S | re.I)
_STYLE_RE = re.compile(r"<style[^>]*>.*?</style>", re.S | re.I)

# Cleared on embedded HTML before measuring iframe height: authored pages often
# set ``min-height: 50vh`` on hero/cover shells, which balloons as we grow the
# iframe to ``scrollHeight``. Mirrors the blog reader's VH override.
_VH_OVERRIDE_STYLE = (
    "<style>"
    ':where(.hero,[class*="hero"],.cover,[class*="cover"],'
    '.banner,[class*="banner"]){min-height:0!important;}'
    ":where(html,body){min-height:0!important;}"
    "</style>"
)


def prepare_full_html_document(content: str) -> str:
    """Wrap a bare HTML fragment in a minimal full page; pass full pages through."""
    from apps.knowledge.html_content import looks_like_html

    text = content or ""
    if looks_like_html(text):
        return text
    return (
        '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head>'
        f"<body>{text}</body></html>"
    )


def escape_srcdoc(html: str) -> str:
    """Escape for use inside a double-quoted ``iframe[srcdoc]`` attribute."""
    return (html or "").replace("&", "&amp;").replace('"', "&quot;")


def extract_head_styles(html: str) -> str:
    """Collect ``<style>`` blocks from the document head (for print flattening)."""
    match = _HEAD_RE.search(html or "")
    region = match.group(1) if match else ""
    return "\n".join(m.group(0) for m in _STYLE_RE.finditer(region))


def _inject_vh_override(html: str) -> str:
    if "</head>" in html:
        return html.replace("</head>", _VH_OVERRIDE_STYLE + "</head>", 1)
    return _VH_OVERRIDE_STYLE + html


# Resolve relative URLs / #anchors inside the iframe rather than against the
# embedding page (which otherwise trips Chromium's "Unsafe attempt to load URL
# ... Domains, protocols and ports must match" guard for in-doc TOC links).
_SRCDOC_BASE = '<base href="about:srcdoc">'
_HEAD_OPEN_RE = re.compile(r"<head[^>]*>", re.I)


def _inject_srcdoc_base(html: str) -> str:
    if re.search(r"<base\b", html, re.I):
        return html  # respect an author-declared base
    match = _HEAD_OPEN_RE.search(html)
    if match:
        return html[: match.end()] + _SRCDOC_BASE + html[match.end() :]
    return _SRCDOC_BASE + html


def render_html_document_inline(content: str) -> str:
    """Flatten HTML: inline head ``<style>`` + body (no iframe).

    Shared by anthology interactive embed and print/PDF export.
    """
    full = prepare_full_html_document(content)
    full = rewrite_html_media(full, embed=True)
    styles = extract_head_styles(full)
    body = html_body_or_self(full)
    return f"{styles}{body}"


def _prepare_iframe_srcdoc_html(content: str) -> str:
    """Full HTML page prepared for ``iframe[srcdoc]`` (media, base, vh override)."""
    full = prepare_full_html_document(content)
    full = rewrite_html_media(full, embed=True)
    full = _inject_srcdoc_base(full)
    return _inject_vh_override(full)


def render_html_document_iframe_deferred(content: str) -> str:
    """Defer ``srcdoc`` until the panel is shown — avoids hidden-panel load issues."""
    full = _prepare_iframe_srcdoc_html(content)
    return (
        '<iframe class="export-html-frame" '
        'sandbox="allow-same-origin allow-scripts" '
        f'data-srcdoc="{escape_srcdoc(full)}"></iframe>'
    )


def render_html_document_embed(content: str) -> str:
    """Inline HTML body for anthology panel switching (reliable offline viewing)."""
    return f'<div class="export-html-embed">{render_html_document_inline(content)}</div>'


def render_html_document_print(content: str) -> str:
    """Inline HTML for print/PDF pagination (same flattening as embed)."""
    return f'<div class="export-html-print">{render_html_document_inline(content)}</div>'


_HTML_TAG_RE = re.compile(r"<[^>]+>")


def html_to_plain_text(html: str) -> str:
    """Strip tags and collapse whitespace — used for search snippets."""
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html or "", flags=re.S | re.I)
    text = _HTML_TAG_RE.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


def export_root() -> Path:
    """Lazy ``exports/`` dir beside ``MEDIA_ROOT`` (respects runtime settings)."""
    root = Path(settings.MEDIA_ROOT).parent / "exports"
    root.mkdir(parents=True, exist_ok=True)
    return root

_EXPORT_MARKDOWN_CSS: str | None = None


def render_markdown(text: str) -> str:
    """Render Markdown to HTML (preprocess + enhanced markdown-it)."""
    return markdown_render.render_markdown(text)


def load_export_markdown_css() -> str:
    """Read bundled export markdown styles (cached)."""
    global _EXPORT_MARKDOWN_CSS
    if _EXPORT_MARKDOWN_CSS is None:
        path = Path(__file__).resolve().parent.parent / "static" / "export-markdown.css"
        _EXPORT_MARKDOWN_CSS = path.read_text(encoding="utf-8")
    return _EXPORT_MARKDOWN_CSS


_EXPORT_ANTHOLOGY_CSS: str | None = None


def load_export_anthology_css() -> str:
    """Read bundled anthology shell styles — TOC + panel switching (cached)."""
    global _EXPORT_ANTHOLOGY_CSS
    if _EXPORT_ANTHOLOGY_CSS is None:
        path = Path(__file__).resolve().parent.parent / "static" / "export-anthology.css"
        _EXPORT_ANTHOLOGY_CSS = path.read_text(encoding="utf-8")
    return _EXPORT_ANTHOLOGY_CSS


def export_stylesheet() -> str:
    """Base + markdown export styles for HTML/PDF/site pages."""
    return BASE_CSS + load_export_markdown_css()


ANTHOLOGY_SHELL_CSS = """
:root { color-scheme: light; }
body.export-anthology {
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC",
               "Hiragino Sans GB", sans-serif;
  line-height: 1.7;
  color: #1f1f1f;
  background: #fff;
  margin: 0;
  max-width: none;
}
.export-main,
.export-doc-panel[data-format="markdown"] {
  background: #fff;
}
.export-doc-header h1 {
  margin-top: 0;
  font-size: 1.9em;
  font-weight: 600;
  line-height: 1.3;
}
.post-meta { color: #999; font-size: 13px; margin-bottom: 24px; }
"""


def export_anthology_stylesheet() -> str:
    """Anthology shell CSS — no global BASE_CSS (keeps MD panels on default white)."""
    return ANTHOLOGY_SHELL_CSS + load_export_markdown_css() + load_export_anthology_css()


def render_document_body_html(
    doc, *, embed_media: bool = True, export_mode: str = "interactive"
) -> str:
    """Render one document body to an HTML fragment for export shells.

    Interactive anthology HTML uses a deferred ``iframe[srcdoc]`` (style-isolated);
    print/PDF flattens HTML inline for Chromium pagination.
    """
    from apps.knowledge.serializers import detect_doc_format

    content = doc_export_body(doc)
    if detect_doc_format(doc) == "html":
        if export_mode == "print":
            return render_html_document_print(content)
        return render_html_document_iframe_deferred(content)

    md = content
    if not embed_media:
        md = rewrite_markdown_media_paths(md)
    html = render_markdown(md)
    html = rewrite_html_media(
        html,
        embed=embed_media,
        asset_prefix="" if embed_media else "assets/",
    )
    return f'<div class="jz-markdown export-markdown">{html}</div>'


def safe_slug(name: str) -> str:
    """Filesystem-safe slug (allows unicode word chars + dash/underscore)."""
    cleaned = re.sub(r"[\\/<>:\"|?*\x00-\x1f]+", "-", name).strip(" .-_")
    return cleaned or "untitled"


def reserve_export_path(suffix: str) -> Path:
    """Allocate a unique file path under exports/ with the given suffix."""
    fname = f"{uuid.uuid4().hex}{suffix}"
    return export_root() / fname


def write_text(path: Path, content: str) -> int:
    path.write_text(content, encoding="utf-8")
    return path.stat().st_size


def write_bytes(path: Path, content: bytes) -> int:
    path.write_bytes(content)
    return path.stat().st_size


HTML_SHELL = """\
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>{title}</title>
<style>{css}</style>
</head>
<body class="{body_class}">
<article class="post">
{body}
</article>
</body>
</html>
"""

BASE_CSS = """
:root { color-scheme: light; }
body { font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC",
       "Hiragino Sans GB", sans-serif; line-height: 1.7; color: #1f1f1f;
       max-width: 760px; margin: 32px auto; padding: 0 24px; }
h1,h2,h3,h4 { line-height: 1.3; font-weight: 600; margin-top: 1.4em; }
h1 { font-size: 1.9em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid #f0f0f0; padding-bottom: 0.25em; }
h3 { font-size: 1.25em; }
p { margin: 0.8em 0; }
ul, ol { padding-left: 1.6em; margin: 0.6em 0; }
blockquote { border-left: 4px solid #d9d9d9; background: #f6f8fa; color: #555;
             padding: 0.4em 1em; margin: 0.8em 0; }
code { background: #f0f0f0; padding: 1px 6px; border-radius: 4px;
       font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
pre { background: #282c34; color: #eaeaea; padding: 12px 16px; border-radius: 6px;
      overflow: auto; line-height: 1.5; font-size: 0.9em; }
pre code { background: transparent; color: inherit; padding: 0; }
table { border-collapse: collapse; margin: 1em 0; }
th, td { border: 1px solid #e5e5e5; padding: 6px 10px; }
hr { border: none; border-top: 1px solid #eee; margin: 1.5em 0; }
a { color: #1677ff; text-decoration: none; }
a:hover { text-decoration: underline; }
img { max-width: 100%; height: auto; }
.post-meta { color: #999; font-size: 13px; margin-bottom: 24px; }
.post + .post { margin-top: 64px; border-top: 2px solid #eee; padding-top: 32px; }
"""


def doc_export_body(doc) -> str:
    """Document body for export — matches blog HTML resolution when format is html."""
    from apps.knowledge.html_content import resolve_html_body
    from apps.knowledge.serializers import detect_doc_format

    if detect_doc_format(doc) == "html":
        return resolve_html_body(doc) or ""
    published = (doc.published_content or "").strip()
    if published:
        return doc.published_content or ""
    return doc.raw_content or ""


def _resolve_media_path(url: str) -> Path | None:
    """Map ``/media/uploads/...`` to a path under ``MEDIA_ROOT``."""
    if not url or not url.startswith("/media/"):
        return None
    rel = url[len("/media/") :].lstrip("/")
    path = (Path(settings.MEDIA_ROOT) / rel).resolve()
    root = Path(settings.MEDIA_ROOT).resolve()
    if not str(path).startswith(str(root)):
        return None
    return path if path.is_file() else None


def _embed_file_as_data_uri(path: Path) -> str | None:
    size = path.stat().st_size
    if size > MAX_EMBED_BYTES:
        return None
    mime, _ = mimetypes.guess_type(path.name)
    mime = mime or "application/octet-stream"
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{data}"


def rewrite_html_media(html: str, *, embed: bool = True, asset_prefix: str = "") -> str:
    """Rewrite ``/media/...`` in HTML to data URIs or zip-relative ``assets/`` paths."""

    def repl(match: re.Match) -> str:
        attr = match.group("attr")
        url = match.group("url")
        path = _resolve_media_path(url)
        if not path:
            return match.group(0)
        if embed:
            data_uri = _embed_file_as_data_uri(path)
            if data_uri:
                return f'{attr}="{data_uri}"'
        elif asset_prefix:
            rel = url[len("/media/") :].lstrip("/")
            return f'{attr}="{asset_prefix}{rel}"'
        return match.group(0)

    return _MEDIA_URL_RE.sub(repl, html or "")


def collect_html_media(html: str) -> list[tuple[str, bytes]]:
    """Return ``(zip_path, bytes)`` for local files referenced in HTML attributes."""
    entries: list[tuple[str, bytes]] = []
    seen: set[str] = set()
    for match in _MEDIA_URL_RE.finditer(html or ""):
        url = match.group("url")
        path = _resolve_media_path(url)
        if not path or url in seen:
            continue
        seen.add(url)
        rel = url[len("/media/") :].lstrip("/")
        entries.append((f"assets/{rel}", path.read_bytes()))
    return entries


def collect_markdown_media(markdown: str) -> list[tuple[str, bytes]]:
    """Return ``(zip_path, bytes)`` for local images referenced in markdown."""
    entries: list[tuple[str, bytes]] = []
    seen: set[str] = set()
    for match in _MD_IMAGE_RE.finditer(markdown or ""):
        url = match.group("url")
        path = _resolve_media_path(url)
        if not path or url in seen:
            continue
        seen.add(url)
        rel = url[len("/media/") :].lstrip("/")
        zip_name = f"assets/{rel}"
        entries.append((zip_name, path.read_bytes()))
    return entries


def rewrite_markdown_media_paths(markdown: str, prefix: str = "assets/") -> str:
    """Point ``![](/media/...)`` at zip-relative ``assets/...`` paths."""

    def repl(match: re.Match) -> str:
        url = match.group("url")
        path = _resolve_media_path(url)
        if not path:
            return match.group(0)
        rel = url[len("/media/") :].lstrip("/")
        return match.group(0).replace(url, f"{prefix}{rel}")

    return _MD_IMAGE_RE.sub(repl, markdown or "")


def _doc_meta_html(doc) -> str:
    meta = _escape(doc.knowledge_base.name)
    if doc.published_at:
        meta += f" · {doc.published_at.strftime('%Y-%m-%d')}"
    return f'<div class="post-meta">{meta}</div>'


def doc_panels_html(scope: ExportScope, *, export_mode: str = "interactive") -> str:
    """Render each document as a switchable ``.export-doc-panel`` section.

    In ``interactive`` mode all panels but the first carry ``hidden`` (the TOC
    JS toggles them); in ``print`` mode every panel stays visible for pagination.
    """
    from apps.exporter.anthology_tree import iter_tree_documents
    from apps.knowledge.serializers import detect_doc_format

    parts: list[str] = []
    docs_ordered = iter_tree_documents(scope.kb, scope.documents)
    for idx, doc in enumerate(docs_ordered):
        fmt = "html" if detect_doc_format(doc) == "html" else "markdown"
        body = render_document_body_html(doc, embed_media=True, export_mode=export_mode)
        hidden = " hidden" if export_mode == "interactive" and idx > 0 else ""
        if fmt == "html":
            header = ""
        else:
            header = (
                f'<header class="export-doc-header"><h1>{_escape(doc.title)}</h1>'
                f"{_doc_meta_html(doc)}</header>\n"
            )
        parts.append(
            f'<section class="export-doc-panel" id="doc-{doc.id}" '
            f'data-format="{fmt}"{hidden}>\n'
            f"{header}{body}\n</section>"
        )
    return "\n".join(parts)


def _escape(text: str) -> str:
    return (
        (text or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def make_zip(entries: list[tuple[str, bytes]]) -> bytes:
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in entries:
            zf.writestr(name, data)
    return buf.getvalue()
