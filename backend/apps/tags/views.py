from __future__ import annotations

from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.accounts.scoping import scope_queryset
from apps.blog.serializers import PublicPostListSerializer
from apps.knowledge.models import Document, Folder, KnowledgeBase

from .models import Tag
from .serializers import TagSerializer, TargetTagsSerializer


_PUBLIC_DOC_FILTER = Q(
    status="published",
    visibility="public",
    knowledge_base__visibility="public",
    knowledge_base__is_deleted=False,
    is_deleted=False,
)

# Tag queryset / annotated counts: fields via the documents M2M relation.
_PUBLIC_TAG_DOC_Q = Q(
    documents__status="published",
    documents__visibility="public",
    documents__knowledge_base__visibility="public",
    documents__knowledge_base__is_deleted=False,
    documents__is_deleted=False,
)


def _published_posts_qs():
    return Document.objects.filter(_PUBLIC_DOC_FILTER).select_related("knowledge_base")


class TagViewSet(viewsets.ModelViewSet):
    serializer_class = TagSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return scope_queryset(Tag.objects.all(), self.request.user, field="owner")


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def document_tags(request, doc_id: int):
    doc = get_object_or_404(
        scope_queryset(Document.objects.all(), request.user), pk=doc_id
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
    kb = get_object_or_404(
        scope_queryset(KnowledgeBase.objects.all(), request.user, field="owner"), pk=kb_id
    )
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
        scope_queryset(Folder.objects.all(), request.user), pk=folder_id
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
    """Tags with at least one published, public document on a public knowledge base."""
    qs = (
        Tag.objects.filter(_PUBLIC_TAG_DOC_Q)
        .annotate(
            doc_count=Count(
                "documents",
                filter=_PUBLIC_TAG_DOC_Q,
                distinct=True,
            ),
            kb_count=Count("knowledge_bases", distinct=True),
            folder_count=Count("folders", distinct=True),
        )
        .filter(doc_count__gt=0)
        .distinct()
        .order_by("-doc_count", "name")
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


@api_view(["GET"])
@permission_classes([AllowAny])
def public_tag_entries(request, tag_id: int):
    """Published public posts tagged with this tag (by tag primary key)."""
    tag = get_object_or_404(Tag, pk=tag_id)
    posts = _published_posts_qs().filter(tags__id=tag.id).distinct().order_by(
        "-published_at", "-id"
    )
    return Response(
        {
            "tag": {
                "id": tag.id,
                "name": tag.name,
                "slug": tag.slug,
                "color": tag.color,
            },
            "posts": PublicPostListSerializer(posts, many=True).data,
        }
    )
