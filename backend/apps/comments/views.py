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


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def document_comments(request, doc_id: int):
    doc = get_object_or_404(
        scope_queryset(Document.objects.all(), request.user), pk=doc_id
    )
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
    comment = get_object_or_404(
        scope_queryset(
            Comment.objects.all(),
            request.user,
            field="document__knowledge_base__owner",
        ),
        pk=pk,
    )
    comment.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
