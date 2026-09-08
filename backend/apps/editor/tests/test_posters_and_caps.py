"""Batch 10: PDF posters / EPUB covers, card payloads (poster_url, page_count),
per-type upload caps, DATA_UPLOAD_MAX_MEMORY_SIZE sanity."""
from __future__ import annotations

import io
import zipfile
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework.test import APIClient

from apps.editor import tasks as editor_tasks
from apps.editor.models import Attachment, DerivedFile
from apps.editor.services.posters import extract_epub_cover, make_pdf_poster
from apps.editor.tests.test_text_extract import _pdf_with_text
from apps.editor.views import max_upload_size_for
from apps.knowledge.models import Document, KnowledgeBase

User = get_user_model()


def _jpeg(size=(30, 40)) -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", size, (200, 40, 40)).save(buf, format="JPEG")
    return buf.getvalue()


def _epub_with_cover(cover_bytes: bytes, via: str = "properties") -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("mimetype", "application/epub+zip")
        z.writestr("META-INF/container.xml", '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>')
        if via == "properties":
            manifest = '<item id="c" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>'
            meta = ""
        else:
            manifest = '<item id="cov" href="images/cover.jpg" media-type="image/jpeg"/>'
            meta = '<meta name="cover" content="cov"/>'
        z.writestr("OEBPS/content.opf", f"<package><metadata>{meta}</metadata><manifest>{manifest}<item id='t' href='t.xhtml' media-type='application/xhtml+xml'/></manifest></package>")
        z.writestr("OEBPS/images/cover.jpg", cover_bytes)
        z.writestr("OEBPS/t.xhtml", "<html><body><p>hi</p></body></html>")
    return buf.getvalue()


def test_make_pdf_poster_renders_page_one(tmp_path):
    p = tmp_path / "a.pdf"
    p.write_bytes(_pdf_with_text("Poster"))
    out = make_pdf_poster(p, tmp_path)
    assert out is not None
    path, w, h = out
    assert path.suffix == ".jpg" and w == 480 and h > 0


@pytest.mark.parametrize("via", ["properties", "meta"])
def test_extract_epub_cover_both_manifest_styles(tmp_path, via):
    p = tmp_path / "b.epub"
    p.write_bytes(_epub_with_cover(_jpeg(), via))
    out = extract_epub_cover(p, tmp_path)
    assert out is not None and out[0].suffix == ".jpg" and out[1] == 30 and out[2] == 40


@pytest.fixture
def owner():
    return User.objects.create_user("poowner", "po@e.com", "pass", is_staff=True)


@pytest.fixture
def kb(owner):
    return KnowledgeBase.objects.create(owner=owner, name="PO", slug="po-kb", visibility="public")


def _doc(kb, owner, settings, tmp_path, name, data, mime):
    settings.MEDIA_ROOT = str(tmp_path)
    doc = Document.objects.create(knowledge_base=kb, title=Path(name).stem, status="published", visibility="public")
    att = Attachment.objects.create(
        document=doc, uploaded_by=owner, file=ContentFile(data, name=name), original_filename=name,
        kind=Attachment.KIND_DOCUMENT, mime_type=mime, size=len(data),
    )
    return doc, att


@pytest.mark.django_db
def test_extract_task_stores_poster_and_cover_and_cards_show_them(owner, kb, settings, tmp_path):
    pdf, _ = _doc(kb, owner, settings, tmp_path, "book.pdf", _pdf_with_text("Cover me"), "application/pdf")
    epub, _ = _doc(kb, owner, settings, tmp_path, "novel.epub", _epub_with_cover(_jpeg()), "application/epub+zip")
    editor_tasks.extract_document_text(pdf.id)
    editor_tasks.extract_document_text(epub.id)
    poster = DerivedFile.objects.get(document=pdf, kind="poster")
    assert poster.page_count == 1 and poster.width == 480 and poster.file.name.startswith("derived/")
    cover = DerivedFile.objects.get(document=epub, kind="cover")
    assert cover.width == 30
    client = APIClient()
    settings.SITE_REQUIRE_LOGIN = False
    lst = client.get(reverse("api_v1:public-post-list"))
    rows = {r["slug"]: r for r in lst.data["results"]}
    assert rows["book"]["poster_url"] == poster.url and rows["book"]["page_count"] == 1
    assert rows["novel"]["poster_url"] == cover.url
    detail = client.get(reverse("api_v1:public-post-detail", args=[pdf.slug]))
    assert detail.data["poster_url"] == poster.url and detail.data["page_count"] == 1
    client.force_authenticate(owner)
    prev = client.get(reverse("api_v1:document-preview", args=[pdf.id]))
    assert prev.status_code == 200, prev.content
    assert prev.data["doc_format"] == "pdf" and prev.data["page_count"] == 1 and prev.data["poster_url"] == poster.url
    assert prev.data["excerpt"].startswith("Cover me") and prev.data["size"] > 0 and prev.data["encrypted"] is False
    author_list = client.get(reverse("api_v1:document-list"), {"knowledge_base": kb.id})
    assert any(r.get("poster_url") == poster.url for r in author_list.data["results"] if r["id"] == pdf.id) or any(
        r.get("poster_url") == poster.url for r in (author_list.data if isinstance(author_list.data, list) else author_list.data.get("results", []))
    )


def test_upload_caps_are_per_type(monkeypatch):
    assert max_upload_size_for("a.jpg") == 20 * 1024 * 1024
    assert max_upload_size_for("a.pdf") == 500 * 1024 * 1024
    assert max_upload_size_for("deck.pptx") == 300 * 1024 * 1024
    assert max_upload_size_for("x.zip") == 2048 * 1024 * 1024


@pytest.mark.django_db
def test_upload_rejects_oversized_image(owner, kb, settings, tmp_path, monkeypatch):
    from apps.editor import views as editor_views

    settings.MEDIA_ROOT = str(tmp_path)
    monkeypatch.setitem(editor_views.MAX_UPLOAD_SIZE_BY_EXT, ".png", 10)
    client = APIClient()
    client.force_authenticate(owner)
    f = SimpleUploadedFile("big.png", b"x" * 11, content_type="image/png")
    resp = client.post(reverse("api_v1:upload"), {"file": f}, format="multipart")
    assert resp.status_code == 413 and ".png" in resp.data["detail"]


@pytest.mark.django_db
def test_data_upload_memory_size_only_caps_form_fields(owner, settings):
    """A 10 MB form-field budget rejects a field-only flood but leaves file
    uploads (excluded by Django from the check) alone."""
    from django.core.exceptions import RequestDataTooBig
    from django.test import RequestFactory

    assert settings.DATA_UPLOAD_MAX_MEMORY_SIZE == 10 * 1024 * 1024
    rf = RequestFactory()
    big = {"paths": "x" * (11 * 1024 * 1024)}
    req = rf.post("/api/v1/imports/batch/", data=big)
    with pytest.raises(RequestDataTooBig):
        _ = req.POST
    small_file = SimpleUploadedFile("f.bin", b"y" * (12 * 1024 * 1024))
    req2 = rf.post("/api/v1/uploads/", data={"file": small_file})
    assert req2.FILES["file"].size == 12 * 1024 * 1024  # file bytes don't count
