"""Markdown export: single file for one doc, zipped collection otherwise."""
from __future__ import annotations

from pathlib import Path

from apps.knowledge.models import Document

from ..scope import ExportScope
from . import common


def _doc_relative_path(doc: Document, folder_cache: dict[int, list[str]]) -> str:
    """Build a path like ``parent/child/doc-title.md`` from ``doc.folder``.

    Walks the folder chain bottom-up and slugifies each segment, so the
    archive mirrors the user's directory layout. Documents at the KB root
    (no folder) get a flat ``slug.md`` name.
    """
    from apps.knowledge.models import Folder

    parts: list[str] = []
    fid = doc.folder_id
    if fid is not None:
        if fid in folder_cache:
            parts = folder_cache[fid]
        else:
            try:
                f = Folder.objects.get(pk=fid)
            except Folder.DoesNotExist:
                f = None
            chain: list[str] = []
            cur = f
            while cur is not None:
                chain.insert(0, common.safe_slug(cur.name))
                cur = cur.parent
            folder_cache[fid] = chain
            parts = chain
    base = common.safe_slug(doc.title)
    return "/".join([*parts, f"{base}.md"])


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
    folder_cache: dict[int, list[str]] = {}
    for doc in scope.documents:
        rel = _doc_relative_path(doc, folder_cache)
        name = rel
        i = 1
        while name in used_names:
            if name.endswith(".md"):
                stem = name[:-3]
                name = f"{stem}-{i}.md"
            else:
                name = f"{rel}-{i}"
            i += 1
        used_names.add(name)
        text = f"# {doc.title}\n\n{doc.raw_content or ''}\n"
        entries.append((name, text.encode("utf-8")))

    data = common.make_zip(entries)
    path = common.reserve_export_path(".zip")
    common.write_bytes(path, data)
    return path, f"{common.safe_slug(scope.label)}-markdown.zip", "application/zip"
