from __future__ import annotations

from rest_framework import serializers

from .models import Comment


class CommentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Comment
        fields = [
            "id",
            "document",
            "author",
            "block_id",
            "content",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "document", "author", "created_at", "updated_at"]


class CreateCommentSerializer(serializers.Serializer):
    block_id = serializers.CharField(max_length=64, allow_blank=True, required=False, default="")
    content = serializers.CharField()
