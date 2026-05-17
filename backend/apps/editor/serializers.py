from __future__ import annotations

from rest_framework import serializers

from .models import Attachment


class AttachmentSerializer(serializers.ModelSerializer):
    url = serializers.CharField(read_only=True)

    class Meta:
        model = Attachment
        fields = [
            "id",
            "document",
            "url",
            "original_filename",
            "kind",
            "mime_type",
            "size",
            "created_at",
        ]
        read_only_fields = ["id", "url", "kind", "mime_type", "size", "created_at"]
