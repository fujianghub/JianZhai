"""Permanent delete removes files; cleanup_media finds true orphans only."""
from __future__ import annotations

import os
import time
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.urls import reverse
from rest_framework.test import APIClient

from apps.editor import tasks as pptx_tasks
from apps.editor.media_maintenance import cleanup_media
from apps.editor.models import Attachment, DerivedFile, SlideImage
from apps.editor.services import media_gc
from apps.knowledge.models import Document, KnowledgeBase

User = get_user_model()
PPTX_CT = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


@pytest.fixture
def owner():
    return User.objects.create_user("gcowner", "gc@e.com", "pass", is_staff=True)


@pytest.fixture
def root():
    return User.objects.create_user("fengfujiang", "gcroot@e.com", "pass", is_staff=True, is_superuser=True)


@pytest.fixture
def kb(owner):
    return KnowledgeBase.objects.create(owner=owner, name="GC", slug="gc-kb")


def _doc_with_files(kb, owner, title="d"):
    doc = Document.objects.create(knowledge_base=kb, title=title, status="published")
    att = Attachment.objects.create(
        document=doc, uploaded_by=owner, file=ContentFile(b"PK", name="deck.pptx"),
        original_filename="deck.pptx", kind=Attachment.KIND_DOCUMENT, mime_type=PPTX_CT, size=2,
    )
    slide = SlideImage.objects.create(
        document=doc, source=att, index=0, width=1, height=1,
        image=ContentFile(b"img", name="s0.jpg"), thumbnail=ContentFile(b"th", name="t0.jpg"),
    )
    deck = DerivedFile.objects.create(document=doc, source=att, kind="deck_pdf", file=ContentFile(b"pdf", name="deck.pdf"))
    return doc, [att.file.path, slide.image.path, slide.thumbnail.path, deck.file.path]


