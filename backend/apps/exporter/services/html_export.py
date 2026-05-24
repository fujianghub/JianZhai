"""Single-page HTML export — every document concatenated, inline CSS, no external assets."""
from __future__ import annotations

from pathlib import Path

from apps.knowledge.serializers import detect_doc_format

from ..scope import ExportScope
from . import common


def render_html(scope: ExportScope) -> str:
    body = common.doc_html_body(scope)
    toc = _build_toc(scope) if len(scope.documents) > 1 else ""
    return common.HTML_SHELL.format(
        title=common._escape(scope.label),
        css=common.BASE_CSS + EXPORT_TOC_CSS,
        body=toc + body,
    )


def _build_toc(scope: ExportScope) -> str:
    items = []
    for doc in scope.documents:
        title = common._escape(doc.title)
        items.append(f'<li><a href="#doc-{doc.id}">{title}</a></li>')
    inner = "\n".join(items)
    return (
        '<nav class="export-toc" aria-label="目录">'
        '<div class="export-toc-title">目录</div>'
        f"<ol>{inner}</ol>"
        "</nav>"
    )


EXPORT_TOC_CSS = """
.export-toc { position: fixed; top: 32px; left: 32px; max-width: 220px; max-height: calc(100vh - 64px); overflow: auto;
              padding: 12px 14px; background: #fafbfc; border: 1px solid #e8e8e8; border-radius: 8px;
              font-size: 13px; line-height: 1.6; }
.export-toc-title { font-weight: 600; margin-bottom: 8px; color: #333; font-size: 12px;
                    letter-spacing: 1px; text-transform: uppercase; }
.export-toc ol { padding-left: 1.2em; margin: 0; }
.export-toc a { color: #1677ff; text-decoration: none; }
.export-toc a:hover { text-decoration: underline; }
@media (max-width: 900px) { .export-toc { position: static; max-width: 100%; margin: 0 auto 24px; } }
@media print { .export-toc { display: none; } }
"""


def export(scope: ExportScope) -> tuple[Path, str, str]:
    # Single-doc HTML export of an HTML-format document → preserve the source
    # verbatim. Wrapping it in our shell would double the <html>/<head> tags
    # and lose the author's original styling.
    if len(scope.documents) == 1:
        doc = scope.documents[0]
        if detect_doc_format(doc) == "html" and (doc.raw_content or "").strip():
            path = common.reserve_export_path(".html")
            common.write_text(path, doc.raw_content)
            return (
                path,
                f"{common.safe_slug(doc.title)}.html",
                "text/html; charset=utf-8",
            )
    html = render_html(scope)
    path = common.reserve_export_path(".html")
    common.write_text(path, html)
    return path, f"{common.safe_slug(scope.label)}.html", "text/html; charset=utf-8"
