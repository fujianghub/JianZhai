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
    *, owner, scope: str, target_id: int, only_published: bool = False
) -> ExportScope:
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
