"""手动触发导出产物清理（与每日 beat 任务同一实现）。

用法：
    manage.py cleanup_exports                # TTL 过期 + 僵尸任务 + 孤儿文件
    manage.py cleanup_exports --dry-run      # 只报告不删除
    manage.py cleanup_exports --ttl-days 30  # 覆盖保留天数（0 = 不清理过期任务）
"""
from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.exporter.maintenance import cleanup_exports


class Command(BaseCommand):
    help = "Clean up expired export tasks, zombie rows and orphan files under exports/"

    def add_arguments(self, parser):
        parser.add_argument("--ttl-days", type=int, default=None)
        parser.add_argument("--stale-hours", type=int, default=2)
        parser.add_argument("--orphan-min-age-hours", type=int, default=24)
        parser.add_argument("--no-orphans", action="store_true")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        stats = cleanup_exports(
            ttl_days=options["ttl_days"],
            stale_hours=options["stale_hours"],
            remove_orphans=not options["no_orphans"],
            orphan_min_age_hours=options["orphan_min_age_hours"],
            dry_run=options["dry_run"],
        )
        prefix = "[dry-run] " if options["dry_run"] else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"{prefix}expired={stats['expired']} zombies={stats['zombies']} "
                f"orphans={stats['orphans']}"
            )
        )
