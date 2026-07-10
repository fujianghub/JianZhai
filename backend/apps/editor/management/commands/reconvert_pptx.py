"""Re-run PPT/PPTX → slide-image conversion for already-imported decks.

Decks converted before the JPEG + rail-thumbnail change carry heavy full-res
PNG slides and no thumbnails. This clears their existing SlideImage rows and
re-renders from the stored original attachment (JPEG main + light thumbnail),
running the conversion inline so results are reported.

Examples:
    python manage.py reconvert_pptx --all
    python manage.py reconvert_pptx --ids 452
    python manage.py reconvert_pptx --kb test
    python manage.py reconvert_pptx --all --dry-run
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from apps.editor.models import Attachment, SlideImage
from apps.editor.tasks import convert_pptx_to_slides
from apps.knowledge.models import Document


class Command(BaseCommand):
    help = "Re-render PPT/PPTX slide images (backfill JPEG + rail thumbnails)."

    def add_arguments(self, parser):
        parser.add_argument("--ids", nargs="+", type=int, help="Document ids to reconvert.")
        parser.add_argument("--kb", type=str, help="Reconvert all pptx docs in this KB slug.")
        parser.add_argument("--all", action="store_true", help="Reconvert every pptx document.")
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

        self.stdout.write(f"{qs.count()} candidate PPT document(s).")
        ok = failed = 0
        for doc in qs.iterator():
            att = (
                ppt_att.filter(document_id=doc.id).order_by("-id").first()
            )
            if opts["dry_run"]:
                self.stdout.write(f"  [dry-run] id={doc.id} {doc.title!r} att={att and att.id}")
                continue
            if not att:
                failed += 1
                self.stdout.write(self.style.WARNING(f"  ✗ id={doc.id} — no pptx attachment"))
                continue
            # Drop old slides (files + rows) so conversion isn't short-circuited
            # by the idempotency guard, then re-render inline.
            old = SlideImage.objects.filter(document_id=doc.id)
            for s in old:
                for f in (s.image, s.thumbnail):
                    try:
                        if f:
                            f.delete(save=False)
                    except Exception:  # noqa: BLE001
                        pass
            old.delete()
            n = convert_pptx_to_slides(doc.id, att.id)
            doc.refresh_from_db()
            if doc.slide_status == "done" and n > 0:
                ok += 1
                self.stdout.write(self.style.SUCCESS(f"  ✓ id={doc.id} {doc.title!r} — {n} slides"))
            else:
                failed += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"  ✗ id={doc.id} {doc.title!r} — status={doc.slide_status} {doc.slide_error!r}"
                    )
                )
        if not opts["dry_run"]:
            self.stdout.write(self.style.SUCCESS(f"Done: {ok} reconverted, {failed} skipped."))
