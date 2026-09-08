"""Render + keep the deck PDF for PPT/PPTX decks converted before it was stored.

``convert_pptx_to_slides`` now keeps LibreOffice's intermediate PDF as a
:class:`DerivedFile` (``deck_pdf``) so the reader can overlay a selectable text layer on each
slide. Decks converted earlier only have JPEG slides; this re-runs the
LibreOffice step alone (no re-rasterising, existing slides untouched) and
stores the PDF. Docs that already have a deck are skipped unless ``--force``.

Examples:
    python manage.py backfill_pptx_pdf --all
    python manage.py backfill_pptx_pdf --ids 452 453
    python manage.py backfill_pptx_pdf --kb test --dry-run
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from apps.editor.models import Attachment, DerivedFile, SlideImage
from apps.editor.tasks import ensure_deck_pdf
from apps.knowledge.models import Document


class Command(BaseCommand):
    help = "Render and store the deck PDF (text-layer source) for existing PPT decks."

    def add_arguments(self, parser):
        parser.add_argument("--ids", nargs="+", type=int, help="Document ids to backfill.")
        parser.add_argument("--kb", type=str, help="Backfill all pptx docs in this KB slug.")
        parser.add_argument("--all", action="store_true", help="Backfill every pptx document.")
        parser.add_argument("--force", action="store_true", help="Re-render even if a deck exists.")
        parser.add_argument(
            "--dry-run", action="store_true", help="List targets without changing anything."
        )

    def handle(self, *args, **opts):
        if not (opts["ids"] or opts["kb"] or opts["all"]):
            raise CommandError("Specify one of --ids, --kb, or --all.")

        ppt_att = Attachment.objects.filter(
            kind=Attachment.KIND_DOCUMENT, original_filename__iregex=r"\.pptx?$"
        )
        qs = Document.objects.filter(id__in=ppt_att.values("document_id")).distinct()
        if opts["ids"]:
            qs = qs.filter(id__in=opts["ids"])
        if opts["kb"]:
            qs = qs.filter(knowledge_base__slug=opts["kb"])
        if not opts["force"]:
            qs = qs.exclude(
                id__in=DerivedFile.objects.filter(kind=DerivedFile.KIND_DECK_PDF).values("document_id")
            )

        self.stdout.write(f"{qs.count()} candidate PPT document(s) without a deck PDF.")
        ok = failed = skipped = 0
        for doc in qs.iterator():
            att = ppt_att.filter(document_id=doc.id).order_by("-id").first()
            pages = SlideImage.objects.filter(document_id=doc.id).count()
            if opts["dry_run"]:
                self.stdout.write(
                    f"  [dry-run] id={doc.id} {doc.title!r} att={att and att.id} slides={pages}"
                )
                continue
            if not att:
                skipped += 1
                self.stdout.write(self.style.WARNING(f"  - id={doc.id} — no pptx attachment"))
                continue
            try:
                if ensure_deck_pdf(doc.id, att, pages):
                    ok += 1
                    self.stdout.write(self.style.SUCCESS(f"  ✓ id={doc.id} {doc.title!r}"))
                else:
                    failed += 1
                    self.stdout.write(self.style.WARNING(f"  ✗ id={doc.id} — deck not stored"))
            except Exception as exc:  # noqa: BLE001 — keep going through the batch
                failed += 1
                self.stdout.write(self.style.WARNING(f"  ✗ id={doc.id} — {exc}"))
        if not opts["dry_run"]:
            self.stdout.write(f"done: {ok} ok, {failed} failed, {skipped} skipped")
