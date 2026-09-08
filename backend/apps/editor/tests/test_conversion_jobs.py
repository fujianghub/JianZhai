"""Batch 4: conversion bookkeeping (ConversionJob), stuck-pending sweep,
manual re-convert endpoint, retry gating."""
from __future__ import annotations

import subprocess
from datetime import timedelta
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.editor import tasks as pptx_tasks
from apps.editor.models import Attachment, ConversionJob, DerivedFile, SlideImage
from apps.knowledge.models import Document, KnowledgeBase

User = get_user_model()
PPTX_CT = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


@pytest.fixture
def owner():
    return User.objects.create_user("cjowner", "cj@e.com", "pass", is_staff=True)


@pytest.fixture
def kb(owner):
    return KnowledgeBase.objects.create(owner=owner, name="CJ", slug="cj-kb", visibility="public")


def _deck(kb, owner, settings, tmp_path, status=""):
    settings.MEDIA_ROOT = str(tmp_path)
    doc = Document.objects.create(knowledge_base=kb, title="Deck", status="published", slide_status=status)
    att = Attachment.objects.create(
        document=doc, uploaded_by=owner, file=ContentFile(b"PK fake", name="deck.pptx"),
        original_filename="deck.pptx", kind=Attachment.KIND_DOCUMENT, mime_type=PPTX_CT, size=7,
    )
    return doc, att


def _fake_convert(pages: int):
    def fake(pptx_path, workdir):
        from PIL import Image

        (Path(workdir) / "deck.pdf").write_bytes(b"%PDF-1.4 x")
        out = []
        for i in range(1, pages + 1):
            p = Path(workdir) / f"slide-{i}.png"
            Image.new("RGB", (30, 20), (1, 2, 3)).save(p, format="PNG")
            out.append(p)
        return out

    return fake


@pytest.mark.django_db
def test_successful_conversion_records_a_done_job(owner, kb, settings, tmp_path, monkeypatch):
    doc, att = _deck(kb, owner, settings, tmp_path)
    monkeypatch.setattr(pptx_tasks, "_convert", _fake_convert(2))
    assert pptx_tasks.convert_pptx_to_slides(doc.id, att.id) == 2
    job = ConversionJob.objects.get(document=doc, kind="pptx_slides")
    assert job.status == "done" and job.pages == 2 and job.src_bytes == 7 and job.out_bytes > 0
    assert job.finished_at is not None and job.duration_ms >= 0


@pytest.mark.django_db
def test_failed_conversion_records_a_failed_job(owner, kb, settings, tmp_path, monkeypatch):
    doc, att = _deck(kb, owner, settings, tmp_path)

    def no_pdf(*a):
        raise RuntimeError("LibreOffice produced no PDF: Error: source file could not be loaded")

    monkeypatch.setattr(pptx_tasks, "_convert", no_pdf)
    assert pptx_tasks.convert_pptx_to_slides(doc.id, att.id) == 0
    job = ConversionJob.objects.get(document=doc)
    assert job.status == "failed" and "损坏" in job.error
    doc.refresh_from_db()
    assert doc.slide_status == "failed"


@pytest.mark.django_db
def test_direct_call_never_retries_but_worker_would(owner, kb, settings, tmp_path, monkeypatch):
    doc, att = _deck(kb, owner, settings, tmp_path)

    def timeout(*a):
        raise subprocess.TimeoutExpired(cmd="soffice", timeout=180)

    monkeypatch.setattr(pptx_tasks, "_convert", timeout)
    # Direct call (tests / management commands): synchronous failure, no retry.
    assert pptx_tasks.convert_pptx_to_slides(doc.id, att.id) == 0
    doc.refresh_from_db()
    assert doc.slide_status == "failed" and "超时" in doc.slide_error

    class Req:
        called_directly = False
        retries = 0
        id = "abc"

    class FakeTask:
        request = Req()

    assert pptx_tasks._should_retry(FakeTask(), subprocess.TimeoutExpired("soffice", 1)) is True
    assert pptx_tasks._should_retry(FakeTask(), FileNotFoundError("soffice")) is False
    assert pptx_tasks._should_retry(FakeTask(), RuntimeError("corrupt")) is False
    Req.retries = 2
    assert pptx_tasks._should_retry(FakeTask(), subprocess.TimeoutExpired("soffice", 1)) is False


