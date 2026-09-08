from django.contrib import admin

from .models import Bookmark, Highlight, ReadingPosition


@admin.register(Highlight)
class HighlightAdmin(admin.ModelAdmin):
    list_display = ("id", "document", "user", "color", "style", "chapter", "created_at")
    list_filter = ("color", "style")
    search_fields = ("text", "note")


@admin.register(Bookmark)
class BookmarkAdmin(admin.ModelAdmin):
    list_display = ("id", "document", "user", "chapter", "created_at")



@admin.register(ReadingPosition)
class ReadingPositionAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "document", "page", "slide", "fraction", "updated_at")
    raw_id_fields = ("user", "document")

