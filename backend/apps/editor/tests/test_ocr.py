"""Batch 13: OCR of scanned PDFs (ocrmypdf mocked — the binary is a runtime
dependency of the worker, not of the test suite)."""

from __future__ import annotations

import io
import subprocess
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management import call_command
from PIL import Image

from apps.editor import tasks as editor_tasks
from apps.editor.models import Attachment, ConversionJob, DerivedFile, DocumentExtract
from apps.editor.services import ocr as ocr_service
from apps.editor.services.derived import ocr_status
from apps.knowledge.models import Document, KnowledgeBase

from .test_text_extract import _pdf_with_text


def _image_pdf(pages: int = 1) -> bytes:
    """Image-only PDF (what a scanner produces): no text objects at all."""
    imgs = [Image.new("RGB", (300, 200), "white") for _ in range(pages)]
    buf = io.BytesIO()
    imgs[0].save(buf, "PDF", save_all=True, append_images=imgs[1:])
    return buf.getvalue()


@pytest.fixture
def pdf_doc(db):
    user = get_user_model().objects.create_user("ocrauthor", "o@e.com", "pw", is_staff=True)
    kb = KnowledgeBase.objects.create(owner=user, name="OCR", slug="ocr-kb", visibility="public")

    def make(data: bytes, name: str = "scan.pdf") -> Document:
        doc = Document.objects.create(knowledge_base=kb, title=name, status="published", visibility="public")
        Attachment.objects.create(
            document=doc,
            kind=Attachment.KIND_DOCUMENT,
            original_filename=name,
            file=ContentFile(data, name=name),
            uploaded_by=user,
            size=len(data),
        )
        return doc

    return make


@pytest.fixture
def fake_ocr(monkeypatch):
    """Replace the ocrmypdf subprocess with one that writes a text PDF."""
    calls: list[list[str]] = []

    def run(cmd, **kwargs):
        calls.append(list(cmd))
        Path(cmd[-1]).write_bytes(_pdf_with_text("OCR HELLO WORLD recognised from the scanned page image"))
        return subprocess.CompletedProcess(cmd, 0, "", "")

    monkeypatch.setattr(ocr_service, "_exec", run)
    monkeypatch.setattr(ocr_service, "ocr_binary", lambda: "/fake/ocrmypdf")
    return calls


def test_ocr_task_stores_copy_and_reextracts(pdf_doc, fake_ocr, settings):
    settings.OCR_LANGS = "chi_sim+eng"
    doc = pdf_doc(_image_pdf())
    res = editor_tasks.ocr_pdf(doc.id)
    assert res["status"] == "done" and res["partial"] is False
    row = DerivedFile.objects.get(document=doc, kind="ocr_pdf")
    assert row.file and row.page_count == 1 and row.size > 0 and row.meta["langs"] == "chi_sim+eng"
    job = ConversionJob.objects.get(document=doc, kind="ocr")
    assert job.status == "done" and job.pages == 1
    ext = DocumentExtract.objects.get(document=doc)
    assert ext.source == "ocr_pdf" and "OCR HELLO WORLD" in ext.text and not ext.is_scanned
    cmd = fake_ocr[0]
    assert "--skip-text" in cmd and cmd[cmd.index("-l") + 1] == "chi_sim+eng" and "--pages" not in cmd
    assert ocr_status(doc) == "done"
    # Idempotent: an existing copy short-circuits.
    assert editor_tasks.ocr_pdf(doc.id)["reason"] == "exists"
    assert len(fake_ocr) == 1
    editor_tasks.ocr_pdf(doc.id, force=True)
    assert len(fake_ocr) == 2 and DerivedFile.objects.filter(document=doc, kind="ocr_pdf").count() == 1


def test_ocr_partial_for_big_books(pdf_doc, fake_ocr):
    doc = pdf_doc(_image_pdf(pages=3))
    res = editor_tasks.ocr_pdf(doc.id, max_pages=2)
    assert res["partial"] is True and res["pages"] == 3
    cmd = fake_ocr[0]
    assert cmd[cmd.index("--pages") + 1] == "1-2"
    row = DerivedFile.objects.get(document=doc, kind="ocr_pdf")
    assert row.meta["partial"] is True and row.meta["ocr_pages"] == 2
    assert ConversionJob.objects.get(document=doc, kind="ocr").pages == 2


def test_ocr_failure_marks_job(pdf_doc, monkeypatch):
    doc = pdf_doc(_image_pdf())
    monkeypatch.setattr(ocr_service, "ocr_binary", lambda: "/fake/ocrmypdf")

    def boom(cmd, **kwargs):
        raise subprocess.CalledProcessError(2, cmd, stderr="tesseract exploded")

    monkeypatch.setattr(ocr_service, "_exec", boom)
    with pytest.raises(subprocess.CalledProcessError):
        editor_tasks.ocr_pdf(doc.id)
    job = ConversionJob.objects.get(document=doc, kind="ocr")
    assert job.status == "failed" and job.error
    assert not DerivedFile.objects.filter(document=doc, kind="ocr_pdf").exists()
    # The extract still says scanned → status reflects the failed job.
    editor_tasks.extract_document_text(doc.id)
    assert ocr_status(doc) == "failed"


