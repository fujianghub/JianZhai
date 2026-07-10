"""Backfill speaker notes onto already-rendered PPT/PPTX slides.

Decks converted before notes extraction existed have empty ``SlideImage.notes``.
This re-reads the notes from the stored original attachment (via python-pptx) and
updates the existing slide rows *in place* — it never re-rasterises, so it is
fast and leaves the images/thumbnails untouched (unlike ``reconvert_pptx``).

Notes align to slides by index; a deck with hidden slides may drift, so pages
past the notes count are left blank rather than mis-assigned.

Examples:
    python manage.py backfill_pptx_notes --all
    python manage.py backfill_pptx_notes --ids 452
    python manage.py backfill_pptx_notes --kb test
    python manage.py backfill_pptx_notes --all --dry-run
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.editor.models import Attachment, SlideImage
from apps.editor.tasks import extract_pptx_notes
from apps.knowledge.models import Document


class Command(BaseCommand):
    help = "Backfill speaker notes onto existing PPT/PPTX slides (no re-render)."

    def add_arguments(self, parser):
        parser.add_argument("--ids", nargs="+", type=int, help="Document ids to backfill.")
        parser.add_argument("--kb", type=str, help="Backfill all pptx docs in this KB slug.")
        parser.add_argument("--all", action="store_true", help="Backfill every pptx document.")
        parser.add_argument(
            "--dry-run", action="store_true", help="Report what would change without writing."
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
        ok = skipped = 0
        for doc in qs.iterator():
            slides = list(SlideImage.objects.filter(document_id=doc.id).order_by("index"))
            if not slides:
                skipped += 1
                self.stdout.write(self.style.WARNING(f"  ✗ id={doc.id} — no slides rendered yet"))
                continue
            att = ppt_att.filter(document_id=doc.id).order_by("-id").first()
            if not att:
                skipped += 1
                self.stdout.write(self.style.WARNING(f"  ✗ id={doc.id} — no pptx attachment"))
                continue

            # python-pptx needs a real file path; the attachment may live in remote
            # storage, so copy it to a temp file before opening.
            with tempfile.TemporaryDirectory() as tmp:
                pptx_path = Path(tmp) / "deck.pptx"
                with att.file.open("rb") as fh:
                    pptx_path.write_bytes(fh.read())
                notes = extract_pptx_notes(pptx_path)

            filled = 0
            to_update = []
            for s in slides:
                text = notes[s.index] if s.index < len(notes) else ""
                if text and text != s.notes:
                    s.notes = text
                    to_update.append(s)
                    filled += 1

            if opts["dry_run"]:
                self.stdout.write(
                    f"  [dry-run] id={doc.id} {doc.title!r} — {filled}/{len(slides)} "
                    f"slide(s) would get notes"
                )
                continue

            if to_update:
                SlideImage.objects.bulk_update(to_update, ["notes"])
            ok += 1
            self.stdout.write(
                self.style.SUCCESS(
                    f"  ✓ id={doc.id} {doc.title!r} — {filled}/{len(slides)} slide(s) with notes"
                )
            )
        if not opts["dry_run"]:
            self.stdout.write(self.style.SUCCESS(f"Done: {ok} updated, {skipped} skipped."))
