"""Shared helpers for export services."""
from __future__ import annotations

import re
import uuid
import zipfile
from io import BytesIO
from pathlib import Path

from django.conf import settings
from markdown_it import MarkdownIt

from ..scope import ExportScope

EXPORT_ROOT = Path(settings.MEDIA_ROOT).parent / "exports"
EXPORT_ROOT.mkdir(parents=True, exist_ok=True)

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
    return EXPORT_ROOT / fname


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


def doc_html_body(scope: ExportScope, render: bool = True) -> str:
    """Concatenate every document in scope into a single HTML body."""
    parts: list[str] = []
    for doc in scope.documents:
        title = _escape(doc.title)
        meta = f'<div class="post-meta">{_escape(doc.knowledge_base.name)}'
        if doc.published_at:
            meta += f" · {doc.published_at.strftime('%Y-%m-%d')}"
        meta += "</div>"
        body = render_markdown(doc.raw_content) if render else (doc.raw_content or "")
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
