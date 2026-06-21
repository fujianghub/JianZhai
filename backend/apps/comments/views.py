from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.scoping import scope_queryset
from apps.knowledge.models import Document

from .models import Comment
from .serializers import CommentSerializer, CreateCommentSerializer


def _commentable_doc(user, doc_id: int) -> Document:
    """Document the user may read/comment on.

    Authors see the whole shared content pool; normal users (readers) only
    public, published docs in public KBs — the same set the blog exposes.
    Commenting is a reader capability, so this must NOT route normal users
    through the author-only ``scope_queryset`` (which would 404 them).
    """
    if user.is_staff:
        qs = scope_queryset(Document.objects.all(), user)
    else:
        qs = Document.objects.filter(
            visibility="public",
            status="published",
            knowledge_base__visibility="public",
            is_deleted=False,
        )
    return get_object_or_404(qs, pk=doc_id)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def document_comments(request, doc_id: int):
    doc = _commentable_doc(request.user, doc_id)
    if request.method == "GET":
        block_id = request.query_params.get("block_id")
        qs = doc.comments.all()
        if block_id is not None:
            qs = qs.filter(block_id=block_id)
        return Response(CommentSerializer(qs, many=True).data)

    serializer = CreateCommentSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    comment = Comment.objects.create(
        document=doc,
        author=request.user,
        block_id=serializer.validated_data.get("block_id", ""),
        content=serializer.validated_data["content"],
    )
    return Response(CommentSerializer(comment).data, status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_comment(request, pk: int):
    comment = get_object_or_404(Comment.objects.all(), pk=pk)
    # Authors (is_staff) moderate any comment; a normal user may delete only
    # their own.
    if not (request.user.is_staff or comment.author_id == request.user.id):
        return Response(status=status.HTTP_403_FORBIDDEN)
    comment.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
