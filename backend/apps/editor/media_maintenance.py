"""Orphan scan for ``MEDIA_ROOT`` (uploads / slides / derived).

Mirror of ``apps.exporter.maintenance.cleanup_exports`` for user media. A file
is an orphan when no ``Attachment.file`` / ``SlideImage.image|thumbnail`` /
``DerivedFile.file`` row names it — rows of *trashed* documents still count
(soft-deleted docs keep their rows, so their files are never orphans until
the purge). ``avatars/`` is never scanned.

Default is report-only; deletion needs an explicit ``apply=True``. Files
younger than ``min_age_hours`` are skipped — a conversion task may have
written them a moment ago and not committed its rows yet.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.utils import timezone

from apps.editor.models import Attachment, DerivedFile, SlideImage

log = logging.getLogger(__name__)

MEDIA_ROOTS = ("uploads", "slides", "derived")
_BODY_MEDIA_RE = re.compile(r"/media/([^\s)\"'<>]+)")


def body_referenced_names() -> set[str]:
    """``/media/<rel>`` paths mentioned in any document body (live or
    trashed). Editor image uploads are referenced by Markdown only, so a
    row-based scan alone would call them orphans."""
    from apps.knowledge.models import Document

    names: set[str] = set()
    for raw, pub in Document.all_objects.values_list("raw_content", "published_content").iterator(chunk_size=200):
        for body in (raw, pub):
            if body and "/media/" in body:
                names.update(_BODY_MEDIA_RE.findall(body))
    return names


def known_media_names() -> set[str]:
    names: set[str] = set()
    names.update(n for n in Attachment.objects.exclude(file="").values_list("file", flat=True) if n)
    for image, thumb in SlideImage.objects.values_list("image", "thumbnail"):
        if image:
            names.add(image)
        if thumb:
            names.add(thumb)
    names.update(n for n in DerivedFile.objects.exclude(file="").values_list("file", flat=True) if n)
    names.update(body_referenced_names())
    return names


def orphan_attachment_rows(*, min_age_days: int = 7):
    """``Attachment`` rows with no document whose file no body references —
    left behind by the old purge (``on_delete=SET_NULL``) or by uploads that
    never got attached. Only rows older than ``min_age_days`` qualify (a fresh
    editor upload legitimately has no document yet)."""
    cutoff = timezone.now() - timedelta(days=min_age_days)
    referenced = body_referenced_names()
    return [
        att
        for att in Attachment.objects.filter(document__isnull=True, created_at__lt=cutoff)
        if (att.file.name or "") not in referenced
    ]


def cleanup_media(
    *,
    roots=MEDIA_ROOTS,
    min_age_hours: int = 24,
    apply: bool = False,
    limit_examples: int = 20,
    row_min_age_days: int = 7,
) -> dict:
    """Scan for orphan files and orphan attachment rows. Returns
    ``{scanned, orphans, orphan_bytes, deleted, examples, orphan_rows, deleted_rows}``."""
    media_root = Path(settings.MEDIA_ROOT).resolve()
    stats = {
        "scanned": 0, "orphans": 0, "orphan_bytes": 0, "deleted": 0, "examples": [],
        "orphan_rows": 0, "deleted_rows": 0,
    }
    # Rows first: an orphan row's file is "known" until the row goes.
    rows = orphan_attachment_rows(min_age_days=row_min_age_days)
    stats["orphan_rows"] = len(rows)
    if apply:
        for att in rows:
            try:
                if att.file:
                    att.file.delete(save=False)
            except Exception:  # noqa: BLE001
                log.warning("cleanup_media: could not delete %s", att.file.name)
            att.delete()
            stats["deleted_rows"] += 1
    known = known_media_names()
    cutoff = time.time() - min_age_hours * 3600
    for root in roots:
        base = media_root / root
        if not base.is_dir():
            continue
        for entry in base.rglob("*"):
            if not entry.is_file():
                continue
            stats["scanned"] += 1
            rel = entry.relative_to(media_root).as_posix()
            if rel in known:
                continue
            try:
                st = entry.stat()
            except OSError:
                continue
            if st.st_mtime > cutoff:
                continue  # too fresh — may belong to an in-flight conversion
            stats["orphans"] += 1
            stats["orphan_bytes"] += st.st_size
            if len(stats["examples"]) < limit_examples:
                stats["examples"].append(rel)
            if apply:
                try:
                    entry.unlink()
                    stats["deleted"] += 1
                except OSError:
                    log.warning("cleanup_media: could not unlink %s", entry)
    return stats
