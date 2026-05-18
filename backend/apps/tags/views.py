from __future__ import annotations

from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.knowledge.models import Document, Folder, KnowledgeBase

from .models import Tag
from .serializers import TagSerializer, TargetTagsSerializer


class TagViewSet(viewsets.ModelViewSet):
    serializer_class = TagSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if not self.request.user.is_authenticated:
            return Tag.objects.none()
        return Tag.objects.filter(owner=self.request.user)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def document_tags(request, doc_id: int):
    doc = get_object_or_404(
        Document.objects.filter(knowledge_base__owner=request.user), pk=doc_id
    )
    if request.method == "GET":
        return Response(TagSerializer(doc.tags.all(), many=True).data)
    serializer = TargetTagsSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    tags = serializer.set_on(doc, request.user)
    return Response(TagSerializer(tags, many=True).data)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def kb_tags(request, kb_id: int):
    kb = get_object_or_404(KnowledgeBase.objects.filter(owner=request.user), pk=kb_id)
    if request.method == "GET":
        return Response(TagSerializer(kb.tags.all(), many=True).data)
    serializer = TargetTagsSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    tags = serializer.set_on(kb, request.user)
    return Response(TagSerializer(tags, many=True).data)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def folder_tags(request, folder_id: int):
    folder = get_object_or_404(
        Folder.objects.filter(knowledge_base__owner=request.user), pk=folder_id
    )
    if request.method == "GET":
        return Response(TagSerializer(folder.tags.all(), many=True).data)
    serializer = TargetTagsSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    tags = serializer.set_on(folder, request.user)
    return Response(TagSerializer(tags, many=True).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def public_tag_cloud(request):
    """Tags attached to either a published+public document OR a public KB."""
    qs = (
        Tag.objects.filter(
            Q(
                documents__status="published",
                documents__visibility="public",
                documents__knowledge_base__visibility="public",
                documents__is_deleted=False,
            )
            | Q(
                knowledge_bases__visibility="public",
                knowledge_bases__is_deleted=False,
            )
            | Q(
                folders__knowledge_base__visibility="public",
                folders__is_deleted=False,
            )
        )
        .annotate(
            doc_count=Count("documents", distinct=True),
            kb_count=Count("knowledge_bases", distinct=True),
            folder_count=Count("folders", distinct=True),
        )
        .distinct()
        .order_by("-doc_count", "-kb_count", "-folder_count", "name")
    )
    return Response(
        [
            {
                "id": t.id,
                "name": t.name,
                "slug": t.slug,
                "color": t.color,
                "count": t.doc_count + t.kb_count + t.folder_count,
                "doc_count": t.doc_count,
                "kb_count": t.kb_count,
                "folder_count": t.folder_count,
            }
            for t in qs
        ]
    )
