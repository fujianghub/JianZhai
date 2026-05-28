"""Snapshot the whole personal-knowledge-base + blog system into a single
portable zip — JSON dump of every model row plus all uploaded media plus a
meta.json with timestamps and Django/Python versions.

Reload with `python manage.py loaddata <extracted>/db.json` and then copy
`<extracted>/media/` back to `MEDIA_ROOT`. The intentionally minimal "restore"
story keeps this command focused on backup — a wrong-direction restore against
a populated DB is more dangerous than helpful as a single-command convenience,
so it's left manual.
"""
from __future__ import annotations

import io
import json
import os
import platform
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError


# Apps whose data must be preserved. Django's contenttypes / sessions / admin
# log / auth.permissions are excluded so loaddata into a fresh DB doesn't
# collide with the newly migrated content types.
DUMPDATA_APPS = [
    "auth.User",
    "accounts",
    "knowledge",
    "editor",
    "tags",
    "linking",
    "versioning",
    "exporter",
    "comments",
    "search",
    "ai",
    "blog",
]


class Command(BaseCommand):
    help = "Snapshot DB + media into a single timestamped zip under exports/."

    def add_arguments(self, parser):
        parser.add_argument(
            "--out-dir",
            default=None,
            help="Destination directory (default: <MEDIA_ROOT>/../exports/backups).",
        )
        parser.add_argument(
            "--no-media",
            action="store_true",
            help="DB-only snapshot — skip copying uploaded files (much smaller).",
        )

    def handle(self, *args, **opts):
        ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%SZ")
        out_dir = Path(opts["out_dir"] or (Path(settings.MEDIA_ROOT).parent / "exports" / "backups"))
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"jianzhai-backup-{ts}.zip"

        # 1) dumpdata into a string buffer (no temp file). Use natural keys so
        #    User FKs survive a reload into a DB with different PKs.
        self.stdout.write(self.style.NOTICE(f"Dumping {len(DUMPDATA_APPS)} apps to JSON…"))
        db_buf = io.StringIO()
        call_command(
            "dumpdata",
            *DUMPDATA_APPS,
            indent=2,
            natural_foreign=True,
            natural_primary=True,
            use_natural_foreign_keys=True,
            use_natural_primary_keys=True,
            stdout=db_buf,
        )
        db_bytes = db_buf.getvalue().encode("utf-8")

        # 2) Pack DB + meta + media into the zip in one pass.
        media_root = Path(settings.MEDIA_ROOT)
        include_media = not opts["no_media"]
        media_files: list[tuple[Path, str]] = []
        media_bytes = 0
        if include_media and media_root.exists():
            for root, _dirs, files in os.walk(media_root):
                for fn in files:
                    src = Path(root) / fn
                    try:
                        media_bytes += src.stat().st_size
                    except OSError:
                        continue
                    arc = "media/" + str(src.relative_to(media_root)).replace(os.sep, "/")
                    media_files.append((src, arc))

        meta = {
            "schema": "jianzhai-backup/1",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "python": platform.python_version(),
            "django": __import__("django").get_version(),
            "platform": sys.platform,
            "apps_dumped": DUMPDATA_APPS,
            "db_bytes": len(db_bytes),
            "media_files": len(media_files),
            "media_bytes": media_bytes,
            "includes_media": include_media,
        }

        self.stdout.write(self.style.NOTICE(f"Writing {out_path}…"))
        # ZIP_DEFLATED keeps the JSON small without hurting the (already
        # mostly-compressed) media files much; allowZip64 covers >4GB archives.
        with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
            zf.writestr("meta.json", json.dumps(meta, indent=2, ensure_ascii=False))
            zf.writestr("db.json", db_bytes)
            for src, arc in media_files:
                try:
                    zf.write(src, arc)
                except (OSError, ValueError) as e:
                    self.stderr.write(self.style.WARNING(f"  skip {arc}: {e}"))

        # Friendly summary.
        size_mb = out_path.stat().st_size / 1024 / 1024
        self.stdout.write(self.style.SUCCESS(
            f"Backup complete: {out_path} ({size_mb:.1f} MB, "
            f"{len(media_files)} media file{'s' if len(media_files) != 1 else ''}, "
            f"DB {len(db_bytes) / 1024:.1f} KB)"
        ))
        if not include_media:
            self.stdout.write(self.style.WARNING("⚠ Media skipped (--no-media). Restore will be missing uploaded files."))
        if not media_root.exists():
            raise CommandError(f"MEDIA_ROOT does not exist: {media_root}")
