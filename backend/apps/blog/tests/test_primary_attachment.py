"""Blog primary_attachment: a markdown doc bundled with image assets must report
its .md source as primary, not an asset image (regression: an extra image was
echoed at the bottom of the article via showOriginalAtBottom)."""

from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.blog.serializers import _primary_attachment
from apps.editor.models import Attachment
from apps.knowledge.models import Document, KnowledgeBase

User = get_user_model()
PNG = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * 20


@pytest.mark.django_db
def test_primary_prefers_md_over_asset_image_when_body_exists(settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    user = User.objects.create_user("bp", "bp@e.com", "p")
    kb = KnowledgeBase.objects.create(owner=user, name="K", slug="k-bp")
    doc = Document.objects.create(
        knowledge_base=kb, title="教程", slug="d-bp",
        raw_content="# 教程\n![x](/media/x.png)\n正文\n",
        published_content="# 教程\n![x](/media/x.png)\n",
    )
    # Image attachment created FIRST (oldest) — mimics the bundling order.
    Attachment.objects.create(
        document=doc, uploaded_by=user,
        file=SimpleUploadedFile("x.png", PNG, content_type="image/png"),
        original_filename="x.png", kind=Attachment.KIND_IMAGE, mime_type="image/png", size=len(PNG),
    )
    md_att = Attachment.objects.create(
        document=doc, uploaded_by=user,
        file=SimpleUploadedFile("教程.md", b"# x", content_type="text/markdown"),
        original_filename="教程.md", kind=Attachment.KIND_DOCUMENT, mime_type="text/markdown", size=3,
    )
    primary = _primary_attachment(doc)
    assert primary is not None
    assert primary["id"] == md_att.id
    assert primary["original_filename"] == "教程.md"


@pytest.mark.django_db
def test_primary_is_image_for_pure_image_doc(settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    user = User.objects.create_user("bi", "bi@e.com", "p")
    kb = KnowledgeBase.objects.create(owner=user, name="K", slug="k-bi")
    doc = Document.objects.create(
        knowledge_base=kb, title="photo", slug="d-bi", raw_content="", published_content=""
    )
    img = Attachment.objects.create(
        document=doc, uploaded_by=user,
        file=SimpleUploadedFile("p.png", PNG, content_type="image/png"),
        original_filename="p.png", kind=Attachment.KIND_IMAGE, mime_type="image/png", size=len(PNG),
    )
    assert _primary_attachment(doc)["id"] == img.id
