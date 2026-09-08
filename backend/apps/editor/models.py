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


def _derived_upload_path(instance: "DerivedFile", filename: str) -> str:
    """Server-derived files (deck PDF / OCR copy / poster / cover) under
    derived/YYYY/MM/<uuid>.<ext> — uuid names are immutable, so the CDN/Caddy
    layer may cache them forever."""
    ext = Path(filename).suffix.lower() or ".bin"
    now = datetime.now()
    return f"derived/{now:%Y}/{now:%m}/{uuid.uuid4().hex}{ext}"


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


class DerivedFile(models.Model):
    """A server-generated companion file for a document, one per ``kind``.

    - ``deck_pdf``: the LibreOffice PDF a PPT/PPTX's slide rasters were cut
      from. ``convert_pptx_to_slides`` used to throw it away; it is kept so the
      reader can lay pdf.js's selectable text layer and clickable links over
      each slide image (same render → pixel-aligned). Decks converted before
      this existed get one via ``backfill_pptx_pdf``.
    - ``ocr_pdf``: OCR'd copy of a scanned PDF (text layer + search source).
    - ``poster``: first-page raster of a PDF for cards / hover previews.
    - ``cover``: EPUB cover image.

    Deliberately *not* an ``Attachment``: primary-attachment / ``doc_format``
    detection picks by attachment and must never see a derived ``.pdf``.
    """

    KIND_DECK_PDF = "deck_pdf"
    KIND_OCR_PDF = "ocr_pdf"
    KIND_POSTER = "poster"
    KIND_COVER = "cover"
    KIND_CHOICES = [
        (KIND_DECK_PDF, "Slide deck PDF"),
        (KIND_OCR_PDF, "OCR PDF"),
        (KIND_POSTER, "Poster"),
        (KIND_COVER, "Cover"),
    ]

    document = models.ForeignKey(
        Document, on_delete=models.CASCADE, related_name="derived_files"
    )
    source = models.ForeignKey(
        "Attachment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="derived_files",
    )
    kind = models.CharField(max_length=16, choices=KIND_CHOICES)
    file = models.FileField(upload_to=_derived_upload_path, max_length=500)
    page_count = models.PositiveIntegerField(default=0)
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    size = models.BigIntegerField(default=0)
    meta = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["document", "kind"], name="editor_derivedfile_unique_kind"
            ),
        ]
        indexes = [models.Index(fields=["document", "kind"])]

    def __str__(self) -> str:
        return f"{self.document_id} {self.kind}"

    @property
    def url(self) -> str:
        return self.file.url if self.file else ""

    def as_dict(self) -> dict:
        return {
            "kind": self.kind,
            "url": self.url,
            "page_count": self.page_count,
            "width": self.width,
            "height": self.height,
            "size": self.size,
        }


class ConversionJob(models.Model):
    """One run of a server-side conversion (pptx → slides, deck PDF backfill,
    text extraction, poster, OCR …) — the observability row the AI side has
    had all along (``AIUsageLog``) and conversions never did.

    Every run writes a row (running → done/failed) so "how long does a 94-slide
    deck take", "which decks are stuck", "what failed last night" are queries
    instead of log grepping. ``sweep_stuck_conversions`` uses it to tell a
    worker that died mid-task (no ``running`` row, ``pending`` doc) from one
    that is legitimately still converting.
    """

    KIND_PPTX_SLIDES = "pptx_slides"
    KIND_DECK_PDF = "deck_pdf"
    KIND_PDF_EXTRACT = "pdf_extract"
    KIND_POSTER = "poster"
    KIND_COVER = "cover"
    KIND_OCR = "ocr"
    KIND_CHOICES = [
        (KIND_PPTX_SLIDES, "PPTX → slides"),
        (KIND_DECK_PDF, "Deck PDF"),
        (KIND_PDF_EXTRACT, "Text extract"),
        (KIND_POSTER, "Poster"),
        (KIND_COVER, "Cover"),
        (KIND_OCR, "OCR"),
    ]
    STATUS_RUNNING = "running"
    STATUS_DONE = "done"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [(STATUS_RUNNING, "Running"), (STATUS_DONE, "Done"), (STATUS_FAILED, "Failed")]

    document = models.ForeignKey(
        Document, on_delete=models.SET_NULL, null=True, blank=True, related_name="conversion_jobs"
    )
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_RUNNING)
    task_id = models.CharField(max_length=64, blank=True, default="")
    attempt = models.PositiveSmallIntegerField(default=0)
    pages = models.PositiveIntegerField(default=0)
    src_bytes = models.BigIntegerField(default=0)
    out_bytes = models.BigIntegerField(default=0)
    duration_ms = models.PositiveIntegerField(default=0)
    error = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["document", "kind"]),
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.kind} #{self.document_id} {self.status}"

    def finish(self, status: str, *, error: str = "", **fields) -> None:
        from django.utils import timezone

        self.status = status
        self.error = (error or "")[:200]
        self.finished_at = timezone.now()
        self.duration_ms = int((self.finished_at - self.created_at).total_seconds() * 1000)
        for k, v in fields.items():
            setattr(self, k, v)
        self.save(update_fields=["status", "error", "finished_at", "duration_ms", *fields.keys()])


class DocumentExtract(models.Model):
    """Index-only text pulled out of a binary attachment (PDF / PPT deck PDF /
    OCR copy / EPUB), plus the file facts the reader and cards want
    (page count, encrypted, scanned).

    Kept apart from ``Document.raw_content`` on purpose: that column is the
    author's editable body — it is rendered, exported and previewed — whereas
    this text exists only to feed ``search_vector`` and the search snippet.
    """

    SOURCE_CHOICES = [
        ("none", "None"),
        ("pdf", "PDF (pdftotext)"),
        ("deck_pdf", "Slide deck PDF"),
        ("ocr_pdf", "OCR PDF"),
        ("epub", "EPUB"),
    ]

    document = models.OneToOneField(Document, on_delete=models.CASCADE, related_name="extract")
    source = models.CharField(max_length=16, choices=SOURCE_CHOICES, default="none")
    text = models.TextField(blank=True, default="")
    chars = models.PositiveIntegerField(default=0)
    truncated = models.BooleanField(default=False)
    page_count = models.PositiveIntegerField(default=0)
    encrypted = models.BooleanField(default=False)
    is_scanned = models.BooleanField(default=False)
    meta = models.JSONField(default=dict, blank=True)
    extracted_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["is_scanned"])]

    def __str__(self) -> str:
        return f"{self.document_id} extract ({self.source}, {self.chars} chars)"

