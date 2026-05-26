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
from markdown_it import MarkdownIt

from ..scope import ExportScope

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

_md_renderer = MarkdownIt("commonmark", {"breaks": True, "linkify": True}).enable("table")


def render_markdown(text: str) -> str:
    return _md_renderer.render(text or "")


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
<body>
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
    """Prefer published body; fall back to raw draft when nothing was published."""
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


def doc_html_body(scope: ExportScope, render: bool = True) -> str:
    """Concatenate every document in scope into a single HTML body.

    HTML-format documents (``detect_doc_format == 'html'``) are kept as their
    original markup — only the ``<body>`` contents are extracted so they nest
    cleanly inside the surrounding shell, instead of being run through the
    Markdown renderer (which would mangle real HTML).
    """
    from apps.knowledge.serializers import detect_doc_format

    parts: list[str] = []
    for doc in scope.documents:
        title = _escape(doc.title)
        meta = f'<div class="post-meta">{_escape(doc.knowledge_base.name)}'
        if doc.published_at:
            meta += f" · {doc.published_at.strftime('%Y-%m-%d')}"
        meta += "</div>"
        content = doc_export_body(doc)
        if detect_doc_format(doc) == "html":
            body = html_body_or_self(content)
        else:
            body = render_markdown(content) if render else content
        parts.append(
            f'<section class="post" id="doc-{doc.id}">\n'
            f"<h1>{title}</h1>\n{meta}\n{body}\n</section>"
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