@pytest.mark.django_db
def test_purge_document_removes_rows_and_files(owner, kb, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    doc, paths = _doc_with_files(kb, owner)
    assert all(os.path.exists(p) for p in paths)
    assert media_gc.purge_document(doc) == 4
    assert not Document.all_objects.filter(pk=doc.pk).exists()
    assert not Attachment.objects.exists() and not SlideImage.objects.exists() and not DerivedFile.objects.exists()
    assert not any(os.path.exists(p) for p in paths)


@pytest.mark.django_db
def test_purge_kb_removes_trashed_and_live_docs_files(owner, kb, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    live, p1 = _doc_with_files(kb, owner, "live")
    trashed, p2 = _doc_with_files(kb, owner, "trashed")
    trashed.soft_delete()
    kb.soft_delete()
    assert media_gc.purge_knowledge_base(kb) == 8
    assert not any(os.path.exists(p) for p in p1 + p2)
    assert not KnowledgeBase.all_objects.filter(pk=kb.pk).exists()


@pytest.mark.django_db
def test_trash_endpoints_purge_files(owner, root, kb, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    d1, p1 = _doc_with_files(kb, owner, "a")
    d2, p2 = _doc_with_files(kb, owner, "b")
    d1.soft_delete()
    d2.soft_delete()
    client = APIClient()
    client.force_authenticate(user=root)
    assert client.delete(reverse("api_v1:trash-doc-purge", args=[d1.id])).status_code == 204
    assert not any(os.path.exists(p) for p in p1)
    assert client.post(reverse("api_v1:trash-empty"), {"scope": "documents"}, format="json").status_code == 200
    assert not any(os.path.exists(p) for p in p2)


@pytest.mark.django_db
def test_cleanup_media_reports_and_deletes_only_old_orphans(owner, kb, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    doc, referenced = _doc_with_files(kb, owner)
    trashed, trashed_files = _doc_with_files(kb, owner, "t")
    trashed.soft_delete()  # rows survive → files are NOT orphans
    old_orphan = Path(settings.MEDIA_ROOT) / "uploads" / "2020" / "01" / "orphan.pdf"
    old_orphan.parent.mkdir(parents=True)
    old_orphan.write_bytes(b"x" * 10)
    old = time.time() - 48 * 3600
    os.utime(old_orphan, (old, old))
    fresh_orphan = Path(settings.MEDIA_ROOT) / "slides" / "fresh.jpg"
    fresh_orphan.parent.mkdir(parents=True, exist_ok=True)
    fresh_orphan.write_bytes(b"y")
    (Path(settings.MEDIA_ROOT) / "avatars").mkdir(exist_ok=True)
    avatar = Path(settings.MEDIA_ROOT) / "avatars" / "user_1.webp"
    avatar.write_bytes(b"a")
    os.utime(avatar, (old, old))

    stats = cleanup_media(apply=False)
    assert stats["orphans"] == 1 and stats["deleted"] == 0 and stats["orphan_bytes"] == 10
    assert stats["examples"] == ["uploads/2020/01/orphan.pdf"]
    assert old_orphan.exists()

    stats = cleanup_media(apply=True)
    assert stats["deleted"] == 1
    assert not old_orphan.exists()
    assert fresh_orphan.exists() and avatar.exists()
    assert all(os.path.exists(p) for p in referenced + trashed_files)


@pytest.mark.django_db
def test_cleanup_media_command_is_report_only_by_default(settings, tmp_path, capsys):
    settings.MEDIA_ROOT = str(tmp_path)
    orphan = Path(settings.MEDIA_ROOT) / "derived" / "x.pdf"
    orphan.parent.mkdir(parents=True)
    orphan.write_bytes(b"z")
    old = time.time() - 48 * 3600
    os.utime(orphan, (old, old))
    call_command("cleanup_media")
    assert orphan.exists()
    out = capsys.readouterr().out
    assert "report-only" in out and "orphans=1" in out
    call_command("cleanup_media", "--apply")
    assert not orphan.exists()


@pytest.mark.django_db
def test_failed_conversion_leaves_no_orphan_slides(owner, kb, settings, tmp_path, monkeypatch):
    settings.MEDIA_ROOT = str(tmp_path)
    doc = Document.objects.create(knowledge_base=kb, title="Deck", status="published")
    att = Attachment.objects.create(
        document=doc, uploaded_by=owner, file=ContentFile(b"PK fake", name="deck.pptx"),
        original_filename="deck.pptx", kind=Attachment.KIND_DOCUMENT, mime_type=PPTX_CT, size=7,
    )

    def fake_convert(pptx_path, workdir):
        from PIL import Image

        out = []
        for i in range(1, 3):
            p = Path(workdir) / f"slide-{i}.png"
            Image.new("RGB", (30, 20), (1, 2, 3)).save(p, format="PNG")
            out.append(p)
        return out

    monkeypatch.setattr(pptx_tasks, "_convert", fake_convert)

    def boom(*a, **k):
        raise RuntimeError("db down")

    monkeypatch.setattr(SlideImage.objects, "bulk_create", boom)
    assert pptx_tasks.convert_pptx_to_slides(doc.id, att.id) == 0
    doc.refresh_from_db()
    assert doc.slide_status == "failed"
    slides_dir = Path(settings.MEDIA_ROOT) / "slides"
    assert not slides_dir.exists() or not any(slides_dir.rglob("*.jpg"))


@pytest.mark.django_db
def test_cleanup_media_keeps_body_referenced_files_and_prunes_orphan_rows(owner, kb, settings, tmp_path):
    from datetime import timedelta

    from django.utils import timezone

    settings.MEDIA_ROOT = str(tmp_path)
    old = time.time() - 48 * 3600
    # Editor image upload: row without document, file referenced by a body.
    body_img = Attachment.objects.create(
        uploaded_by=owner, file=ContentFile(b"i", name="inline.png"), original_filename="inline.png",
        kind=Attachment.KIND_IMAGE, mime_type="image/png", size=1,
    )
    Document.objects.create(knowledge_base=kb, title="uses", raw_content=f"![x](/media/{body_img.file.name})")
    # Plain file referenced only by a body (no row at all) — still not an orphan.
    loose = Path(settings.MEDIA_ROOT) / "uploads" / "loose.png"
    loose.parent.mkdir(parents=True, exist_ok=True)
    loose.write_bytes(b"l")
    os.utime(loose, (old, old))
    Document.objects.create(knowledge_base=kb, title="loose", published_content="<img src=\"/media/uploads/loose.png\">")
    # Truly orphan row: no document, unreferenced, old.
    dead = Attachment.objects.create(
        uploaded_by=owner, file=ContentFile(b"d", name="dead.bin"), original_filename="dead.bin",
        kind=Attachment.KIND_OTHER, mime_type="application/octet-stream", size=1,
    )
    Attachment.objects.filter(pk=dead.pk).update(created_at=timezone.now() - timedelta(days=30))
    dead_path = dead.file.path
    # Fresh document-less row (just uploaded) must survive.
    fresh = Attachment.objects.create(
        uploaded_by=owner, file=ContentFile(b"f", name="fresh.bin"), original_filename="fresh.bin",
        kind=Attachment.KIND_OTHER, mime_type="application/octet-stream", size=1,
    )

    stats = cleanup_media(apply=False)
    assert stats["orphan_rows"] == 1 and stats["orphans"] == 0
    stats = cleanup_media(apply=True)
    assert stats["deleted_rows"] == 1 and stats["deleted"] == 0
    assert not Attachment.objects.filter(pk=dead.pk).exists() and not os.path.exists(dead_path)
    assert Attachment.objects.filter(pk__in=[body_img.pk, fresh.pk]).count() == 2
    assert loose.exists() and os.path.exists(body_img.file.path)