def test_ocr_skips_without_binary_and_non_pdf(pdf_doc, monkeypatch):
    doc = pdf_doc(_image_pdf())
    monkeypatch.setattr(ocr_service, "ocr_binary", lambda: None)
    assert editor_tasks.ocr_pdf(doc.id)["reason"] == "no_binary"
    assert ConversionJob.objects.get(document=doc, kind="ocr").status == "failed"
    other = pdf_doc(b"not a pdf", name="notes.md")
    assert editor_tasks.ocr_pdf(other.id)["reason"] == "not_pdf"


def test_extract_auto_queues_ocr_for_scanned_only(pdf_doc, monkeypatch, settings):
    queued: list[tuple] = []
    monkeypatch.setattr(editor_tasks, "queue_ocr", lambda doc_id, pages=0, **kw: queued.append((doc_id, pages)) or True)
    settings.OCR_AUTO = True
    scanned = pdf_doc(_image_pdf(pages=2))
    editor_tasks.extract_document_text(scanned.id)
    assert queued == [(scanned.id, 2)]
    assert ocr_status(scanned) == "scanned"
    text = pdf_doc(_pdf_with_text("real text here for the index"), name="text.pdf")
    editor_tasks.extract_document_text(text.id)
    assert queued == [(scanned.id, 2)]
    assert ocr_status(text) == ""
    settings.OCR_AUTO = False
    editor_tasks.extract_document_text(scanned.id)
    assert len(queued) == 1


def test_queue_ocr_sizes_time_limit(monkeypatch, settings):
    settings.OCR_ENABLED = True
    settings.OCR_SECONDS_PER_PAGE = 20
    settings.OCR_MAX_SECONDS = 4 * 3600
    seen = {}
    monkeypatch.setattr(editor_tasks.ocr_pdf, "apply_async", lambda **kw: seen.update(kw))
    assert editor_tasks.queue_ocr(7, 30, max_pages=10) is True
    assert seen["soft_time_limit"] == 600 and seen["time_limit"] == 720 and seen["kwargs"]["max_pages"] == 10
    assert ocr_service.ocr_time_limit(1) == 120 and ocr_service.ocr_time_limit(10_000) == 4 * 3600
    settings.OCR_ENABLED = False
    assert editor_tasks.queue_ocr(7, 30) is False


def test_backfill_ocr_selects_scanned_without_copy(pdf_doc, fake_ocr, settings, capsys):
    a = pdf_doc(_image_pdf())
    b = pdf_doc(_image_pdf(), name="done.pdf")
    c = pdf_doc(_pdf_with_text("text pdf"), name="text.pdf")
    for d in (a, b, c):
        DocumentExtract.objects.update_or_create(document=d, defaults={"is_scanned": d is not c, "page_count": 1, "source": "pdf"})
    DerivedFile.objects.create(document=b, kind="ocr_pdf", file=ContentFile(b"%PDF", name="b.pdf"))
    call_command("backfill_ocr", "--all", "--dry-run")
    out = capsys.readouterr().out
    assert f"id={a.id}" in out and f"id={b.id}" not in out and f"id={c.id}" not in out
    call_command("backfill_ocr", "--ids", str(a.id), "--inline")
    assert DerivedFile.objects.filter(document=a, kind="ocr_pdf").exists()
    call_command("backfill_ocr", "--all", "--force", "--dry-run")
    assert f"id={b.id}" in capsys.readouterr().out


def test_ocr_fields_in_serializers(pdf_doc, fake_ocr):
    from django.test import RequestFactory
    from rest_framework.test import APIClient

    doc = pdf_doc(_image_pdf())
    editor_tasks.extract_document_text(doc.id)
    user = get_user_model().objects.get(username="ocrauthor")
    c = APIClient()
    c.force_authenticate(user)
    r = c.get(f"/api/v1/documents/{doc.id}/", HTTP_HOST="localhost")
    assert r.status_code == 200 and r.data["ocr_status"] == "scanned" and r.data["reader_pdf_url"] == ""
    editor_tasks.ocr_pdf(doc.id)
    r = c.get(f"/api/v1/documents/{doc.id}/", HTTP_HOST="localhost")
    assert r.data["ocr_status"] == "done" and r.data["reader_pdf_url"].endswith(".pdf") and "/derived/" in r.data["reader_pdf_url"]
    r = c.get(f"/api/v1/public/posts/{doc.slug}/", HTTP_HOST="localhost")
    assert r.status_code == 200 and r.data["reader_pdf_url"] == DerivedFile.objects.get(document=doc, kind="ocr_pdf").url
