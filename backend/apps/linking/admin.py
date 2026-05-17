from django.contrib import admin

from .models import DocumentLink


@admin.register(DocumentLink)
class DocumentLinkAdmin(admin.ModelAdmin):
    list_display = ("source", "target", "position", "created_at")
    search_fields = ("source__title", "target__title")
