"""Phase I 回归：broker 不可达时的内联 fallback 按格式分流。

- 轻量格式（md/html/docx）：仍内联执行，任务完成。
- 重格式（pdf/site）：不在请求线程同步跑 Playwright，直接标记 failed + 提示。
"""
from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.exporter.models import ExportTask
from apps.exporter.tests.conftest import make_doc

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


def _broker_down(monkeypatch):
    """Make run_export.delay raise (broker unreachable) at the views call site."""
    from apps.exporter import views

    def boom(*a, **k):
        raise RuntimeError("broker down")

    monkeypatch.setattr(views.run_export, "delay", boom)


def test_pdf_fails_fast_when_broker_down(owner, kb, api_client, monkeypatch):
    _broker_down(monkeypatch)
    doc = make_doc(kb, "p", published="# T\n\nB")
    api_client.force_login(user=owner)
    resp = api_client.post(
        reverse("api_v1:export-list"),
        {"scope": "doc", "target_id": doc.id, "format": "pdf"},
        format="json",
    )
    assert resp.status_code == 201
    task = ExportTask.objects.get(pk=resp.data["id"])
    assert task.status == ExportTask.STATUS_FAILED
    assert "暂不可用" in task.error


def test_site_fails_fast_when_broker_down(owner, kb, api_client, monkeypatch):
    _broker_down(monkeypatch)
    doc = make_doc(kb, "s", published="# T\n\nB")
    api_client.force_login(user=owner)
    resp = api_client.post(
        reverse("api_v1:export-list"),
        {"scope": "doc", "target_id": doc.id, "format": "site"},
        format="json",
    )
    task = ExportTask.objects.get(pk=resp.data["id"])
    assert task.status == ExportTask.STATUS_FAILED


def test_md_still_inlines_when_broker_down(owner, kb, api_client, monkeypatch, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    _broker_down(monkeypatch)
    doc = make_doc(kb, "m", published="# T\n\nBody")
    api_client.force_login(user=owner)
    resp = api_client.post(
        reverse("api_v1:export-list"),
        {"scope": "doc", "target_id": doc.id, "format": "md"},
        format="json",
    )
    task = ExportTask.objects.get(pk=resp.data["id"])
    # Lightweight format ran inline to completion despite the dead broker.
    assert task.status == ExportTask.STATUS_DONE
