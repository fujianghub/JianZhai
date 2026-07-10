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


def _slide_upload_path(instance: "SlideImage", filename: str) -> str:
    """Store rendered PPT slide rasters under slides/YYYY/MM/<uuid>-<idx>.<ext>."""
    ext = Path(filename).suffix.lower() or ".png"
    now = datetime.now()
    return f"slides/{now:%Y}/{now:%m}/{uuid.uuid4().hex}-{instance.index}{ext}"


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


class SlideImage(models.Model):
    """One rendered page of a PPT/PPTX presentation.

    A pptx upload is converted server-side (LibreOffice → PDF → per-page PNG via
    ``editor.tasks.convert_pptx_to_slides``) into an ordered set of these rows,
    which the blog's Youdao-style ``PptxReader`` renders with a thumbnail rail.
    ``index`` is a stable 0-based order; ``unique_together`` makes re-conversion
    idempotent so a retry never duplicates slides.
    """

    document = models.ForeignKey(
        Document, on_delete=models.CASCADE, related_name="slides"
    )
    source = models.ForeignKey(
        Attachment, on_delete=models.CASCADE, related_name="slide_images"
    )
    index = models.PositiveIntegerField()
    image = models.ImageField(upload_to=_slide_upload_path, max_length=500)
    # Small rail thumbnail (~320px JPEG). The Youdao-style reader shows 1 full-res
    # main slide but a whole vertical rail of thumbnails; serving the full raster
    # for every thumbnail made a 94-slide deck load ~24 MB / decode ~850 MB. Blank
    # for legacy rows converted before thumbnails existed (reader falls back to
    # ``image``); ``manage.py reconvert_pptx`` backfills them.
    thumbnail = models.ImageField(
        upload_to=_slide_upload_path, max_length=500, blank=True
    )
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    # Speaker notes for this slide (extracted from the pptx via python-pptx during
    # conversion). Empty for slides without notes and for legacy rows converted
    # before notes extraction existed (``manage.py backfill_pptx_notes`` fills them).
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["index"]
        unique_together = [("document", "index")]
        indexes = [models.Index(fields=["document", "index"])]

    def __str__(self) -> str:
        return f"{self.document_id} slide {self.index}"

    @property
    def url(self) -> str:
        return self.image.url if self.image else ""

    @property
    def thumb_url(self) -> str:
        """Rail thumbnail URL; falls back to the full raster for legacy rows."""
        if self.thumbnail:
            return self.thumbnail.url
        return self.image.url if self.image else ""

    def as_dict(self) -> dict:
        """Reader-facing projection; single source for both serializers."""
        return {
            "index": self.index,
            "url": self.url,
            "thumb": self.thumb_url,
            "width": self.width,
            "height": self.height,
            "notes": self.notes,
        }
