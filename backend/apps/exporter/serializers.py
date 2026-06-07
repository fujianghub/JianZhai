from __future__ import annotations

from rest_framework import serializers

from .models import ExportTask


class ExportTaskSerializer(serializers.ModelSerializer):
    # Write-only selection inputs (scope="selection"); ignored for other scopes.
    folder_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, write_only=True
    )
    doc_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, write_only=True
    )

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
            "folder_ids",
            "doc_ids",
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
        extra_kwargs = {
            # selection scope carries targets in folder_ids/doc_ids instead.
            "target_id": {"required": False, "default": 0},
        }

    def validate_scope(self, value):
        if value not in {"doc", "folder", "kb", "selection"}:
            raise serializers.ValidationError(
                "scope must be one of doc/folder/kb/selection"
            )
        return value

    def validate_format(self, value):
        if value not in {"md", "html", "pdf", "docx", "site"}:
            raise serializers.ValidationError("format must be one of md/html/pdf/docx/site")
        return value

    def validate(self, attrs):
        if attrs.get("scope") == "selection":
            if not attrs.get("folder_ids") and not attrs.get("doc_ids"):
                raise serializers.ValidationError(
                    "selection scope requires folder_ids and/or doc_ids"
                )
        elif not attrs.get("target_id"):
            raise serializers.ValidationError("target_id is required for this scope")
        return attrs