@pytest.mark.django_db
def test_on_failure_marks_document_failed_and_closes_job(owner, kb, settings, tmp_path):
    doc, att = _deck(kb, owner, settings, tmp_path, status="pending")
    job = ConversionJob.objects.create(document=doc, kind="pptx_slides")
    from celery.exceptions import SoftTimeLimitExceeded

    pptx_tasks.convert_pptx_to_slides.on_failure(SoftTimeLimitExceeded(), "tid", (doc.id, att.id), {}, None)
    doc.refresh_from_db()
    job.refresh_from_db()
    assert doc.slide_status == "failed" and doc.slide_error
    assert job.status == "failed"


@pytest.mark.django_db
def test_sweep_marks_stale_pending_without_running_job(owner, kb, settings, tmp_path):
    stale, _ = _deck(kb, owner, settings, tmp_path, status="pending")
    Document.all_objects.filter(pk=stale.pk).update(updated_at=timezone.now() - timedelta(hours=1))
    active, _ = _deck(kb, owner, settings, tmp_path, status="pending")
    Document.all_objects.filter(pk=active.pk).update(updated_at=timezone.now() - timedelta(hours=1))
    ConversionJob.objects.create(document=active, kind="pptx_slides")  # running, recent
    fresh, _ = _deck(kb, owner, settings, tmp_path, status="pending")
    assert pptx_tasks.sweep_stuck_conversions() == 1
    stale.refresh_from_db(); active.refresh_from_db(); fresh.refresh_from_db()
    assert stale.slide_status == "failed" and "重新转换" in stale.slide_error
    assert active.slide_status == "pending" and fresh.slide_status == "pending"


@pytest.mark.django_db
def test_reconvert_endpoint_resets_and_queues(owner, kb, settings, tmp_path, monkeypatch):
    doc, att = _deck(kb, owner, settings, tmp_path, status="failed")
    SlideImage.objects.create(document=doc, source=att, index=0, width=1, height=1,
                              image=ContentFile(b"x", name="s.jpg"))
    DerivedFile.objects.create(document=doc, source=att, kind="deck_pdf", file=ContentFile(b"p", name="d.pdf"))
    queued = []
    monkeypatch.setattr(pptx_tasks.convert_pptx_to_slides, "delay", lambda *a: queued.append(a))
    client = APIClient()
    client.force_authenticate(owner)
    resp = client.post(reverse("api_v1:reconvert-slides", args=[doc.id]))
    assert resp.status_code == 202, resp.content
    assert queued == [(doc.id, att.id)]
    doc.refresh_from_db()
    assert doc.slide_status == "pending" and doc.slide_error == ""
    assert not SlideImage.objects.filter(document=doc).exists()
    assert not DerivedFile.objects.filter(document=doc).exists()
    # Non-pptx docs are rejected; readers can't call it at all.
    text = Document.objects.create(knowledge_base=kb, title="t", raw_content="x")
    assert client.post(reverse("api_v1:reconvert-slides", args=[text.id])).status_code == 400
    reader = User.objects.create_user("cjreader", "r@e.com", "pass")
    client.force_authenticate(reader)
    assert client.post(reverse("api_v1:reconvert-slides", args=[doc.id])).status_code == 403


def test_task_routes_and_queues(settings):
    assert settings.CELERY_TASK_ROUTES["editor.convert_pptx"] == {"queue": "convert"}
    assert settings.CELERY_TASK_ROUTES["exporter.run_export"] == {"queue": "export"}
    assert {q.name for q in settings.CELERY_TASK_QUEUES} == {"celery", "convert", "export", "ocr"}
    assert "editor-sweep-stuck-conversions" in settings.CELERY_BEAT_SCHEDULE
