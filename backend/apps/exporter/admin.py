from django.contrib import admin

from .models import ExportTask


@admin.register(ExportTask)
class ExportTaskAdmin(admin.ModelAdmin):
    list_display = ("id", "owner", "scope", "target_id", "format", "status", "created_at")
    list_filter = ("scope", "format", "status")
    readonly_fields = (
        "scope",
        "target_id",
        "target_label",
        "format",
        "status",
        "file_path",
        "filename",
        "mime_type",
        "file_size",
        "error",
        "created_at",
        "started_at",
        "completed_at",
    )
