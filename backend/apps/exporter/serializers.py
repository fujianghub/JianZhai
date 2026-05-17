from __future__ import annotations

from rest_framework import serializers

from .models import ExportTask


class ExportTaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExportTask
        fields = [
            "id",
            "scope",
            "target_id",
            "target_label",
            "format",
            "status",
            "filename",
            "file_size",
            "mime_type",
            "error",
            "created_at",
            "started_at",
            "completed_at",
        ]
        read_only_fields = [
            "id",
            "target_label",
            "status",
            "filename",
            "file_size",
            "mime_type",
            "error",
            "created_at",
            "started_at",
            "completed_at",
        ]

    def validate_scope(self, value):
        if value not in {"doc", "folder", "kb"}:
            raise serializers.ValidationError("scope must be one of doc/folder/kb")
        return value

    def validate_format(self, value):
        if value not in {"md", "html", "pdf", "docx", "site"}:
            raise serializers.ValidationError("format must be one of md/html/pdf/docx/site")
        return value
