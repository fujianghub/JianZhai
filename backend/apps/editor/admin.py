from django.contrib import admin

from .models import Attachment


@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ("id", "original_filename", "kind", "document", "uploaded_by", "size", "created_at")
    list_filter = ("kind",)
    search_fields = ("original_filename",)
