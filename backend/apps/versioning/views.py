from __future__ import annotations

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.scoping import scope_queryset
from apps.knowledge.models import Document

from .models import DocumentVersion
from .serializers import (
    CreateVersionSerializer,
    DocumentVersionDetailSerializer,
    DocumentVersionListSerializer,
)


def _get_owned_document(user, doc_id: int) -> Document:
    return get_object_or_404(scope_queryset(Document.objects.all(), user), pk=doc_id)


class VersionListCreate(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, doc_id: int):
        doc = _get_owned_document(request.user, doc_id)
        qs = doc.versions.all()
        return Response(DocumentVersionListSerializer(qs, many=True).data)

    def post(self, request, doc_id: int):
        doc = _get_owned_document(request.user, doc_id)
        serializer = CreateVersionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = DocumentVersion.create_snapshot(
            document=doc,
            content=doc.raw_content or "",
            message=serializer.validated_data.get("message", ""),
            created_by=request.user,
        )
        return Response(DocumentVersionDetailSerializer(v).data, status=status.HTTP_201_CREATED)


class VersionDetail(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, doc_id: int, vid: int):
        doc = _get_owned_document(request.user, doc_id)
        v = get_object_or_404(doc.versions, pk=vid)
        return Response(DocumentVersionDetailSerializer(v).data)


class VersionDiff(APIView):
    """Return two snapshots side-by-side. Client (diff-match-patch) renders the visual diff."""

    permission_classes = [IsAuthenticated]

    def get(self, request, doc_id: int):
        doc = _get_owned_document(request.user, doc_id)
        a = request.query_params.get("a")
        b = request.query_params.get("b")
        if not a or not b:
            return Response(
                {"detail": "query params `a` and `b` are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            a_id, b_id = int(a), int(b)
        except (TypeError, ValueError):
            return Response(
                {"detail": "query params `a` and `b` must be integers"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        va = get_object_or_404(doc.versions, pk=a_id)
        vb = get_object_or_404(doc.versions, pk=b_id)
        return Response(
            {
                "a": DocumentVersionDetailSerializer(va).data,
                "b": DocumentVersionDetailSerializer(vb).data,
            }
        )


class VersionRestore(APIView):
    """Snapshot the current state, then overwrite raw_content with the target version."""

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, doc_id: int, vid: int):
        doc = _get_owned_document(request.user, doc_id)
        target = get_object_or_404(doc.versions, pk=vid)
        # Snapshot the *current* state first, so the restore itself becomes undoable.
        DocumentVersion.create_snapshot(
            document=doc,
            content=doc.raw_content or "",
            message=f"回滚前自动快照 (← v#{vid})",
            created_by=request.user,
        )
        doc.raw_content = target.content
        doc.save(update_fields=["raw_content", "updated_at"])
        # Stack-style: the restore also creates a version pointing to the restored content.
        v = DocumentVersion.create_snapshot(
            document=doc,
            content=target.content,
            message=f"回滚到 v#{vid}"
            + (f"（{target.message}）" if target.message else ""),
            created_by=request.user,
        )
        return Response(DocumentVersionDetailSerializer(v).data)
