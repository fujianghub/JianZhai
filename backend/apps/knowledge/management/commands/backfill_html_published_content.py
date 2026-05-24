"""Backfill ``published_content`` for HTML-format documents.

The blog reader (``frontend/src/pages/blog/PostDetail.tsx``) renders an HTML
document inline via ``<iframe srcDoc>`` only when ``published_content`` is
non-empty. Older imports — or drafts that were never explicitly published —
can leave ``published_content`` blank, which falls back to the attachment
preview path (a download-style iframe with a "下载原文件" button).

This command finds every HTML document with empty ``published_content`` and:

* if ``raw_content`` already has the page text, copy it across, or
* if both fields are empty but a primary ``.html`` attachment exists, fetch the
  attachment file, decode (UTF-8 → GBK fallback) and populate both fields.

Idempotent. Use ``--dry-run`` to preview without writing.

Usage::

    python manage.py backfill_html_published_content
    python manage.py backfill_html_published_content --dry-run
    python manage.py backfill_html_published_content --owner alice
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db.models import Prefetch

from apps.editor.models import Attachment
from apps.knowledge.html_content import resolve_html_body
from apps.knowledge.models import Document
from apps.knowledge.serializers import detect_doc_format


class Command(BaseCommand):
    help = (
        "Ensure HTML-format documents have published_content set so the blog "
        "renders them inline (iframe srcdoc) instead of as a downloadable file."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing.",
        )
        parser.add_argument(
            "--owner",
            help="Restrict to documents whose KB owner matches this username.",
        )

    def handle(self, *args, **opts):
        dry_run: bool = bool(opts["dry_run"])
        owner: str | None = opts.get("owner")

        qs = Document.objects.all().prefetch_related(
            Prefetch(
                "attachments",
                queryset=Attachment.objects.order_by("created_at"),
                to_attr="ordered_attachments",
            )
        )
        if owner:
            qs = qs.filter(knowledge_base__owner__username=owner)

        scanned = 0
        already_ok = 0
        filled_from_raw = 0
        filled_from_attachment = 0
        unrecoverable = 0

        for doc in qs.iterator():
            if detect_doc_format(doc) != "html":
                continue
            scanned += 1

            if (doc.published_content or "").strip():
                already_ok += 1
                continue

            if (doc.raw_content or "").strip():
                if not dry_run:
                    doc.published_content = doc.raw_content
                    doc.save(update_fields=["published_content", "updated_at"])
                filled_from_raw += 1
                self.stdout.write(
                    self.style.SUCCESS(f"  ↻ raw → published  [{doc.id}] {doc.title}")
                )
                continue

            text = resolve_html_body(doc)
            if text.strip():
                if not dry_run:
                    doc.raw_content = text
                    doc.published_content = text
                    doc.save(
                        update_fields=[
                            "raw_content",
                            "published_content",
                            "updated_at",
                        ]
                    )
                filled_from_attachment += 1
                self.stdout.write(
                    self.style.SUCCESS(f"  ↻ attachment → both  [{doc.id}] {doc.title}")
                )
            else:
                unrecoverable += 1
                self.stdout.write(
                    self.style.WARNING(f"  ✗ no content available  [{doc.id}] {doc.title}")
                )

        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING("HTML 文档 published_content 回填"))
        self.stdout.write(f"  扫描 HTML 文档:           {scanned}")
        self.stdout.write(f"  已正常 (无需处理):        {already_ok}")
        self.stdout.write(f"  raw_content → published:  {filled_from_raw}")
        self.stdout.write(f"  附件 → raw + published:   {filled_from_attachment}")
        self.stdout.write(f"  无内容可恢复:             {unrecoverable}")
        if dry_run:
            self.stdout.write(self.style.NOTICE("(dry-run，未写入数据库)"))
