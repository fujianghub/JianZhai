"""Queue (or run) OCR for scanned PDFs that have no OCR copy yet.

Selection = PDF documents whose ``DocumentExtract`` says ``is_scanned`` and
that have no ``DerivedFile(ocr_pdf)`` (``--force`` re-OCRs those too). By
default the work goes to the ``ocr`` Celery queue with a per-document time
limit; ``--inline`` runs it in this process (no worker needed, hours for big
books).

    manage.py backfill_ocr --all --dry-run
    manage.py backfill_ocr --kb test --inline
    manage.py backfill_ocr --ids 12 --max-pages 300 --force
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from apps.editor.models import Attachment, DerivedFile, DocumentExtract
from apps.editor.tasks import ocr_pdf, queue_ocr
from apps.knowledge.models import Document


class Command(BaseCommand):
    help = "OCR scanned PDFs into DerivedFile(ocr_pdf) via ocrmypdf."

    def add_arguments(self, parser):
        parser.add_argument("--ids", nargs="+", type=int)
        parser.add_argument("--kb", type=str)
        parser.add_argument("--all", action="store_true")
        parser.add_argument("--force", action="store_true", help="Re-OCR documents that already have a copy.")
        parser.add_argument("--max-pages", type=int, default=None, help="OCR only the first N pages (default OCR_MAX_PAGES).")
        parser.add_argument("--inline", action="store_true", help="Run in this process instead of queueing.")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **opts):
        if not (opts["ids"] or opts["kb"] or opts["all"]):
            raise CommandError("Specify one of --ids, --kb, or --all.")
        pdfs = Attachment.objects.filter(kind=Attachment.KIND_DOCUMENT, original_filename__iregex=r"\.pdf$")
        scanned = DocumentExtract.objects.filter(is_scanned=True, encrypted=False).values("document_id")
        qs = Document.objects.filter(id__in=pdfs.values("document_id")).filter(id__in=scanned).distinct()
        if opts["ids"]:
            qs = qs.filter(id__in=opts["ids"])
        if opts["kb"]:
            qs = qs.filter(knowledge_base__slug=opts["kb"])
        if not opts["force"]:
            qs = qs.exclude(id__in=DerivedFile.objects.filter(kind=DerivedFile.KIND_OCR_PDF).values("document_id"))
        qs = qs.select_related("extract").order_by("id")
        self.stdout.write(f"{qs.count()} scanned PDF(s) to OCR.")
        ok = failed = 0
        for doc in qs.iterator():
            pages = getattr(getattr(doc, "extract", None), "page_count", 0) or 0
            if opts["dry_run"]:
                self.stdout.write(f"  [dry-run] id={doc.id} pages={pages} {doc.title!r}")
                continue
            if opts["inline"]:
                try:
                    res = ocr_pdf(doc.id, force=opts["force"], max_pages=opts["max_pages"])
                    ok += 1
                    self.stdout.write(f"  id={doc.id} {res}")
                except Exception as exc:  # noqa: BLE001
                    failed += 1
                    self.stderr.write(f"  id={doc.id} FAILED: {exc}")
            else:
                if queue_ocr(doc.id, pages, force=opts["force"], max_pages=opts["max_pages"]):
                    ok += 1
                    self.stdout.write(f"  queued id={doc.id} pages={pages}")
                else:
                    failed += 1
                    self.stderr.write(f"  id={doc.id} could not queue (OCR disabled or broker down)")
        if not opts["dry_run"]:
            self.stdout.write(f"done: {ok} ok, {failed} failed")
