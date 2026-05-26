"""KB tree order and nested TOC for HTML anthology export."""
from __future__ import annotations

import html

from apps.knowledge.models import Document, KnowledgeBase
from apps.knowledge.serializers import build_tree


def iter_tree_documents(
    kb: KnowledgeBase, documents: list[Document], *, user=None
) -> list[Document]:
    """Return *documents* in the same depth-first order as the KB tree UI."""
    if not documents:
        return []
    doc_ids = {d.id for d in documents}
    doc_by_id = {d.id: d for d in documents}
    tree = build_tree(kb, user=user)
    ordered: list[Document] = []

    def walk_folder(folder_node: dict) -> None:
        for doc_data in folder_node.get("documents", []):
            did = doc_data["id"]
            if did in doc_ids:
                ordered.append(doc_by_id[did])
        for child in folder_node.get("children", []):
            walk_folder(child)

    for doc_data in tree.get("documents", []):
        if doc_data["id"] in doc_ids:
            ordered.append(doc_by_id[doc_data["id"]])
    for folder_node in tree.get("folders", []):
        walk_folder(folder_node)

    seen = {d.id for d in ordered}
    for doc in documents:
        if doc.id not in seen:
            ordered.append(doc)
    return ordered


def render_toc_list_html(
    kb: KnowledgeBase, documents: list[Document], *, user=None
) -> str:
    """Nested ``<li>`` items for the anthology sidebar (folders + doc links)."""
    if not documents:
        return ""
    doc_ids = {d.id for d in documents}
    tree = build_tree(kb, user=user)
    items: list[str] = []

    def walk_folder(folder_node: dict, depth: int) -> None:
        name = html.escape(folder_node.get("name") or "")
        items.append(
            f'<li class="export-toc-folder" style="--toc-depth:{depth}">{name}</li>'
        )
        for doc_data in folder_node.get("documents", []):
            if doc_data["id"] in doc_ids:
                items.append(_toc_doc_item(doc_data, depth + 1))
        for child in folder_node.get("children", []):
            walk_folder(child, depth + 1)

    for doc_data in tree.get("documents", []):
        if doc_data["id"] in doc_ids:
            items.append(_toc_doc_item(doc_data, 0))

    for folder_node in tree.get("folders", []):
        walk_folder(folder_node, 0)

    return "\n".join(items)


def _toc_doc_item(doc_data: dict, depth: int) -> str:
    title = html.escape(doc_data.get("title") or "")
    did = doc_data["id"]
    return (
        f'<li class="export-toc-doc" style="--toc-depth:{depth}">'
        f'<a href="#doc-{did}">{title}</a></li>'
    )
