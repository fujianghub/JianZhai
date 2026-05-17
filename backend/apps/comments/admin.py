from django.contrib import admin

from .models import Comment


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("id", "document", "author", "block_id", "created_at")
    list_filter = ("document",)
    search_fields = ("content",)
