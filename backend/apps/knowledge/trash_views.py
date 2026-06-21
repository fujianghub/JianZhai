from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.permissions import IsContentAuthor, IsRoot
from apps.accounts.scoping import scope_queryset

from .models import Document, Folder, KnowledgeBase


def _doc_trash_qs(user):
    return scope_queryset(
        Document.all_objects.filter(is_deleted=True).select_related(
            "knowledge_base", "folder"
        ),
        user,
        field="knowledge_base__owner",
    ).order_by("-deleted_at", "-id")


def _kb_trash_qs(user):
    return scope_queryset(
        KnowledgeBase.all_objects.filter(is_deleted=True),
        user,
        field="owner",
    ).order_by("-deleted_at", "-id")


def _paginate_params(request, prefix: str) -> tuple[int, int]:
    page_key = f"{prefix}_page"
    size_key = f"{prefix}_page_size"
    try:
        page = max(1, int(request.query_params.get(page_key, 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = max(1, min(200, int(request.query_params.get(size_key, 50))))
    except (TypeError, ValueError):
        page_size = 50
    return page, page_size


def _page_slice(qs, page: int, page_size: int):
    total = qs.count()
    start = (page - 1) * page_size
    end = start + page_size
    return total, list(qs[start:end])


def _serialize_kb(kb: KnowledgeBase) -> dict:
    return {
        "type": "knowledge_base",
        "id": kb.id,
        "name": kb.name,
        "slug": kb.slug,
        "deleted_at": kb.deleted_at.isoformat() if kb.deleted_at else None,
    }


def _serialize_doc(d: Document) -> dict:
    return {
        "type": "document",
        "id": d.id,
        "title": d.title,
        "slug": d.slug,
        "status": d.status,
        "visibility": d.visibility,
        "knowledge_base": {
            "id": d.knowledge_base_id,
            "name": d.knowledge_base.name,
            "slug": d.knowledge_base.slug,
            "is_deleted": d.knowledge_base.is_deleted,
        },
        "deleted_at": d.deleted_at.isoformat() if d.deleted_at else None,
    }


def _restore_document_or_error(doc: Document) -> str | None:
    kb = KnowledgeBase.all_objects.get(pk=doc.knowledge_base_id)
    if kb.is_deleted:
        return "请先恢复所属知识库"
    if doc.folder_id:
        folder = Folder.all_objects.filter(pk=doc.folder_id).first()
        if folder and folder.is_deleted:
            return "请先恢复所属文件夹"
    doc.is_deleted = False
    doc.deleted_at = None
    doc.save(update_fields=["is_deleted", "deleted_at"])
    return None


def _batch_result(succeeded: list[int], failed: list[dict]) -> dict:
    return {"succeeded": succeeded, "failed": failed}


def _parse_ids(request) -> list[int]:
    ids = request.data.get("ids")
    if not isinstance(ids, list):
        return []
    out: list[int] = []
    for raw in ids:
        try:
            out.append(int(raw))
        except (TypeError, ValueError):
            continue
    return out


@api_view(["GET"])
@permission_classes([IsContentAuthor])
def trash_list(request):
    """List soft-deleted KBs and documents with independent pagination."""
    kb_page, kb_page_size = _paginate_params(request, "kb")
    doc_page, doc_page_size = _paginate_params(request, "doc")

    kb_qs = _kb_trash_qs(request.user)
    doc_qs = _doc_trash_qs(request.user)

    kb_count, kb_page_items = _page_slice(kb_qs, kb_page, kb_page_size)
    doc_count, doc_page_items = _page_slice(doc_qs, doc_page, doc_page_size)

    return Response(
        {
            "knowledge_bases": {
                "count": kb_count,
                "page": kb_page,
                "page_size": kb_page_size,
                "results": [_serialize_kb(kb) for kb in kb_page_items],
            },
            "documents": {
                "count": doc_count,
                "page": doc_page,
                "page_size": doc_page_size,
                "results": [_serialize_doc(d) for d in doc_page_items],
            },
        }
    )


@api_view(["POST"])
@permission_classes([IsContentAuthor])
def restore_knowledge_base(request, pk: int):
    kb = get_object_or_404(_kb_trash_qs(request.user), pk=pk)
    kb.is_deleted = False
    kb.deleted_at = None
    kb.save(update_fields=["is_deleted", "deleted_at"])
    return Response({"id": kb.id, "restored": True})


@api_view(["DELETE"])
@permission_classes([IsRoot])
def purge_knowledge_base(request, pk: int):
    kb = get_object_or_404(_kb_trash_qs(request.user), pk=pk)
    kb.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsContentAuthor])
def restore_document(request, pk: int):
    doc = get_object_or_404(_doc_trash_qs(request.user), pk=pk)
    err = _restore_document_or_error(doc)
    if err:
        return Response({"detail": err}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"id": doc.id, "restored": True})


