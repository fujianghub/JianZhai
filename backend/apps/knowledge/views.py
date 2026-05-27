from __future__ import annotations

from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.scoping import scope_queryset
from apps.editor.models import Attachment

from .concurrency import VersionConflictError
from .models import Document, DocumentFavorite, Folder, KnowledgeBase, KnowledgeBaseCategory
from .serializers import (
    DocumentListSerializer,
    DocumentPublishedContentSerializer,
    DocumentSerializer,
    FavoriteDocumentSerializer,
    FolderSerializer,
    KnowledgeBaseCategorySerializer,
    KnowledgeBaseSerializer,
    ReorderRequestSerializer,
    build_tree,
)


# Pre-ordered prefetch so DocumentSerializer's primary-attachment lookup
# (oldest attachment first) can read from the prefetched cache instead of
# issuing a per-doc ORDER BY query.
_PRIMARY_ATTACHMENT_PREFETCH = Prefetch(
    "attachments",
    queryset=Attachment.objects.order_by("created_at"),
    to_attr="ordered_attachments",
)


class OwnerScopedMixin:
    """Restrict queryset to objects owned by the current user (via KB ownership).

    Superusers bypass the filter — see ``apps.accounts.scoping.scope_queryset``.
    """

    owner_lookup = "owner"

    def get_queryset(self):
        return scope_queryset(super().get_queryset(), self.request.user, field=self.owner_lookup)


class KnowledgeBaseViewSet(OwnerScopedMixin, viewsets.ModelViewSet):
    queryset = KnowledgeBase.objects.all()
    serializer_class = KnowledgeBaseSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "pk"

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action == "list":
            qs = qs.annotate(
                _document_count=Count(
                    "documents",
                    filter=Q(documents__is_deleted=False),
                )
            ).prefetch_related("tags")
        return qs

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def perform_destroy(self, instance: KnowledgeBase):
        instance.soft_delete()

    @action(detail=True, methods=["get"], url_path="tree")
    def tree(self, request, pk=None):
        kb = self.get_object()
        return Response(build_tree(kb, user=request.user))


class KnowledgeBaseCategoryViewSet(OwnerScopedMixin, viewsets.ModelViewSet):
    queryset = KnowledgeBaseCategory.objects.all()
    serializer_class = KnowledgeBaseCategorySerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "pk"

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class FolderViewSet(viewsets.ModelViewSet):
    queryset = Folder.objects.all()
    serializer_class = FolderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return scope_queryset(self.queryset, self.request.user)

    def perform_destroy(self, instance: Folder):
        instance.soft_delete()


class DocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.all()
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = (
            scope_queryset(self.queryset, self.request.user)
            .select_related("knowledge_base", "folder")
            .prefetch_related(_PRIMARY_ATTACHMENT_PREFETCH)
        )
        kb = self.request.query_params.get("knowledge_base")
        folder = self.request.query_params.get("folder")
        if kb:
            qs = qs.filter(knowledge_base_id=kb)
        if folder == "null":
            qs = qs.filter(folder__isnull=True)
        elif folder:
            qs = qs.filter(folder_id=folder)
        return qs

    def get_serializer_class(self):
        if self.action == "list":
            return DocumentListSerializer
        if self.action == "update_published":
            return DocumentPublishedContentSerializer
        return DocumentSerializer

    def perform_create(self, serializer):
        # Authorship: on create both fields point to the same user.
        u = self.request.user
        serializer.save(created_by=u, last_edited_by=u)

    def perform_update(self, serializer):
        serializer.save(last_edited_by=self.request.user)

    def perform_destroy(self, instance: Document):
        instance.soft_delete()

    def _parse_expected_version(self, request) -> int | None | Response:
        """Return expected version int, None if omitted, or a 400 Response."""
        if not isinstance(request.data, dict):
            return None
        expected = request.data.get("expected_version")
        if expected is None:
            return None
        try:
            return int(expected)
        except (TypeError, ValueError):
            return Response(
                {"detail": "expected_version 必须是整数"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def _version_conflict_response(self, instance: Document) -> Response:
        return Response(
            {
                "detail": "文档已被其他端修改",
                "code": "version_conflict",
                "current_version": instance.version,
                "document": DocumentSerializer(instance, context=self.get_serializer_context()).data,
            },
            status=status.HTTP_409_CONFLICT,
        )

    def _expected_version_conflict(self, request, instance: Document) -> Response | None:
        """Return 409/400 response when ``expected_version`` does not match."""
        parsed = self._parse_expected_version(request)
        if isinstance(parsed, Response):
            return parsed
        if parsed is None:
            return None
        if parsed != instance.version:
            return self._version_conflict_response(instance)
        return None

    def _strip_expected_version(self, request) -> None:
        mutable = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        mutable.pop("expected_version", None)
        request._full_data = mutable

    def _serializer_context_with_version(self, request) -> dict:
        ctx = self.get_serializer_context()
        parsed = self._parse_expected_version(request)
        if isinstance(parsed, int):
            ctx = {**ctx, "expected_version": parsed}
        return ctx

    def update(self, request, *args, **kwargs):
        """Optimistic-concurrency check on PATCH/PUT."""
        instance = self.get_object()
        conflict = self._expected_version_conflict(request, instance)
        if conflict is not None:
            return conflict
        if isinstance(request.data, dict) and "expected_version" in request.data:
            self._strip_expected_version(request)
        partial = kwargs.pop("partial", False)
        serializer = self.get_serializer(
            instance,
            data=request.data,
            partial=partial,
            context=self._serializer_context_with_version(request),
        )
        serializer.is_valid(raise_exception=True)
        try:
            self.perform_update(serializer)
        except VersionConflictError as exc:
            return self._version_conflict_response(exc.document)
        return Response(serializer.data)

    def _publish_or_unpublish(self, request, *, publish: bool) -> Response:
        doc = self.get_object()
        conflict = self._expected_version_conflict(request, doc)
        if conflict is not None:
            return conflict
        parsed = self._parse_expected_version(request)
        if isinstance(parsed, Response):
            return parsed
        with transaction.atomic():
            locked = Document.objects.select_for_update().get(pk=doc.pk)
            if parsed is not None and locked.version != parsed:
                return self._version_conflict_response(locked)
            if publish:
                locked.publish()
            else:
                locked.unpublish()
        locked.refresh_from_db()
        return Response(
            DocumentSerializer(locked, context=self.get_serializer_context()).data
        )

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, pk=None):
        return self._publish_or_unpublish(request, publish=True)

    @action(detail=True, methods=["post"], url_path="unpublish")
    def unpublish(self, request, pk=None):
        return self._publish_or_unpublish(request, publish=False)

    @action(detail=True, methods=["patch"], url_path="published")
    def update_published(self, request, pk=None):
        doc = self.get_object()
        conflict = self._expected_version_conflict(request, doc)
        if conflict is not None:
            return conflict
        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        data.pop("expected_version", None)
        serializer = DocumentPublishedContentSerializer(
            doc,
            data=data,
            partial=True,
            context=self._serializer_context_with_version(request),
        )
        serializer.is_valid(raise_exception=True)
        try:
            self.perform_update(serializer)
        except VersionConflictError as exc:
            return self._version_conflict_response(exc.document)
        doc.refresh_from_db()
        return Response(DocumentSerializer(doc, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["get"], url_path="stats")
    def stats(self, request, pk=None):
        """Authorship / activity statistics for the doc panel.

        Returns:
          - word_count: CJK chars + alphanumeric tokens
          - created_at / created_by
          - updated_at / last_edited_by
          - contributors[]: distinct users who created any DocumentVersion,
            unioned with created_by / last_edited_by
        """
        from apps.versioning.models import DocumentVersion, _word_count
        doc = self.get_object()
        body = doc.raw_content or ""
        wc = _word_count(body)

        def _user_dict(u) -> dict | None:
            if not u:
                return None
            return {
                "id": u.id,
                "username": u.username,
                "is_staff": bool(u.is_staff),
            }

        # Distinct contributors: version creators + created_by + last_edited_by
        contributor_ids: set[int] = set()
        if doc.created_by_id:
            contributor_ids.add(doc.created_by_id)
        if doc.last_edited_by_id:
            contributor_ids.add(doc.last_edited_by_id)
        version_user_ids = (
            DocumentVersion.objects
            .filter(document=doc, created_by__isnull=False)
            .values_list("created_by_id", flat=True)
            .distinct()
        )
        for uid in version_user_ids:
            contributor_ids.add(uid)

        # Fetch user objects (single query)
        from django.contrib.auth import get_user_model
        User = get_user_model()
        users_map = {u.id: u for u in User.objects.filter(id__in=contributor_ids)}
        contributors = [_user_dict(users_map[uid]) for uid in contributor_ids if uid in users_map]

        return Response({
            "word_count": wc,
            "created_at": doc.created_at.isoformat() if doc.created_at else None,
            "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
            "published_at": doc.published_at.isoformat() if doc.published_at else None,
            "created_by": _user_dict(doc.created_by),
            "last_edited_by": _user_dict(doc.last_edited_by),
            "contributors": contributors,
            "version_count": DocumentVersion.objects.filter(document=doc).count(),
        })

    @action(detail=True, methods=["get"], url_path="preview")
    def preview(self, request, pk=None):
        """Lightweight document preview used by hover cards and doc-card embeds.

        Returns only the fields needed to render a small card so the editor
        doesn't have to fetch the full raw_content for every hover.
        """
        doc = self.get_object()
        body = doc.published_content or doc.raw_content or ""
        # Strip markdown syntax for a clean snippet — naive but cheap.
        import re as _re
        snippet = _re.sub(r"^#+\s+", "", body, flags=_re.M)
        snippet = _re.sub(r"[*_`>\[\]()!]", "", snippet)
        snippet = _re.sub(r"\s+", " ", snippet).strip()
        excerpt = snippet[:160] + ("…" if len(snippet) > 160 else "")
        return Response(
            {
                "id": doc.id,
                "title": doc.title,
                "slug": doc.slug,
                "excerpt": excerpt,
                "status": doc.status,
                "visibility": doc.visibility,
                "knowledge_base": {
                    "id": doc.knowledge_base_id,
                    "name": doc.knowledge_base.name,
                    "slug": doc.knowledge_base.slug,
                    "accent_color": doc.knowledge_base.accent_color,
                },
                "updated_at": doc.updated_at.isoformat(),
                "published_at": doc.published_at.isoformat() if doc.published_at else None,
            }
        )

    @action(detail=True, methods=["post"], url_path="favorite")
    def favorite(self, request, pk=None):
        """Toggle per-user favorite for this document."""
        doc = self.get_object()
        fav, created = DocumentFavorite.objects.get_or_create(
            user=request.user, document=doc
        )
        if not created:
            fav.delete()
            favorited = False
        else:
            favorited = True
        return Response({"is_favorited": favorited})

    @action(detail=False, methods=["get"], url_path="favorites")
    def favorites(self, request):
        """List documents the current user has favorited (scoped by KB ownership)."""
        favs = (
            DocumentFavorite.objects.filter(user=request.user)
            .select_related("document", "document__knowledge_base")
            .filter(document__is_deleted=False)
            .order_by("-created_at")
        )
        doc_ids = [f.document_id for f in favs]
        if not doc_ids:
            return Response([])
        allowed_ids = set(
            scope_queryset(
                Document.objects.filter(id__in=doc_ids, is_deleted=False),
                request.user,
                field="knowledge_base__owner",
            ).values_list("id", flat=True)
        )
        visible = [f for f in favs if f.document_id in allowed_ids]
        return Response(FavoriteDocumentSerializer(visible, many=True).data)

    @action(detail=False, methods=["get"], url_path="mentions")
    def mentions(self, request):
        """Search documents (across all owned KBs) for the @-mention picker."""
        q = request.query_params.get("q", "").strip()
        qs = self.get_queryset().select_related("knowledge_base")
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(slug__icontains=q))
        qs = qs.order_by("-updated_at")[:15]
        return Response(
            [
                {
                    "id": d.id,
                    "title": d.title,
                    "slug": d.slug,
                    "knowledge_base": {"id": d.knowledge_base_id, "name": d.knowledge_base.name},
                }
                for d in qs
            ]
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def reorder_tree(request):
    """Batch reorder folders/documents within a knowledge base."""
    serializer = ReorderRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    kb = get_object_or_404(
        scope_queryset(KnowledgeBase.objects.all(), request.user, field="owner"),
        pk=data["knowledge_base"],
    )

    parent_ids: set[int] = set()
    for item in data["items"]:
        pid = item.get("parent_folder_id")
        if pid is not None:
            parent_ids.add(pid)

    valid_folder_ids: set[int] = set()
    if parent_ids:
        valid_folder_ids = set(
            Folder.objects.filter(knowledge_base=kb, id__in=parent_ids).values_list(
                "id", flat=True
            )
        )
        invalid = parent_ids - valid_folder_ids
        if invalid:
            return Response(
                {
                    "detail": "parent_folder_id 必须属于同一知识库",
                    "invalid_parent_folder_ids": sorted(invalid),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    folders_to_update: list[Folder] = []
    docs_to_update: list[Document] = []

    with transaction.atomic():
        for item in data["items"]:
            if item["type"] == "folder":
                obj = get_object_or_404(Folder.objects, pk=item["id"], knowledge_base=kb)
                obj.order = item["order"]
                if "parent_folder_id" in item:
                    obj.parent_id = item["parent_folder_id"]
                folders_to_update.append(obj)
            else:
                obj = get_object_or_404(Document.objects, pk=item["id"], knowledge_base=kb)
                obj.order = item["order"]
                if "parent_folder_id" in item:
                    obj.folder_id = item["parent_folder_id"]
                docs_to_update.append(obj)

        if folders_to_update:
            Folder.objects.bulk_update(folders_to_update, ["order", "parent"])
        if docs_to_update:
            Document.objects.bulk_update(docs_to_update, ["order", "folder"])

    return Response({"ok": True}, status=status.HTTP_200_OK)
