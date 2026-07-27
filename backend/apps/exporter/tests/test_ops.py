"""运维批回归：任务去重复用 / 创建限流 / TTL·僵尸·孤儿三段清理。"""
from __future__ import annotations

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.exporter.maintenance import ZOMBIE_ERROR, cleanup_exports
from apps.exporter.models import ExportTask
from apps.exporter.services.common import export_root
from apps.exporter.tests.conftest import make_doc

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


def _create(api_client, doc, fmt="md"):
    return api_client.post(
        reverse("api_v1:export-list"),
        {"scope": "doc", "target_id": doc.id, "format": fmt},
        format="json",
    )


def test_duplicate_pending_task_reused(owner, kb, api_client, monkeypatch):
    # 阻断派发，任务停在 pending，模拟排队场景
    monkeypatch.setattr(
        "apps.exporter.views.run_export",
        type("T", (), {"delay": staticmethod(lambda _id: None)}),
    )
    doc = make_doc(kb, "d", published="body")
    api_client.force_login(user=owner)
    first = _create(api_client, doc)
    assert first.status_code == 201
    second = _create(api_client, doc)
    assert second.status_code == 200  # 复用而非新建
    assert second.data["id"] == first.data["id"]
    assert ExportTask.objects.count() == 1
    # 换格式不去重
    third = _create(api_client, doc, fmt="html")
    assert third.status_code == 201


def test_create_throttled(owner, kb, api_client, monkeypatch):
    from django.core.cache import cache
    from rest_framework.throttling import ScopedRateThrottle

    cache.clear()
    # DRF 的 THROTTLE_RATES 是类属性、import 时绑定，settings 覆盖不可达
    monkeypatch.setattr(
        ScopedRateThrottle, "THROTTLE_RATES", {"export_create": "2/min"}
    )
    monkeypatch.setattr(
        "apps.exporter.views.run_export",
        type("T", (), {"delay": staticmethod(lambda _id: None)}),
    )
    docs = [make_doc(kb, f"d{i}", published="body") for i in range(3)]
    api_client.force_login(user=owner)
    assert _create(api_client, docs[0]).status_code == 201
    assert _create(api_client, docs[1]).status_code == 201
    assert _create(api_client, docs[2]).status_code == 429
    cache.clear()


def _make_task(owner, *, status, age_days=0, with_file=False):
    task = ExportTask.objects.create(
        owner=owner, scope="doc", target_id=1, format="md", status=status
    )
    if with_file:
        path = export_root() / f"t{task.id}.md"
        path.write_text("x")
        task.file_path = str(path)
        task.save(update_fields=["file_path"])
    if age_days:
        ExportTask.objects.filter(pk=task.pk).update(
            created_at=timezone.now() - timedelta(days=age_days)
        )
    return ExportTask.objects.get(pk=task.pk)


def test_cleanup_expired_removes_row_and_file(owner):
    task = _make_task(owner, status=ExportTask.STATUS_DONE, age_days=10, with_file=True)
    path = task.absolute_file_path
    fresh = _make_task(owner, status=ExportTask.STATUS_DONE, with_file=True)
    stats = cleanup_exports(ttl_days=7, remove_orphans=False)
    assert stats["expired"] == 1
    assert not ExportTask.objects.filter(pk=task.pk).exists()
    assert not path.exists()
    assert ExportTask.objects.filter(pk=fresh.pk).exists()


def test_cleanup_marks_zombies_failed(owner):
    stale = _make_task(owner, status=ExportTask.STATUS_RUNNING, age_days=1)
    fresh = _make_task(owner, status=ExportTask.STATUS_RUNNING)
    stats = cleanup_exports(ttl_days=0, stale_hours=2, remove_orphans=False)
    assert stats["zombies"] == 1
    stale.refresh_from_db()
    assert stale.status == ExportTask.STATUS_FAILED
    assert stale.error == ZOMBIE_ERROR
    fresh.refresh_from_db()
    assert fresh.status == ExportTask.STATUS_RUNNING


def test_cleanup_orphan_files_swept_but_referenced_kept(owner):
    import os
    import time

    referenced = _make_task(owner, status=ExportTask.STATUS_DONE, with_file=True)
    orphan = export_root() / "orphan.zip"
    orphan.write_bytes(b"junk")
    old = time.time() - 2 * 24 * 3600
    os.utime(orphan, (old, old))
    os.utime(referenced.absolute_file_path, (old, old))
    # backups/ 子目录永不触碰
    backups = export_root() / "backups"
    backups.mkdir()
    keep = backups / "full.zip"
    keep.write_bytes(b"backup")
    stats = cleanup_exports(ttl_days=0, remove_orphans=True, orphan_min_age_hours=24)
    assert stats["orphans"] == 1
    assert not orphan.exists()
    assert referenced.absolute_file_path.exists()
    assert keep.exists()


def test_cleanup_dry_run_touches_nothing(owner):
    task = _make_task(owner, status=ExportTask.STATUS_DONE, age_days=10, with_file=True)
    stats = cleanup_exports(ttl_days=7, remove_orphans=False, dry_run=True)
    assert stats["expired"] == 1
    assert ExportTask.objects.filter(pk=task.pk).exists()
    assert task.absolute_file_path.exists()


def test_management_command_runs(owner, capsys=None):
    from django.core.management import call_command

    _make_task(owner, status=ExportTask.STATUS_DONE, age_days=10, with_file=True)
    call_command("cleanup_exports", "--no-orphans")
    assert not ExportTask.objects.filter(status=ExportTask.STATUS_DONE).exists()


def test_only_published_end_to_end(owner, kb, api_client, monkeypatch):
    """only_published=true 的 md 导出只含已发布文档。"""
    from apps.exporter.tasks import run_export

    monkeypatch.setattr(
        "apps.exporter.views.run_export",
        type("T", (), {"delay": staticmethod(lambda _id: None)}),
    )
    make_doc(kb, "pub", published="PUBLISHED BODY", status="published")
    make_doc(kb, "draft", raw="DRAFT BODY", status="draft")
    api_client.force_login(user=owner)
    resp = api_client.post(
        reverse("api_v1:export-list"),
        {"scope": "kb", "target_id": kb.id, "format": "md", "only_published": True},
        format="json",
    )
    assert resp.status_code == 201
    task = ExportTask.objects.get(pk=resp.data["id"])
    assert task.selection.get("only_published") is True
    run_export(task.id)
    task.refresh_from_db()
    assert task.status == ExportTask.STATUS_DONE
    import zipfile
    from io import BytesIO
    from pathlib import Path

    raw = Path(task.file_path).read_bytes()
    if task.filename.endswith(".zip"):
        with zipfile.ZipFile(BytesIO(raw)) as zf:
            text = "".join(
                zf.read(n).decode() for n in zf.namelist() if n.endswith(".md")
            )
    else:
        # 过滤后只剩 1 篇 → 单篇分支输出裸 .md
        text = raw.decode()
    assert "PUBLISHED BODY" in text
    assert "DRAFT BODY" not in text
