"""Extract searchable text for existing PDF / PPT / EPUB documents.

Runs ``extract_document_text`` inline (no worker needed) for every
binary-format document without a ``DocumentExtract`` row. Scanned PDFs get a
row too (``is_scanned=True``, empty text) so they are not re-scanned every run;
``--force`` re-extracts everything selected.

    manage.py backfill_document_text --all
    manage.py backfill_document_text --kb test --force
    manage.py backfill_document_text --ids 12 34 --dry-run
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from apps.editor.models import Attachment, DocumentExtract
from apps.editor.tasks import extract_document_text
from apps.knowledge.models import Document


class Command(BaseCommand):
    help = "Extract index-only text (pdftotext / deck PDF / EPUB) for binary documents."

    def add_arguments(self, parser):
        parser.add_argument("--ids", nargs="+", type=int)
        parser.add_argument("--kb", type=str)
        parser.add_argument("--all", action="store_true")
        parser.add_argument("--force", action="store_true", help="Re-extract even when a row exists.")
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--missing-posters", action="store_true", help="Also (re)run docs that have text but no poster/cover.")

    def handle(self, *args, **opts):
        if not (opts["ids"] or opts["kb"] or opts["all"]):
            raise CommandError("Specify one of --ids, --kb, or --all.")
        binary = Attachment.objects.filter(
            kind=Attachment.KIND_DOCUMENT, original_filename__iregex=r"\.(pdf|pptx?|epub)$"
        )
        qs = Document.objects.filter(id__in=binary.values("document_id")).distinct()
        if opts["ids"]:
            qs = qs.filter(id__in=opts["ids"])
        if opts["kb"]:
            qs = qs.filter(knowledge_base__slug=opts["kb"])
        if opts["missing_posters"]:
            from apps.editor.models import DerivedFile

            has_visual = DerivedFile.objects.filter(kind__in=["poster", "cover"]).values("document_id")
            qs = qs.filter(attachments__original_filename__iregex=r"\.(pdf|epub)$").exclude(id__in=has_visual).distinct()
        elif not opts["force"]:
            qs = qs.exclude(id__in=DocumentExtract.objects.values("document_id"))
        self.stdout.write(f"{qs.count()} document(s) to extract.")
        ok = failed = 0
        for doc in qs.iterator():
            if opts["dry_run"]:
                self.stdout.write(f"  [dry-run] id={doc.id} {doc.title!r}")
                continue
            try:
                res = extract_document_text(doc.id)
                ok += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  ✓ id={doc.id} {doc.title!r} source={res['source']} chars={res['chars']}"
                        + (" [scanned]" if res["is_scanned"] else "")
                        + (" [encrypted]" if res["encrypted"] else "")
                    )
                )
            except Exception as exc:  # noqa: BLE001
                failed += 1
                self.stdout.write(self.style.WARNING(f"  ✗ id={doc.id} — {exc}"))
        if not opts["dry_run"]:
            self.stdout.write(f"done: {ok} ok, {failed} failed")
