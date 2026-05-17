from django.contrib import admin

from .models import Document, Folder, KnowledgeBase


@admin.register(KnowledgeBase)
class KnowledgeBaseAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "visibility", "is_deleted", "updated_at")
    list_filter = ("visibility", "is_deleted")
    search_fields = ("name", "slug")


@admin.register(Folder)
class FolderAdmin(admin.ModelAdmin):
    list_display = ("name", "knowledge_base", "parent", "order", "is_deleted")
    list_filter = ("knowledge_base", "is_deleted")
    search_fields = ("name",)


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("title", "knowledge_base", "folder", "status", "visibility", "updated_at")
    list_filter = ("status", "visibility", "knowledge_base", "is_deleted")
    search_fields = ("title", "slug")
    readonly_fields = ("search_vector", "created_at", "updated_at", "published_at")
