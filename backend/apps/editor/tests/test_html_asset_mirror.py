from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth import get_user_model

from apps.editor.models import Attachment
from apps.editor.services.html_asset_mirror import (
    extract_html_resource_urls,
    mirror_html_assets_for_document,
)
from apps.knowledge.models import Document, KnowledgeBase

User = get_user_model()


def test_extract_finds_img_link_script_and_dedupes():
    src = (
        '<img src="http://a.com/1.png">'
        '<img src="http://a.com/1.png">'  # duplicate dropped
        '<link rel="stylesheet" href="http://a.com/x.css">'
        '<link rel="icon" href="http://a.com/fav.ico">'  # non-stylesheet ignored
        '<script src="http://a.com/y.js"></script>'
    )
    assert extract_html_resource_urls(src) == [
        ("http://a.com/1.png", "image"),
        ("http://a.com/x.css", "stylesheet"),
        ("http://a.com/y.js", "script"),
    ]


def test_extract_handles_malformed_html_gracefully():
    # Unclosed tag — HTMLParser tolerates this; the partial result is fine.
    assert extract_html_resource_urls('<img src="http://a.com/x.png" >') == [
        ("http://a.com/x.png", "image"),
    ]


@pytest.mark.django_db
def test_mirror_noop_for_non_html_doc():
    user = User.objects.create_user("noop", "noop@example.com", "pass")
    kb = KnowledgeBase.objects.create(owner=user, name="KB", slug="kb-noop")
    doc = Document.objects.create(
        knowledge_base=kb,
        title="md doc",
        slug="md",
        raw_content='<img src="http://a.com/x.png">',
    )
    # No HTML attachment → detect_doc_format returns "markdown".
    stats = mirror_html_assets_for_document(doc, uploaded_by=user)
    assert stats == {"mirrored": 0, "failed": 0, "skipped": 0, "content_changed": 0}


@pytest.mark.django_db
@patch("apps.editor.services.image_mirror.urlopen")
def test_mirror_rewrites_img_in_html_doc(mock_urlopen, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    user = User.objects.create_user("hm", "hm@example.com", "pass")
    kb = KnowledgeBase.objects.create(owner=user, name="HKB", slug="hkb")
    remote = "http://example.com/figure.png"
    doc = Document.objects.create(
        knowledge_base=kb,
        title="page",
        slug="page",
        raw_content=f'<html><body><img src="{remote}"></body></html>',
        published_content=f'<html><body><img src="{remote}"></body></html>',
    )
    # An HTML attachment exists so detect_doc_format == "html".
    Attachment.objects.create(
        document=doc,
        uploaded_by=user,
        original_filename="page.html",
        kind=Attachment.KIND_DOCUMENT,
        mime_type="text/html",
        size=10,
    )

    mock_resp = MagicMock()
    mock_resp.read.return_value = b"\x89PNG\r\n\x1a\n" + b"0" * 64
    mock_resp.headers.get.return_value = "image/png"
    mock_resp.__enter__ = lambda s: s
    mock_resp.__exit__ = MagicMock(return_value=False)
    mock_urlopen.return_value = mock_resp

    stats = mirror_html_assets_for_document(doc, uploaded_by=user)
    doc.refresh_from_db()

    assert stats["mirrored"] == 1
    assert stats["content_changed"] == 1
    assert remote not in doc.raw_content
    assert remote not in doc.published_content
    assert "/media/" in doc.raw_content
    # One PNG attachment was added in addition to the original .html row.
    assert (
        Attachment.objects.filter(document=doc, kind=Attachment.KIND_IMAGE).count()
        == 1
    )


@pytest.mark.django_db
@patch("apps.editor.services.image_mirror.urlopen")
def test_mirror_skips_relative_paths(mock_urlopen, settings, tmp_path):
    """Relative URLs (./foo.png) can't be resolved without a base — skipped."""
    settings.MEDIA_ROOT = str(tmp_path)
    user = User.objects.create_user("rel", "rel@example.com", "pass")
    kb = KnowledgeBase.objects.create(owner=user, name="RKB", slug="rkb")
    doc = Document.objects.create(
        knowledge_base=kb,
        title="rel",
        slug="rel",
        raw_content='<img src="./assets/x.png"><img src="/static/y.png">',
    )
    Attachment.objects.create(
        document=doc,
        uploaded_by=user,
        original_filename="rel.html",
        kind=Attachment.KIND_DOCUMENT,
        mime_type="text/html",
        size=10,
    )

    stats = mirror_html_assets_for_document(doc, uploaded_by=user)

    assert stats["mirrored"] == 0
    assert stats["skipped"] == 2
    mock_urlopen.assert_not_called()
