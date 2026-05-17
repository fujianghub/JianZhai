"""Single-page HTML export — every document concatenated, inline CSS, no external assets."""
from __future__ import annotations

from pathlib import Path

from ..scope import ExportScope
from . import common


def render_html(scope: ExportScope) -> str:
    body = common.doc_html_body(scope)
    return common.HTML_SHELL.format(
        title=common._escape(scope.label),
        css=common.BASE_CSS,
        body=body,
    )


def export(scope: ExportScope) -> tuple[Path, str, str]:
    html = render_html(scope)
    path = common.reserve_export_path(".html")
    common.write_text(path, html)
    return path, f"{common.safe_slug(scope.label)}.html", "text/html; charset=utf-8"
