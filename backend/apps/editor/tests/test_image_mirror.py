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
