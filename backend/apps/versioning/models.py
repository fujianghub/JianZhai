from __future__ import annotations

from django.conf import settings
from django.db import models, transaction

from apps.knowledge.models import Document

VERSION_HISTORY_LIMIT = 100


def _word_count(text: str) -> int:
    """Approximate word count: CJK chars counted singly + alphanumeric tokens."""
    if not text:
        return 0
    import re

    cjk = len(re.findall(r"[一-鿿㐀-䶿]", text))
    words = len(re.findall(r"[A-Za-z0-9_]+", text))
    return cjk + words


class DocumentVersion(models.Model):
    document = models.ForeignKey(
        Document, on_delete=models.CASCADE, related_name="versions"
    )
    content = models.TextField()
    message = models.CharField(max_length=300, blank=True)
    word_count = models.IntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["document", "-created_at"])]

    def __str__(self) -> str:
        return f"v#{self.id} of doc#{self.document_id}"

    @classmethod
    @transaction.atomic
    def create_snapshot(
        cls,
        *,
        document: Document,
        content: str,
        message: str = "",
        created_by=None,
    ) -> "DocumentVersion":
        v = cls.objects.create(
            document=document,
            content=content,
            message=message[:300],
            word_count=_word_count(content),
            created_by=created_by,
        )
        cls._trim_history(document)
        return v

    @classmethod
    def _trim_history(cls, document: Document) -> None:
        ids = list(
            cls.objects.filter(document=document)
            .order_by("-created_at", "-id")
            .values_list("id", flat=True)[VERSION_HISTORY_LIMIT:]
        )
        if ids:
            cls.objects.filter(id__in=ids).delete()
