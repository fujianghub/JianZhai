from __future__ import annotations

from rest_framework import serializers

from apps.knowledge.models import Document

from .models import DocumentLink


class BacklinkSerializer(serializers.ModelSerializer):
    source = serializers.SerializerMethodField()

    class Meta:
        model = DocumentLink
        fields = ["id", "source", "context", "position", "created_at"]

    def get_source(self, obj: DocumentLink) -> dict:
        s: Document = obj.source
        return {
            "id": s.id,
            "title": s.title,
            "slug": s.slug,
            "knowledge_base": s.knowledge_base_id,
            "status": s.status,
            "visibility": s.visibility,
        }