@api_view(["DELETE"])
@permission_classes([IsRoot])
def purge_document(request, pk: int):
    doc = get_object_or_404(_doc_trash_qs(request.user), pk=pk)
    doc.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsContentAuthor])
def batch_restore_knowledge_bases(request):
    ids = _parse_ids(request)
    qs = _kb_trash_qs(request.user).filter(pk__in=ids)
    by_id = {kb.id: kb for kb in qs}
    succeeded: list[int] = []
    failed: list[dict] = []
    for pk in ids:
        kb = by_id.get(pk)
        if not kb:
            failed.append({"id": pk, "detail": "未找到或无权访问"})
            continue
        kb.is_deleted = False
        kb.deleted_at = None
        kb.save(update_fields=["is_deleted", "deleted_at"])
        succeeded.append(pk)
    return Response(_batch_result(succeeded, failed))


@api_view(["POST"])
@permission_classes([IsRoot])
def batch_purge_knowledge_bases(request):
    ids = _parse_ids(request)
    qs = _kb_trash_qs(request.user).filter(pk__in=ids)
    by_id = {kb.id: kb for kb in qs}
    succeeded: list[int] = []
    failed: list[dict] = []
    for pk in ids:
        kb = by_id.get(pk)
        if not kb:
            failed.append({"id": pk, "detail": "未找到或无权访问"})
            continue
        kb.delete()
        succeeded.append(pk)
    return Response(_batch_result(succeeded, failed))


@api_view(["POST"])
@permission_classes([IsContentAuthor])
def batch_restore_documents(request):
    ids = _parse_ids(request)
    qs = _doc_trash_qs(request.user).filter(pk__in=ids)
    by_id = {d.id: d for d in qs}
    succeeded: list[int] = []
    failed: list[dict] = []
    for pk in ids:
        doc = by_id.get(pk)
        if not doc:
            failed.append({"id": pk, "detail": "未找到或无权访问"})
            continue
        err = _restore_document_or_error(doc)
        if err:
            failed.append({"id": pk, "detail": err})
        else:
            succeeded.append(pk)
    return Response(_batch_result(succeeded, failed))


@api_view(["POST"])
@permission_classes([IsRoot])
def batch_purge_documents(request):
    ids = _parse_ids(request)
    qs = _doc_trash_qs(request.user).filter(pk__in=ids)
    by_id = {d.id: d for d in qs}
    succeeded: list[int] = []
    failed: list[dict] = []
    for pk in ids:
        doc = by_id.get(pk)
        if not doc:
            failed.append({"id": pk, "detail": "未找到或无权访问"})
            continue
        doc.delete()
        succeeded.append(pk)
    return Response(_batch_result(succeeded, failed))


@api_view(["POST"])
@permission_classes([IsRoot])
def empty_trash(request):
    scope = request.data.get("scope", "all")
    if scope not in ("documents", "knowledge_bases", "all"):
        return Response(
            {"detail": "scope 须为 documents、knowledge_bases 或 all"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    purged_docs = 0
    purged_kbs = 0

    if scope in ("documents", "all"):
        for doc in _doc_trash_qs(request.user).iterator():
            doc.delete()
            purged_docs += 1

    if scope in ("knowledge_bases", "all"):
        for kb in _kb_trash_qs(request.user).iterator():
            kb.delete()
            purged_kbs += 1

    return Response(
        {
            "scope": scope,
            "purged_documents": purged_docs,
            "purged_knowledge_bases": purged_kbs,
        }
    )
