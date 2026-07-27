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
    kb: KnowledgeBase,
    documents: list[Document],
    *,
    user=None,
    doc_href=None,
    doc_sublist=None,
) -> str:
    """Nested ``<li>`` items for the anthology sidebar (folders + doc links).

    ``doc_href`` maps a tree doc-dict to its link target; defaults to the
    in-page ``#doc-N`` anchors used by the single-file anthology. The static
    site passes per-page filenames instead.

    ``doc_sublist(doc_data, depth) -> str``: optional extra ``<li>`` HTML
    appended right after a document item — the print front-matter TOC uses it
    to nest each doc's own heading entries under the doc line.
    """
    if not documents:
        return ""
    if doc_href is None:
        doc_href = lambda doc_data: f"#doc-{doc_data['id']}"  # noqa: E731
    doc_ids = {d.id for d in documents}
    tree = build_tree(kb, user=user)
    items: list[str] = []

    def folder_has_selected(folder_node: dict) -> bool:
        """True if this folder or any descendant holds a selected document.

        Without this guard a partial selection (e.g. one loose doc) would still
        list every empty folder name in the sidebar TOC even though no document
        under it was exported.
        """
        if any(d["id"] in doc_ids for d in folder_node.get("documents", [])):
            return True
        return any(
            folder_has_selected(child) for child in folder_node.get("children", [])
        )

    def walk_folder(folder_node: dict, depth: int) -> None:
        if not folder_has_selected(folder_node):
            return
        name = html.escape(folder_node.get("name") or "")
        items.append(
            f'<li class="export-toc-folder" style="--toc-depth:{depth}">{name}</li>'
        )
        for doc_data in folder_node.get("documents", []):
            if doc_data["id"] in doc_ids:
                items.append(_toc_doc_item(doc_data, depth + 1, doc_href))
                if doc_sublist is not None:
                    extra = doc_sublist(doc_data, depth + 1)
                    if extra:
                        items.append(extra)
        for child in folder_node.get("children", []):
            walk_folder(child, depth + 1)

    for doc_data in tree.get("documents", []):
        if doc_data["id"] in doc_ids:
            items.append(_toc_doc_item(doc_data, 0, doc_href))
            if doc_sublist is not None:
                extra = doc_sublist(doc_data, 0)
                if extra:
                    items.append(extra)

    for folder_node in tree.get("folders", []):
        walk_folder(folder_node, 0)

    return "\n".join(items)


def _toc_doc_item(doc_data: dict, depth: int, doc_href) -> str:
    title = html.escape(doc_data.get("title") or "")
    href = html.escape(doc_href(doc_data), quote=True)
    return (
        f'<li class="export-toc-doc" style="--toc-depth:{depth}">'
        f'<a href="{href}">{title}</a></li>'
    )
