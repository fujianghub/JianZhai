from __future__ import annotations

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from django.db.models import Q

from .models import Document, Folder, KnowledgeBase
from .serializers import (
    DocumentListSerializer,
    DocumentPublishedContentSerializer,
    DocumentSerializer,
    FolderSerializer,
    KnowledgeBaseSerializer,
    ReorderRequestSerializer,
    build_tree,
)


class OwnerScopedMixin:
    """Restrict queryset to objects owned by the current user (via KB ownership)."""

    owner_lookup = "owner"

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not user.is_authenticated:
            return qs.none()
        return qs.filter(**{self.owner_lookup: user})


class KnowledgeBaseViewSet(OwnerScopedMixin, viewsets.ModelViewSet):
    queryset = KnowledgeBase.objects.all()
    serializer_class = KnowledgeBaseSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "pk"

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def perform_destroy(self, instance: KnowledgeBase):
        instance.soft_delete()

    @action(detail=True, methods=["get"], url_path="tree")
    def tree(self, request, pk=None):
        kb = self.get_object()
        return Response(build_tree(kb))


class FolderViewSet(viewsets.ModelViewSet):
    queryset = Folder.objects.all()
    serializer_class = FolderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return self.queryset.none()
        return self.queryset.filter(knowledge_base__owner=user)

    def perform_destroy(self, instance: Folder):
        instance.soft_delete()


class DocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.all()
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return self.queryset.none()
        qs = self.queryset.filter(knowledge_base__owner=user)
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

    def perform_destroy(self, instance: Document):
        instance.soft_delete()

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, pk=None):
        doc = self.get_object()
        doc.publish()
        return Response(DocumentSerializer(doc).data)

    @action(detail=True, methods=["post"], url_path="unpublish")
    def unpublish(self, request, pk=None):
        doc = self.get_object()
        doc.unpublish()
        return Response(DocumentSerializer(doc).data)

    @action(detail=True, methods=["patch"], url_path="published")
    def update_published(self, request, pk=None):
        doc = self.get_object()
        serializer = DocumentPublishedContentSerializer(doc, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(DocumentSerializer(doc).data)

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

    kb = get_object_or_404(KnowledgeBase.objects, pk=data["knowledge_base"], owner=request.user)

    with transaction.atomic():
        for item in data["items"]:
            if item["type"] == "folder":
                obj = get_object_or_404(Folder.objects, pk=item["id"], knowledge_base=kb)
                obj.order = item["order"]
                if "parent_folder_id" in item:
                    obj.parent_id = item["parent_folder_id"]
                obj.save(update_fields=["order", "parent"])
            else:
                obj = get_object_or_404(Document.objects, pk=item["id"], knowledge_base=kb)
                obj.order = item["order"]
                if "parent_folder_id" in item:
                    obj.folder_id = item["parent_folder_id"]
                obj.save(update_fields=["order", "folder"])

    return Response({"ok": True}, status=status.HTTP_200_OK)
