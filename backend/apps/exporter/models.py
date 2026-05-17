from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.db import models


class ExportTask(models.Model):
    SCOPE_DOC = "doc"
    SCOPE_FOLDER = "folder"
    SCOPE_KB = "kb"
    SCOPE_CHOICES = [
        (SCOPE_DOC, "Document"),
        (SCOPE_FOLDER, "Folder"),
        (SCOPE_KB, "Knowledge Base"),
    ]

    FORMAT_MD = "md"
    FORMAT_HTML = "html"
    FORMAT_PDF = "pdf"
    FORMAT_DOCX = "docx"
    FORMAT_SITE = "site"
    FORMAT_CHOICES = [
        (FORMAT_MD, "Markdown"),
        (FORMAT_HTML, "HTML"),
        (FORMAT_PDF, "PDF"),
        (FORMAT_DOCX, "Word (docx)"),
        (FORMAT_SITE, "Static site (zip)"),
    ]

    STATUS_PENDING = "pending"
    STATUS_RUNNING = "running"
    STATUS_DONE = "done"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_RUNNING, "Running"),
        (STATUS_DONE, "Done"),
        (STATUS_FAILED, "Failed"),
    ]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="export_tasks"
    )
    scope = models.CharField(max_length=10, choices=SCOPE_CHOICES)
    target_id = models.IntegerField()
    target_label = models.CharField(max_length=200, blank=True)
    format = models.CharField(max_length=10, choices=FORMAT_CHOICES)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING)

    file_path = models.CharField(max_length=500, blank=True)
    file_size = models.BigIntegerField(default=0)
    filename = models.CharField(max_length=255, blank=True)
    mime_type = models.CharField(max_length=100, blank=True)

    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["owner", "-created_at"])]

    def __str__(self) -> str:
        return f"export #{self.id} {self.scope}:{self.target_id} → {self.format}"

    @property
    def absolute_file_path(self) -> Path | None:
        if not self.file_path:
            return None
        return Path(self.file_path)
