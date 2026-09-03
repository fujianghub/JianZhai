"""Per-reader state on top of a document: EPUB highlights (with notes) and
manual bookmarks.

Both are *private* to the user who made them (an author sees only their own,
exactly like ``DocumentFavorite``), and both anchor into the book with an
EPUB CFI — foliate-js resolves ``cfi`` back to a DOM range at render time, so
the server never needs to understand the book's structure.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models

from apps.knowledge.models import Document

HIGHLIGHT_COLORS = ("yellow", "green", "blue", "pink", "purple", "red", "orange")
HIGHLIGHT_STYLES = ("highlight", "underline", "squiggly")
CFI_MAX_LENGTH = 1000


class Highlight(models.Model):
    """A highlighted range in an EPUB, optionally with a note."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="epub_highlights"
    )
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="highlights")
    # EPUB anchor: range CFI (``epubcfi(/6/14!/4/2,/1:0,/1:12)``); the overlay
    # is redrawn from it on every chapter load. Blank for Markdown highlights.
    cfi = models.CharField(max_length=CFI_MAX_LENGTH, blank=True, default="")
    # Markdown anchor (TextQuote-style): ``{quote, prefix?, suffix?, heading?}``
    # — re-anchored client-side by searching the rendered article's filtered
    # text; drift-tolerant, marked 失效 (never dropped) when the quote is gone.
    # Exactly one of ``cfi`` / ``selector`` is set (serializer-enforced).
    selector = models.JSONField(null=True, blank=True)
    # Plain-text excerpt of the range at creation — the quote shown in the
    # notes list and exported to Markdown (kept even if the book changes).
    text = models.TextField(blank=True)
    chapter = models.CharField(max_length=200, blank=True)
    color = models.CharField(
        max_length=16, choices=[(c, c) for c in HIGHLIGHT_COLORS], default="yellow"
    )
    style = models.CharField(
        max_length=16, choices=[(s, s) for s in HIGHLIGHT_STYLES], default="highlight"
    )
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["user", "document"])]

    def __str__(self) -> str:
        return f"highlight#{self.id} {self.color} on {self.document_id} by {self.user_id}"


class Bookmark(models.Model):
    """A manual bookmark (distinct from the automatic reading position)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="epub_bookmarks"
    )
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="bookmarks")
    # Point (collapsed) CFI of the page top.
    cfi = models.CharField(max_length=CFI_MAX_LENGTH)
    chapter = models.CharField(max_length=200, blank=True)
    excerpt = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["user", "document"])]
        constraints = [
            models.UniqueConstraint(fields=["user", "document", "cfi"], name="reading_bookmark_unique_cfi"),
        ]

    def __str__(self) -> str:
        return f"bookmark#{self.id} on {self.document_id} by {self.user_id}"
