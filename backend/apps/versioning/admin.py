from django.contrib import admin

from .models import DocumentVersion


@admin.register(DocumentVersion)
class DocumentVersionAdmin(admin.ModelAdmin):
    list_display = ("id", "document", "message", "word_count", "created_at")
    search_fields = ("document__title", "message")
    list_filter = ("document__knowledge_base",)
    readonly_fields = ("content", "word_count", "created_at", "created_by")
