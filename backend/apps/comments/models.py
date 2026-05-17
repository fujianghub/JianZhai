from __future__ import annotations

from django.conf import settings
from django.db import models

from apps.knowledge.models import Document


class Comment(models.Model):
    """Doc-level or paragraph-level note attached to a Document.

    `block_id` is the data-block-id attribute of the rendered HTML node;
    if None, the comment applies to the whole document.
    """

    document = models.ForeignKey(
        Document, on_delete=models.CASCADE, related_name="comments"
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    block_id = models.CharField(max_length=64, blank=True)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["document", "block_id"]),
        ]

    def __str__(self) -> str:
        scope = self.block_id or "doc"
        return f"comment#{self.id} on {self.document_id}/{scope}"
