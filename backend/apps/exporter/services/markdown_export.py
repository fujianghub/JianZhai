"""Markdown export: single file for one doc, zipped collection otherwise."""
from __future__ import annotations

import re
from pathlib import Path

from apps.knowledge.models import Document

from ..scope import ExportScope
from . import common

# ``@[label](doc:NNN)`` mentions need to be rewritten when leaving the live
# system: a freshly downloaded archive shouldn't break links the moment the
# reader double-clicks the .md file. We do best-effort link resolution:
#   - target inside this export → rewrite to the in-archive relative path
#   - target outside this export → degrade to a plain label (no broken link)
# The leading ``@`` is optional — JianZhai's parser uses ``@[…](doc:NN)`` for
# WYSIWYG mentions but bare ``[…](doc:NN)`` from a hand-typed link should
# rewrite the same way. We capture the optional ``@`` so it doesn't get
# stranded when the link collapses to plain text.
_DOC_MENTION_RE = re.compile(r"(?:@)?\[([^\]\n]+)\]\(doc:(\d+)\)")


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


def _build_doc_link_index(
    documents: list[Document], folder_cache: dict[int, list[str]]
) -> dict[int, str]:
    """Map ``doc.id → archive-relative path`` so mentions can be rewritten."""
    return {d.id: _doc_relative_path(d, folder_cache) for d in documents}


def _rewrite_doc_mentions(text: str, link_index: dict[int, str], from_path: str) -> str:
    """Convert ``@[label](doc:NN)`` to a relative ``.md`` link or plain label.

    ``from_path`` is the archive path of the document doing the mentioning;
    relative paths are computed against its directory so a doc in
    ``foo/bar.md`` linking to ``baz/qux.md`` gets ``../baz/qux.md``.
    """
    from posixpath import relpath as _relpath

    # Containing directory of from_path. ``rsplit("/", 1)`` returns the
    # whole filename when there's no slash, so guard with an explicit check:
    # a flat root-level doc lives in ``.``, not in a directory named after
    # itself.
    here = from_path.rsplit("/", 1)[0] if "/" in from_path else "."

    def repl(m: re.Match[str]) -> str:
        label = m.group(1)
        target_id = int(m.group(2))
        target_rel = link_index.get(target_id)
        if not target_rel:
            # Target is outside this archive — degrade to plain text to avoid
            # leaving a broken ``doc:NN`` link the reader can't resolve.
            return label
        href = _relpath(target_rel, here).replace("\\", "/")
        return f"[{label}]({href})"

    return _DOC_MENTION_RE.sub(repl, text)


def export(scope: ExportScope) -> tuple[Path, str, str]:
    """Return (path, filename, mime_type)."""
    if len(scope.documents) == 1:
        doc = scope.documents[0]
        body = common.doc_export_body(doc)
        # Single-doc export: any ``doc:NN`` mention points outside the archive,
        # so degrade it to plain label text.
        body = _rewrite_doc_mentions(body, link_index={}, from_path="content.md")
        text = f"# {doc.title}\n\n{body}\n"
        media = common.collect_markdown_media(text)
        if media:
            data = common.make_zip(
                [("content.md", text.encode("utf-8")), *media]
            )
            path = common.reserve_export_path(".zip")
            common.write_bytes(path, data)
            return (
                path,
                f"{common.safe_slug(doc.title)}-markdown.zip",
                "application/zip",
            )
        path = common.reserve_export_path(".md")
        common.write_text(path, text)
        return path, f"{common.safe_slug(doc.title)}.md", "text/markdown; charset=utf-8"

    entries: list[tuple[str, bytes]] = []
    used_names: set[str] = set()
    folder_cache: dict[int, list[str]] = {}
    asset_entries: list[tuple[str, bytes]] = []
    asset_names: set[str] = set()
    link_index = _build_doc_link_index(scope.documents, folder_cache)
    for doc in scope.documents:
        rel = _doc_relative_path(doc, folder_cache)
        name = rel
        i = 1
        while name in used_names:
            if name.endswith(".md"):
                stem = name[:-3]
                name = f"{stem}-{i}.md"
            else:
                name = f"{rel}-{i}.md"
            i += 1
        used_names.add(name)
        body = common.doc_export_body(doc)
        body = _rewrite_doc_mentions(body, link_index, from_path=name)
        text = f"# {doc.title}\n\n{body}\n"
        text = common.rewrite_markdown_media_paths(text)
        entries.append((name, text.encode("utf-8")))
        for asset_name, asset_data in common.collect_markdown_media(
            common.doc_export_body(doc)
        ):
            if asset_name not in asset_names:
                asset_names.add(asset_name)
                asset_entries.append((asset_name, asset_data))

    data = common.make_zip([*entries, *asset_entries])
    path = common.reserve_export_path(".zip")
    common.write_bytes(path, data)
    return path, f"{common.safe_slug(scope.label)}-markdown.zip", "application/zip"
