"""Retention & hygiene for export artifacts.

Shared by the ``cleanup_exports`` management command and the daily
``exporter.cleanup_exports`` beat task. Three sweeps:

1. **expired** — done/failed tasks older than the TTL: file + row removed.
2. **zombies** — pending/running tasks whose worker died (no acks_late, so a
   killed worker strands the row forever): marked failed so the frontend
   stops polling them.
3. **orphans** — files in ``exports/`` no ExportTask references (crashed
   exports, deleted rows, historical test pollution): removed once older
   than a safety margin. ``backups/`` (backup_archive output) is never touched.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import ExportTask
from .services.common import export_root

log = logging.getLogger(__name__)

ZOMBIE_ERROR = "任务执行中断（worker 重启或超时未恢复），已自动标记失败，请重新导出。"


def cleanup_exports(
    *,
    ttl_days: int | None = None,
    stale_hours: int = 2,
    remove_orphans: bool = True,
    orphan_min_age_hours: int = 24,
    dry_run: bool = False,
) -> dict[str, int]:
    now = timezone.now()
    stats = {"expired": 0, "zombies": 0, "orphans": 0}
    if ttl_days is None:
        ttl_days = int(getattr(settings, "EXPORT_TTL_DAYS", 7))

    # 1. Expired finished tasks (TTL 0 = keep forever).
    if ttl_days > 0:
        expired = ExportTask.objects.filter(
            status__in=[ExportTask.STATUS_DONE, ExportTask.STATUS_FAILED],
            created_at__lt=now - timedelta(days=ttl_days),
        )
        for task in expired:
            path = task.absolute_file_path
            if not dry_run:
                if path and path.exists():
                    try:
                        path.unlink()
                    except OSError:
                        log.warning("cleanup: could not unlink %s", path)
                task.delete()
            stats["expired"] += 1

    # 2. Zombie pending/running rows.
    zombies = ExportTask.objects.filter(
        status__in=[ExportTask.STATUS_PENDING, ExportTask.STATUS_RUNNING],
        created_at__lt=now - timedelta(hours=stale_hours),
    )
    for task in zombies:
        if not dry_run:
            task.status = ExportTask.STATUS_FAILED
            task.error = ZOMBIE_ERROR
            task.completed_at = now
            task.save(update_fields=["status", "error", "completed_at"])
        stats["zombies"] += 1

    # 3. Orphan files on disk.
    if remove_orphans:
        known = {
            str(p)
            for p in ExportTask.objects.exclude(file_path="").values_list(
                "file_path", flat=True
            )
        }
        cutoff_ts = (now - timedelta(hours=orphan_min_age_hours)).timestamp()
        root = export_root()
        for entry in root.iterdir():
            if not entry.is_file():  # skips backups/ and any other subdir
                continue
            if str(entry) in known:
                continue
            try:
                if entry.stat().st_mtime > cutoff_ts:
                    continue  # too fresh — may belong to an in-flight export
                if not dry_run:
                    entry.unlink()
                stats["orphans"] += 1
            except OSError:
                log.warning("cleanup: could not inspect/unlink %s", entry)

    log.info("exporter.cleanup%s: %s", " (dry-run)" if dry_run else "", stats)
    return stats
