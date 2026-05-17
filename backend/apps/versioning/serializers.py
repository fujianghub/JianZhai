from __future__ import annotations

from rest_framework import serializers

from .models import DocumentVersion


class DocumentVersionListSerializer(serializers.ModelSerializer):
    """List view: omits the full snapshot content to keep payloads small."""

    class Meta:
        model = DocumentVersion
        fields = [
            "id",
            "document",
            "message",
            "word_count",
            "created_by",
            "created_at",
        ]


class DocumentVersionDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentVersion
        fields = [
            "id",
            "document",
            "content",
            "message",
            "word_count",
            "created_by",
            "created_at",
        ]


class CreateVersionSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=300, allow_blank=True, required=False, default="")
