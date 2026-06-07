"""Collect the set of Documents covered by an export task's scope."""
from __future__ import annotations

from dataclasses import dataclass

from apps.accounts.scoping import scope_queryset
from apps.knowledge.models import Document, Folder, KnowledgeBase


@dataclass
class ExportScope:
    kb: KnowledgeBase
    documents: list[Document]
    label: str  # human-readable name (folder/doc title or kb name)


def collect_for_scope(
    *,
    owner,
    scope: str,
    target_id: int,
    only_published: bool = False,
    folder_ids: list[int] | None = None,
    doc_ids: list[int] | None = None,
) -> ExportScope:
    if scope == "selection":
        return collect_for_selection(
            owner=owner,
            folder_ids=folder_ids or [],
            doc_ids=doc_ids or [],
            only_published=only_published,
        )

    if scope == "doc":
        doc = scope_queryset(
            Document.objects.select_related("knowledge_base"), owner
        ).get(pk=target_id)
        return ExportScope(kb=doc.knowledge_base, documents=[doc], label=doc.title)

    if scope == "folder":
        folder = scope_queryset(
            Folder.objects.select_related("knowledge_base"), owner
        ).get(pk=target_id)
        descendant_ids = _descendant_folder_ids(folder)
        qs = Document.objects.filter(
            knowledge_base=folder.knowledge_base, folder_id__in=descendant_ids
        )
        if only_published:
            qs = qs.filter(status="published")
        docs = list(qs.order_by("order", "id"))
        return ExportScope(kb=folder.knowledge_base, documents=docs, label=folder.name)

    if scope == "kb":
        kb = scope_queryset(KnowledgeBase.objects.all(), owner, field="owner").get(
            pk=target_id
        )
        qs = Document.objects.filter(knowledge_base=kb)
        if only_published:
            qs = qs.filter(status="published")
        docs = list(qs.order_by("order", "id"))
        return ExportScope(kb=kb, documents=docs, label=kb.name)

    raise ValueError(f"unknown scope: {scope}")


def collect_for_selection(
    *,
    owner,
    folder_ids: list[int],
    doc_ids: list[int],
    only_published: bool = False,
) -> ExportScope:
    """Resolve an arbitrary mix of folders + individual documents into one scope.

    Folders expand to all documents under their (recursive) subtree; the result is
    unioned with the individually picked documents and de-duplicated. Everything must
    live in a single knowledge base (the batch-management UI is per-KB).
    """
    # Resolve picked folders to the documents under their subtrees.
    descendant_ids: set[int] = set()
    kb_ids: set[int] = set()
    if folder_ids:
        folders = list(
            scope_queryset(
                Folder.objects.select_related("knowledge_base"), owner
            ).filter(pk__in=folder_ids)
        )
        for folder in folders:
            descendant_ids.update(_descendant_folder_ids(folder))
            kb_ids.add(folder.knowledge_base_id)

    folder_doc_qs = (
        Document.objects.filter(folder_id__in=descendant_ids)
        if descendant_ids
        else Document.objects.none()
    )
    doc_qs = (
        scope_queryset(Document.objects.all(), owner).filter(pk__in=doc_ids)
        if doc_ids
        else Document.objects.none()
    )

    # Build the (KB, optionally published-filtered) document union, de-duplicated.
    docs_by_id: dict[int, Document] = {}
    for qs in (folder_doc_qs, doc_qs):
        filtered = qs
        if only_published:
            filtered = filtered.filter(status="published")
        for doc in scope_queryset(
            filtered.select_related("knowledge_base"), owner
        ):
            docs_by_id[doc.id] = doc
            kb_ids.add(doc.knowledge_base_id)

    if not kb_ids:
        raise ValueError("no documents in selection")
    if len(kb_ids) > 1:
        raise ValueError("selection spans multiple knowledge bases")

    documents = sorted(docs_by_id.values(), key=lambda d: (d.order, d.id))
    # Anchor KB even when the published filter empties the set (site stub case).
    kb = (
        documents[0].knowledge_base
        if documents
        else KnowledgeBase.objects.get(pk=next(iter(kb_ids)))
    )
    label = f"{kb.name} · 选定 {len(documents)} 篇"
    return ExportScope(kb=kb, documents=documents, label=label)


def _descendant_folder_ids(folder: Folder) -> list[int]:
    out = [folder.id]
    stack = [folder.id]
    while stack:
        current = stack.pop()
        children = list(
            Folder.objects.filter(parent_id=current).values_list("id", flat=True)
        )
        out.extend(children)
        stack.extend(children)
    return out
