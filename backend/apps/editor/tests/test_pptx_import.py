"""PPT/PPTX import: format detection, async dispatch, slide conversion, gating."""

from __future__ import annotations

from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework.test import APIClient

from apps.editor import tasks as pptx_tasks
from apps.editor.models import Attachment, SlideImage
from apps.knowledge.models import Document, KnowledgeBase
from apps.knowledge.serializers import detect_doc_format

User = get_user_model()

PPTX_CT = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


def _png_file(path: Path, color=(30, 120, 200), size=(320, 180)) -> Path:
    from PIL import Image

    Image.new("RGB", size, color).save(path, format="PNG")
    return path


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def owner():
    return User.objects.create_user("pptowner", "ppt@e.com", "pass", is_staff=True)


@pytest.fixture
def kb(owner):
    return KnowledgeBase.objects.create(
        owner=owner, name="PPT KB", slug="ppt-kb", visibility="public"
    )


# --------------------------------------------------------------------------- #
# format detection
# --------------------------------------------------------------------------- #


@pytest.mark.django_db
def test_detect_doc_format_pptx(owner, kb):
    doc = Document.objects.create(knowledge_base=kb, title="Deck", status="published")
    Attachment.objects.create(
        document=doc,
        uploaded_by=owner,
        file=ContentFile(b"x", name="deck.pptx"),
        original_filename="deck.pptx",
        kind=Attachment.KIND_DOCUMENT,
        mime_type=PPTX_CT,
        size=1,
    )
    assert detect_doc_format(doc) == "pptx"


@pytest.mark.django_db
def test_detect_doc_format_legacy_ppt(owner, kb):
    doc = Document.objects.create(knowledge_base=kb, title="Old", status="published")
    Attachment.objects.create(
        document=doc,
        uploaded_by=owner,
        file=ContentFile(b"x", name="old.ppt"),
        original_filename="old.ppt",
        kind=Attachment.KIND_DOCUMENT,
        mime_type="application/vnd.ms-powerpoint",
        size=1,
    )
    assert detect_doc_format(doc) == "pptx"


# --------------------------------------------------------------------------- #
# import dispatches async conversion
# --------------------------------------------------------------------------- #


@pytest.mark.django_db
def test_import_pptx_dispatches_conversion(api_client, owner, kb, settings, tmp_path, monkeypatch):
    settings.MEDIA_ROOT = str(tmp_path)
    calls = []
    monkeypatch.setattr(
        pptx_tasks.convert_pptx_to_slides,
        "delay",
        lambda doc_id, att_id: calls.append((doc_id, att_id)),
    )
    api_client.force_authenticate(owner)
    f = SimpleUploadedFile("deck.pptx", b"PK\x03\x04 fake pptx", content_type=PPTX_CT)
    resp = api_client.post(
        reverse("api_v1:import-file"),
        data={"knowledge_base": kb.id, "file": f},
        format="multipart",
    )
    assert resp.status_code == 201, resp.content
    doc = Document.objects.get(pk=resp.data["id"])
    assert len(calls) == 1 and calls[0][0] == doc.id  # dispatched once for this doc
    assert detect_doc_format(doc) == "pptx"
    # Body stays empty — it's a view-only binary.
    assert not (doc.published_content or "").strip()


# --------------------------------------------------------------------------- #
# conversion task
# --------------------------------------------------------------------------- #


def _make_doc_with_pptx(owner, kb, tmp_path, settings):
    settings.MEDIA_ROOT = str(tmp_path)
    doc = Document.objects.create(knowledge_base=kb, title="Deck", status="published")
    att = Attachment.objects.create(
        document=doc,
        uploaded_by=owner,
        file=ContentFile(b"PK fake", name="deck.pptx"),
        original_filename="deck.pptx",
        kind=Attachment.KIND_DOCUMENT,
        mime_type=PPTX_CT,
        size=7,
    )
    return doc, att


@pytest.mark.django_db
def test_convert_pptx_creates_ordered_slides(owner, kb, settings, tmp_path, monkeypatch):
    doc, att = _make_doc_with_pptx(owner, kb, tmp_path, settings)

    def fake_convert(pptx_path, workdir):
        # Stand in for LibreOffice + pdftoppm: emit 3 ordered PNGs.
        return [
            _png_file(Path(workdir) / f"slide-{i}.png", size=(300 + i, 200))
            for i in range(1, 4)
        ]

    monkeypatch.setattr(pptx_tasks, "_convert", fake_convert)
    n = pptx_tasks.convert_pptx_to_slides(doc.id, att.id)
    assert n == 3
    slides = list(SlideImage.objects.filter(document=doc).order_by("index"))
    assert [s.index for s in slides] == [0, 1, 2]
    assert all(s.width > 0 and s.height > 0 for s in slides)
    assert all(s.image for s in slides)
    assert slides[0].source_id == att.id


@pytest.mark.django_db
def test_convert_pptx_idempotent(owner, kb, settings, tmp_path, monkeypatch):
    doc, att = _make_doc_with_pptx(owner, kb, tmp_path, settings)
    SlideImage.objects.create(document=doc, source=att, index=0, width=1, height=1,
                              image=ContentFile(b"x", name="s0.png"))
    called = {"n": 0}

    def fake_convert(pptx_path, workdir):
        called["n"] += 1
        return []

    monkeypatch.setattr(pptx_tasks, "_convert", fake_convert)
    n = pptx_tasks.convert_pptx_to_slides(doc.id, att.id)
    assert n == 0
    assert called["n"] == 0  # short-circuited before running conversion


@pytest.mark.django_db
def test_convert_pptx_missing_binary_is_soft(owner, kb, settings, tmp_path, monkeypatch):
    doc, att = _make_doc_with_pptx(owner, kb, tmp_path, settings)

    def boom(pptx_path, workdir):
        raise FileNotFoundError("soffice")

    monkeypatch.setattr(pptx_tasks, "_convert", boom)
    n = pptx_tasks.convert_pptx_to_slides(doc.id, att.id)
    assert n == 0
    assert not SlideImage.objects.filter(document=doc).exists()


# --------------------------------------------------------------------------- #
# public slides endpoint (friend-gated, ordered)
# --------------------------------------------------------------------------- #


@pytest.mark.django_db
def test_public_slides_endpoint(api_client, owner, kb, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    settings.SITE_REQUIRE_LOGIN = False  # allow anon to reach the gate for this test
    doc = Document.objects.create(
        knowledge_base=kb, title="Deck", status="published", visibility="public",
    )
    att = Attachment.objects.create(
        document=doc, uploaded_by=owner,
        file=ContentFile(b"x", name="deck.pptx"), original_filename="deck.pptx",
        kind=Attachment.KIND_DOCUMENT, mime_type=PPTX_CT, size=1,
    )
    for i in range(2):
        SlideImage.objects.create(
            document=doc, source=att, index=i, width=10 + i, height=20,
            image=ContentFile(b"x", name=f"s{i}.png"),
        )
    resp = api_client.get(reverse("api_v1:public-post-slides", args=[doc.id]))
    assert resp.status_code == 200, resp.content
    slides = resp.data["slides"]
    assert [s["index"] for s in slides] == [0, 1]
    assert slides[0]["width"] == 10
