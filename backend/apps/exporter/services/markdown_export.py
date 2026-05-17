"""Markdown export: single file for one doc, zipped collection otherwise."""
from __future__ import annotations

from pathlib import Path

from ..scope import ExportScope
from . import common


def export(scope: ExportScope) -> tuple[Path, str, str]:
    """Return (path, filename, mime_type)."""
    if len(scope.documents) == 1:
        doc = scope.documents[0]
        text = f"# {doc.title}\n\n{doc.raw_content or ''}\n"
        path = common.reserve_export_path(".md")
        common.write_text(path, text)
        return path, f"{common.safe_slug(doc.title)}.md", "text/markdown; charset=utf-8"

    entries: list[tuple[str, bytes]] = []
    used_names: set[str] = set()
    for doc in scope.documents:
        base = common.safe_slug(doc.title)
        name = f"{base}.md"
        i = 1
        while name in used_names:
            name = f"{base}-{i}.md"
            i += 1
        used_names.add(name)
        text = f"# {doc.title}\n\n{doc.raw_content or ''}\n"
        entries.append((name, text.encode("utf-8")))

    data = common.make_zip(entries)
    path = common.reserve_export_path(".zip")
    common.write_bytes(path, data)
    return path, f"{common.safe_slug(scope.label)}-markdown.zip", "application/zip"
