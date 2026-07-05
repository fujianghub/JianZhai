"""Re-run DOCX → Markdown conversion for already-imported documents.

The importer only converts a ``.docx`` at upload time, so documents imported
before a converter improvement keep their old (or empty) body. This backfills
them in place from the stored original ``.docx`` attachment.

Examples:
    python manage.py reconvert_docx --all
    python manage.py reconvert_docx --ids 443 445
    python manage.py reconvert_docx --kb test
    python manage.py reconvert_docx --all --dry-run
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from apps.editor.models import Attachment
from apps.editor.services.docx_import import reconvert_document
from apps.knowledge.models import Document


class Command(BaseCommand):
    help = "Re-run DOCX conversion for imported documents (backfill after a converter fix)."

    def add_arguments(self, parser):
        parser.add_argument("--ids", nargs="+", type=int, help="Document ids to reconvert.")
        parser.add_argument("--kb", type=str, help="Reconvert all docx docs in this KB slug.")
        parser.add_argument("--all", action="store_true", help="Reconvert every docx document.")
        parser.add_argument(
            "--dry-run", action="store_true", help="List targets without changing anything."
        )

    def handle(self, *args, **opts):
        if not (opts["ids"] or opts["kb"] or opts["all"]):
            raise CommandError("Specify one of --ids, --kb, or --all.")

        # A document is a DOCX candidate iff it has a .docx source attachment.
        docx_att = Attachment.objects.filter(
            kind=Attachment.KIND_DOCUMENT, original_filename__iendswith=".docx"
        )
        qs = Document.objects.filter(id__in=docx_att.values("document_id")).distinct()
        if opts["ids"]:
            qs = qs.filter(id__in=opts["ids"])
        if opts["kb"]:
            qs = qs.filter(knowledge_base__slug=opts["kb"])

        total = qs.count()
        self.stdout.write(f"{total} candidate DOCX document(s).")
        ok = failed = 0
        for doc in qs.iterator():
            if opts["dry_run"]:
                self.stdout.write(f"  [dry-run] id={doc.id} {doc.title!r}")
                continue
            result = reconvert_document(doc)
            if result.get("ok"):
                ok += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  ✓ id={doc.id} {doc.title!r} — {result['chars']} chars, "
                        f"{result['images']} image(s)"
                    )
                )
            else:
                failed += 1
                self.stdout.write(
                    self.style.WARNING(f"  ✗ id={doc.id} {doc.title!r} — {result.get('reason')}")
                )
        if not opts["dry_run"]:
            self.stdout.write(self.style.SUCCESS(f"Done: {ok} reconverted, {failed} skipped."))
