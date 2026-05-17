from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.db import models

from apps.knowledge.models import Document


def _upload_path(instance: "Attachment", filename: str) -> str:
    """Store uploads under uploads/YYYY/MM/<uuid>.<ext> to avoid filename clashes."""
    ext = Path(filename).suffix.lower()
    now = datetime.now()
    return f"uploads/{now:%Y}/{now:%m}/{uuid.uuid4().hex}{ext}"


class Attachment(models.Model):
    KIND_IMAGE = "image"
    KIND_DOCUMENT = "document"  # pdf/docx/html/md/etc.
    KIND_OTHER = "other"
    KIND_CHOICES = [
        (KIND_IMAGE, "Image"),
        (KIND_DOCUMENT, "Document"),
        (KIND_OTHER, "Other"),
    ]

    document = models.ForeignKey(
        Document,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="attachments",
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    file = models.FileField(upload_to=_upload_path, max_length=500)
    original_filename = models.CharField(max_length=255)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default=KIND_OTHER)
    mime_type = models.CharField(max_length=100, blank=True)
    size = models.BigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["document", "-created_at"]),
            models.Index(fields=["uploaded_by", "-created_at"]),
        ]

    def __str__(self) -> str:
        return self.original_filename

    @property
    def url(self) -> str:
        return self.file.url if self.file else ""
