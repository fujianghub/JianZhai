from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth import get_user_model

from apps.editor.models import Attachment
from apps.editor.services.image_mirror import (
    extract_markdown_image_urls,
    mirror_images_for_document,
    should_mirror,
)
from apps.knowledge.models import Document, KnowledgeBase

User = get_user_model()


def test_extract_markdown_image_urls_dedupes():
    src = "![](http://a.com/1.png) text ![](http://a.com/1.png)"
    assert extract_markdown_image_urls(src) == ["http://a.com/1.png"]


def test_should_mirror_skips_local_media():
    assert should_mirror("/media/uploads/2026/01/x.png") is False
    assert should_mirror("https://cdn.nlark.com/yuque/x.png") is True


@pytest.mark.django_db
@patch("apps.editor.services.image_mirror.urlopen")
def test_mirror_images_for_document_rewrites_markdown(mock_urlopen, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    user = User.objects.create_user("mirror", "mirror@example.com", "pass")
    kb = KnowledgeBase.objects.create(owner=user, name="KB", slug="kb")
    remote = "http://example.com/a.png"
    doc = Document.objects.create(
        knowledge_base=kb,
        title="Doc",
        slug="doc",
        raw_content=f"![]({remote})",
        published_content=f"![]({remote})",
    )

    mock_resp = MagicMock()
    mock_resp.read.return_value = b"\x89PNG\r\n\x1a\n" + b"0" * 64
    mock_resp.headers.get.return_value = "image/png"
    mock_resp.__enter__ = lambda s: s
    mock_resp.__exit__ = MagicMock(return_value=False)
    mock_urlopen.return_value = mock_resp

    stats = mirror_images_for_document(doc, uploaded_by=user)
    doc.refresh_from_db()

    assert stats["mirrored"] == 1
    assert stats["content_changed"] == 1
    assert remote not in doc.raw_content
    assert "/media/" in doc.raw_content
    assert Attachment.objects.filter(document=doc, kind=Attachment.KIND_IMAGE).count() == 1


@pytest.mark.django_db
@patch("apps.editor.services.image_mirror.urlopen")
def test_mirror_skips_already_local_urls(mock_urlopen, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    user = User.objects.create_user("mirror2", "mirror2@example.com", "pass")
    kb = KnowledgeBase.objects.create(owner=user, name="KB2", slug="kb2")
    local = "/media/uploads/2026/01/existing.png"
    doc = Document.objects.create(
        knowledge_base=kb,
        title="Doc2",
        slug="doc2",
        raw_content=f"![]({local})",
    )

    stats = mirror_images_for_document(doc, uploaded_by=user)

    assert stats["mirrored"] == 0
    assert stats["skipped"] == 1
    mock_urlopen.assert_not_called()


# --------------------------------------------------------------------------- #
# import dispatches mirroring asynchronously (off the upload request)
# --------------------------------------------------------------------------- #


@pytest.mark.django_db
def test_import_md_with_remote_image_dispatches_mirror(settings, tmp_path, monkeypatch):
    """Uploading a markdown note with a remote image enqueues the mirror task
    instead of downloading inline (a Yuque export's CDN throttling would blow
    the request timeout)."""
    from django.core.files.uploadedfile import SimpleUploadedFile
    from django.urls import reverse
    from rest_framework.test import APIClient

    from apps.editor import tasks as editor_tasks

    settings.MEDIA_ROOT = str(tmp_path)
    user = User.objects.create_user("imp", "imp@example.com", "pass", is_staff=True)
    kb = KnowledgeBase.objects.create(owner=user, name="ImpKB", slug="imp-kb")

    calls = []
    monkeypatch.setattr(
        editor_tasks.mirror_document_images, "delay", lambda *a: calls.append(a)
    )

    client = APIClient()
    client.force_authenticate(user)
    body = b"# Title\n\n![](https://cdn.nlark.com/yuque/0/x.png)\n"
    md = SimpleUploadedFile("note.md", body, content_type="text/markdown")
    resp = client.post(
        reverse("api_v1:import-file"),
        data={"knowledge_base": kb.id, "file": md},
        format="multipart",
    )
    assert resp.status_code == 201, resp.content
    assert len(calls) == 1 and calls[0][0] == resp.data["id"]


@pytest.mark.django_db
def test_import_md_without_remote_image_skips_dispatch(settings, tmp_path, monkeypatch):
    """An image-less note (or one with only local refs) must not queue a no-op."""
    from django.core.files.uploadedfile import SimpleUploadedFile
    from django.urls import reverse
    from rest_framework.test import APIClient

    from apps.editor import tasks as editor_tasks

    settings.MEDIA_ROOT = str(tmp_path)
    user = User.objects.create_user("imp2", "imp2@example.com", "pass", is_staff=True)
    kb = KnowledgeBase.objects.create(owner=user, name="ImpKB2", slug="imp-kb2")

    calls = []
    monkeypatch.setattr(
        editor_tasks.mirror_document_images, "delay", lambda *a: calls.append(a)
    )

    client = APIClient()
    client.force_authenticate(user)
    md = SimpleUploadedFile("plain.md", b"# Only text\n\nno pictures\n", content_type="text/markdown")
    resp = client.post(
        reverse("api_v1:import-file"),
        data={"knowledge_base": kb.id, "file": md},
        format="multipart",
    )
    assert resp.status_code == 201, resp.content
    assert calls == []
