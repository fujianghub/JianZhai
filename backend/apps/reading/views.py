"""Reader-side endpoints: EPUB highlights (+notes) and bookmarks.

Access model:

* Any logged-in user may annotate a document they can *read* — the same set
  the blog exposes (public + published + public KB, filtered through the
  audience / ReadGrant gate ``visible_documents``); authors resolve through
  the shared content pool. This mirrors ``comments`` / ``favorite`` and must
  NOT route readers through the author-only ``scope_queryset``.
* Rows are private: every list / update / delete is filtered by
  ``user=request.user`` — an author does not see a reader's highlights and a
  foreign row 404s (never 403, so ids don't leak).
"""
from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.scoping import scope_queryset
from apps.knowledge.audience import visible_documents
from apps.knowledge.models import Document

from .models import Bookmark, Highlight, ReadingPosition
from .serializers import BookmarkSerializer, HighlightSerializer, ReadingPositionSerializer


def _readable_doc(user, doc_id: int) -> Document:
    if user.is_staff:
        qs = scope_queryset(Document.objects.all(), user)
    else:
        qs = visible_documents(
            Document.objects.filter(
                visibility="public",
                status="published",
                knowledge_base__visibility="public",
                is_deleted=False,
            ),
            user,
        )
    return get_object_or_404(qs, pk=doc_id)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def document_highlights(request, doc_id: int):
    doc = _readable_doc(request.user, doc_id)
    if request.method == "GET":
        qs = Highlight.objects.filter(document=doc, user=request.user)
        return Response(HighlightSerializer(qs, many=True).data)
    serializer = HighlightSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    hl = serializer.save(document=doc, user=request.user)
    return Response(HighlightSerializer(hl).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def highlight_detail(request, pk: int):
    hl = get_object_or_404(Highlight.objects.filter(user=request.user), pk=pk)
    if request.method == "DELETE":
        hl.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    serializer = HighlightSerializer(hl, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def document_bookmarks(request, doc_id: int):
    doc = _readable_doc(request.user, doc_id)
    if request.method == "GET":
        qs = Bookmark.objects.filter(document=doc, user=request.user)
        return Response(BookmarkSerializer(qs, many=True).data)
    serializer = BookmarkSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    # Same page bookmarked twice → the existing row (idempotent toggle-on).
    # Keyed on cfi (EPUB) or page (PDF / PPT), whichever the client sent.
    key = {"page": data["page"], "cfi": ""} if data.get("page") is not None else {"cfi": data["cfi"], "page": None}
    bm, created = Bookmark.objects.get_or_create(
        user=request.user,
        document=doc,
        **key,
        defaults={"chapter": data.get("chapter", ""), "excerpt": data.get("excerpt", "")},
    )
    return Response(
        BookmarkSerializer(bm).data,
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def bookmark_detail(request, pk: int):
    bm = get_object_or_404(Bookmark.objects.filter(user=request.user), pk=pk)
    bm.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def document_position(request, doc_id: int):
    """Per-user reading position (cross-device resume). PUT upserts; the
    client merges with its local memory by ``updated_at``."""
    doc = _readable_doc(request.user, doc_id)
    if request.method == "GET":
        row = ReadingPosition.objects.filter(document=doc, user=request.user).first()
        return Response(ReadingPositionSerializer(row).data if row else None)
    serializer = ReadingPositionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    row, _ = ReadingPosition.objects.update_or_create(user=request.user, document=doc, defaults=data)
    return Response(ReadingPositionSerializer(row).data)

