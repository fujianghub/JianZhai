from django.contrib import admin

from .models import DocumentTag, Tag


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "owner", "color", "created_at")
    search_fields = ("name", "slug")


@admin.register(DocumentTag)
class DocumentTagAdmin(admin.ModelAdmin):
    list_display = ("document", "tag", "created_at")
