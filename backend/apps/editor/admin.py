from django.contrib import admin

from .models import Attachment, ConversionJob, DerivedFile, DocumentExtract, SlideImage


@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ("id", "original_filename", "kind", "document", "uploaded_by", "size", "created_at")
    list_filter = ("kind",)
    search_fields = ("original_filename",)


@admin.register(SlideImage)
class SlideImageAdmin(admin.ModelAdmin):
    list_display = ("id", "document", "index", "width", "height", "created_at")
    search_fields = ("document__title",)
    raw_id_fields = ("document", "source")


@admin.register(DerivedFile)
class DerivedFileAdmin(admin.ModelAdmin):
    list_display = ("id", "document", "kind", "page_count", "size", "created_at")
    list_filter = ("kind",)
    search_fields = ("document__title",)
    raw_id_fields = ("document", "source")


@admin.register(ConversionJob)
class ConversionJobAdmin(admin.ModelAdmin):
    list_display = ("id", "kind", "document", "status", "attempt", "pages", "duration_ms", "error", "created_at")
    list_filter = ("kind", "status")
    search_fields = ("document__title", "error", "task_id")
    raw_id_fields = ("document",)
    readonly_fields = ("created_at", "finished_at")


@admin.register(DocumentExtract)
class DocumentExtractAdmin(admin.ModelAdmin):
    list_display = ("id", "document", "source", "chars", "page_count", "is_scanned", "encrypted", "truncated", "extracted_at")
    list_filter = ("source", "is_scanned", "encrypted")
    search_fields = ("document__title",)
    raw_id_fields = ("document",)

