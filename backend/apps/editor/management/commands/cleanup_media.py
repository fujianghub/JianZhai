"""Report (and optionally delete) orphan files under media/uploads|slides|derived.

Report-only unless ``--apply`` is given. Files newer than ``--min-age-hours``
(default 24) are never touched.

    manage.py cleanup_media                       # report
    manage.py cleanup_media --apply               # delete orphans older than 24h
    manage.py cleanup_media --roots uploads --min-age-hours 72
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.editor.media_maintenance import MEDIA_ROOTS, cleanup_media


class Command(BaseCommand):
    help = "Find orphan media files (no Attachment/SlideImage/DerivedFile row); delete with --apply."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Actually delete (default: report only).")
        parser.add_argument("--min-age-hours", type=int, default=24)
        parser.add_argument("--roots", type=str, default=",".join(MEDIA_ROOTS), help="Comma-separated subdirs of MEDIA_ROOT.")
        parser.add_argument("--examples", type=int, default=20)
        parser.add_argument("--row-min-age-days", type=int, default=7, help="Age before a document-less Attachment row counts as orphan.")

    def handle(self, *args, **opts):
        roots = tuple(r.strip() for r in opts["roots"].split(",") if r.strip())
        stats = cleanup_media(
            roots=roots, min_age_hours=opts["min_age_hours"], apply=opts["apply"],
            limit_examples=opts["examples"], row_min_age_days=opts["row_min_age_days"],
        )
        mode = "deleted" if opts["apply"] else "report-only"
        self.stdout.write(
            self.style.SUCCESS(
                f"[{mode}] scanned={stats['scanned']} orphans={stats['orphans']} "
                f"({stats['orphan_bytes'] / 1e6:.1f} MB) deleted={stats['deleted']} "
                f"orphan_rows={stats['orphan_rows']} deleted_rows={stats['deleted_rows']}"
            )
        )
        for rel in stats["examples"]:
            self.stdout.write(f"  - {rel}")
