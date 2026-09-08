"""Batch 6: index-only text extraction for PDF / PPT deck / EPUB and its
wiring into the search vector + snippet."""
from __future__ import annotations

import io
import zipfile
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management import call_command

from apps.editor import tasks as editor_tasks
from apps.editor.models import Attachment, DerivedFile, DocumentExtract, SlideImage
from apps.editor.services.text_extract import extract_epub, extract_pdf
from apps.knowledge.models import Document, KnowledgeBase
from apps.search.services import collect_search_text

User = get_user_model()
PPTX_CT = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


def _pdf_with_text(text: str) -> bytes:
    """Minimal single-page PDF with a Helvetica text run (readable by pdftotext)."""
    content = f"BT /F1 24 Tf 72 700 Td ({text}) Tj ET".encode("latin-1")
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objs, 1):
        offsets.append(out.tell())
        out.write(f"{i} 0 obj\n".encode() + body + b"\nendobj\n")
    xref = out.tell()
    out.write(f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode())
    for off in offsets:
        out.write(f"{off:010d} 00000 n \n".encode())
    out.write(f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return out.getvalue()


def _blank_pdf() -> bytes:
    return _pdf_with_text("")


def _epub(chapters: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("mimetype", "application/epub+zip")
        for name, body in chapters.items():
            z.writestr(f"OEBPS/{name}", f"<html><head><style>p{{}}</style></head><body>{body}</body></html>")
    return buf.getvalue()


@pytest.fixture
def owner():
    return User.objects.create_user("txowner", "tx@e.com", "pass", is_staff=True)


@pytest.fixture
def kb(owner):
    return KnowledgeBase.objects.create(owner=owner, name="TX", slug="tx-kb", visibility="public")


def _doc(kb, owner, settings, tmp_path, name, data, mime):
    settings.MEDIA_ROOT = str(tmp_path)
    doc = Document.objects.create(knowledge_base=kb, title=Path(name).stem, status="published", visibility="public")
    att = Attachment.objects.create(
        document=doc, uploaded_by=owner, file=ContentFile(data, name=name), original_filename=name,
        kind=Attachment.KIND_DOCUMENT, mime_type=mime, size=len(data),
    )
    return doc, att


def test_extract_pdf_reads_text_and_page_facts(tmp_path):
    p = tmp_path / "t.pdf"
    p.write_bytes(_pdf_with_text("Hello searchable world"))
    res = extract_pdf(p)
    assert "Hello searchable world" in res.text
    assert res.page_count == 1 and not res.encrypted and not res.is_scanned and res.source == "pdf"


def test_extract_pdf_flags_scanned_when_no_text(tmp_path):
    p = tmp_path / "s.pdf"
    p.write_bytes(_blank_pdf())
    res = extract_pdf(p)
    assert res.page_count == 1 and res.is_scanned and res.text == ""


def test_extract_epub_strips_tags(tmp_path):
    p = tmp_path / "b.epub"
    p.write_bytes(_epub({"c1.xhtml": "<h1>Chapter One</h1><p>Alpha &amp; beta</p>", "c2.xhtml": "<p>Gamma</p>"}))
    res = extract_epub(p)
    assert "Chapter One" in res.text and "Alpha & beta" in res.text and "Gamma" in res.text
    assert "<p>" not in res.text and res.page_count == 2 and res.source == "epub"


def test_truncation_flag(tmp_path, monkeypatch):
    from apps.editor.services import text_extract

    monkeypatch.setattr(text_extract, "MAX_TEXT_CHARS", 10)
    p = tmp_path / "b.epub"
    p.write_bytes(_epub({"c.xhtml": "<p>" + "x" * 100 + "</p>"}))
    res = extract_epub(p)
    assert res.truncated and len(res.text) == 10


@pytest.mark.django_db
def test_task_populates_extract_and_search_vector(owner, kb, settings, tmp_path):
    doc, _ = _doc(kb, owner, settings, tmp_path, "manual.pdf", _pdf_with_text("Quantum routing handbook"), "application/pdf")
    out = editor_tasks.extract_document_text(doc.id)
    assert out["source"] == "pdf" and out["chars"] > 0 and not out["is_scanned"]
    ex = DocumentExtract.objects.get(document=doc)
    assert "Quantum routing handbook" in ex.text and ex.page_count == 1
    doc = Document.objects.select_related("extract").get(pk=doc.id)
    assert "Quantum routing handbook" in collect_search_text(doc)
    assert doc.search_vector is not None  # re-indexed inline by the task
    # Re-running is idempotent (update, not duplicate).
    editor_tasks.extract_document_text(doc.id)
    assert DocumentExtract.objects.filter(document=doc).count() == 1


@pytest.mark.django_db
def test_pptx_uses_deck_pdf_and_notes_enter_index(owner, kb, settings, tmp_path):
    doc, att = _doc(kb, owner, settings, tmp_path, "deck.pptx", b"PK", PPTX_CT)
    DerivedFile.objects.create(document=doc, source=att, kind="deck_pdf",
                               file=ContentFile(_pdf_with_text("Slide body text"), name="deck.pdf"))
    SlideImage.objects.create(document=doc, source=att, index=0, width=1, height=1, notes="Speaker secret",
                              image=ContentFile(b"x", name="s.jpg"))
    out = editor_tasks.extract_document_text(doc.id)
    assert out["source"] == "deck_pdf"
    doc = Document.objects.select_related("extract").get(pk=doc.id)
    blob = collect_search_text(doc)
    assert "Slide body text" in blob and "Speaker secret" in blob


@pytest.mark.django_db
def test_scanned_pdf_gets_row_and_is_not_reextracted_by_backfill(owner, kb, settings, tmp_path, capsys):
    doc, _ = _doc(kb, owner, settings, tmp_path, "scan.pdf", _blank_pdf(), "application/pdf")
    call_command("backfill_document_text", "--all")
    ex = DocumentExtract.objects.get(document=doc)
    assert ex.is_scanned and ex.text == ""
    out = capsys.readouterr().out
    assert "[scanned]" in out and "1 document(s)" in out
    call_command("backfill_document_text", "--all")
    assert "0 document(s)" in capsys.readouterr().out


@pytest.mark.django_db
def test_search_endpoint_finds_pdf_text_and_snippets_it(owner, kb, settings, tmp_path):
    from django.urls import reverse
    from rest_framework.test import APIClient

    doc, _ = _doc(kb, owner, settings, tmp_path, "guide.pdf", _pdf_with_text("Zebrafish migration atlas"), "application/pdf")
    editor_tasks.extract_document_text(doc.id)
    client = APIClient()
    client.force_authenticate(owner)
    resp = client.get(reverse("api_v1:search"), {"q": "Zebrafish"})
    assert resp.status_code == 200, resp.content
    hits = resp.data["results"] if isinstance(resp.data, dict) and "results" in resp.data else resp.data
    ids = [h["id"] for h in hits]
    assert doc.id in ids
    hit = next(h for h in hits if h["id"] == doc.id)
    assert "Zebrafish" in (hit.get("snippet") or hit.get("excerpt") or "")
