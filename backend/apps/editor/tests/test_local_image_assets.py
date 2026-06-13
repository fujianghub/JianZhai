"""Local-image bundling: relative ``./images/x.png`` → Attachment + rewrite."""

from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework.test import APIClient

from apps.editor.models import Attachment
from apps.editor.services.local_image_assets import (
    AssetIndex,
    is_local_image_ref,
    normalize_ref_path,
    rewrite_local_image_refs,
)
from apps.knowledge.models import Document, KnowledgeBase

User = get_user_model()

# 1×1 transparent PNG.
PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)
SVG_BYTES = b'<svg xmlns="http://www.w3.org/2000/svg"></svg>'


# ── unit: ref classification + normalisation ──

@pytest.mark.parametrize(
    "url,expected",
    [
        ("./images/a.png", True),
        ("images/a.png", True),
        ("../assets/a.png", True),
        ("a.png", True),
        ("http://x.com/a.png", False),
        ("https://x.com/a.png", False),
        ("//cdn.com/a.png", False),
        ("/media/uploads/a.png", False),
        ("data:image/png;base64,xxxx", False),
        ("", False),
    ],
)
def test_is_local_image_ref(url, expected):
    assert is_local_image_ref(url) is expected


def test_normalize_ref_path_strips_dot_query_and_decodes():
    assert normalize_ref_path("./images/a.png") == "images/a.png"
    assert normalize_ref_path("images/a.png?v=2#x") == "images/a.png"
    assert normalize_ref_path("images/a%20b.png") == "images/a b.png"
    assert normalize_ref_path('images/a.png "title"') == "images/a.png"


def test_asset_index_relpath_and_basename():
    idx = AssetIndex()
    idx.add("教程/images/nodejs下载.png", "/media/u/1.png")
    # exact relpath match (resolved against the md's own dir)
    assert idx.url_for("教程/教程.md", "./images/nodejs下载.png") == "/media/u/1.png"
    # basename fallback when folder prefixes differ
    assert idx.url_for("", "./images/nodejs下载.png") == "/media/u/1.png"


def test_asset_index_basename_collision_is_not_blindly_matched():
    idx = AssetIndex()
    idx.add("a/images/pic.png", "/media/u/a.png")
    idx.add("b/images/pic.png", "/media/u/b.png")
    # ambiguous basename + no relpath pin → refuse to guess
    assert idx.url_for("", "pic.png") is None
    # but full relpath still resolves unambiguously
    assert idx.url_for("a/doc.md", "images/pic.png") == "/media/u/a.png"


@pytest.mark.django_db
def test_rewrite_local_image_refs_updates_both_fields():
    user = User.objects.create_user("rw", "rw@e.com", "p")
    kb = KnowledgeBase.objects.create(owner=user, name="K", slug="k-rw")
    body = "intro\n![x](./images/a.png)\n![y](http://ext.com/b.png)\n"
    doc = Document.objects.create(
        knowledge_base=kb, title="d", slug="d-rw",
        raw_content=body, published_content=body,
    )
    idx = AssetIndex()
    idx.add("images/a.png", "/media/uploads/abc.png")
    n = rewrite_local_image_refs(doc, idx, doc_rel="post.md")
    doc.refresh_from_db()
    assert n == 1
    assert "/media/uploads/abc.png" in doc.raw_content
    assert "/media/uploads/abc.png" in doc.published_content
    # remote ref untouched
    assert "http://ext.com/b.png" in doc.raw_content


# ── integration: import_batch view ──

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def owner():
    return User.objects.create_user("bundleowner", "bo@e.com", "pass")


@pytest.fixture
def kb(owner):
    return KnowledgeBase.objects.create(owner=owner, name="Bundle KB", slug="bundle-kb")


@pytest.mark.django_db
def test_import_batch_bundles_images_as_attachments(api_client, owner, kb, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    api_client.force_authenticate(owner)

    md = (
        "# 教程\n"
        "![一](./images/nodejs下载.png)\n"
        "![二](./images/diagram.svg)\n"
    )
    files = [
        SimpleUploadedFile("教程.md", md.encode("utf-8"), content_type="text/markdown"),
        SimpleUploadedFile("nodejs下载.png", PNG_BYTES, content_type="image/png"),
        SimpleUploadedFile("diagram.svg", SVG_BYTES, content_type="image/svg+xml"),
    ]
    paths = ["教程/教程.md", "教程/images/nodejs下载.png", "教程/images/diagram.svg"]

    resp = api_client.post(
        reverse("api_v1:import-batch"),
        data={"knowledge_base": kb.id, "files": files, "paths": paths},
        format="multipart",
    )
    assert resp.status_code == 201, resp.content

    # Exactly one document — images did NOT become standalone docs.
    assert len(resp.data["created"]) == 1
    doc = Document.objects.get(pk=resp.data["created"][0]["id"])

    # Relative refs rewritten to /media/…; no broken ./images/ left.
    assert "./images/nodejs下载.png" not in doc.raw_content
    assert "./images/diagram.svg" not in doc.raw_content
    assert doc.raw_content.count("/media/") == 2
    assert doc.published_content.count("/media/") == 2

    # Two image attachments, both bound to the document.
    atts = Attachment.objects.filter(kind=Attachment.KIND_IMAGE)
    assert atts.count() == 2
    assert all(a.document_id == doc.id for a in atts)
    # No empty "image documents" created.
    assert Document.objects.count() == 1


@pytest.mark.django_db
def test_import_batch_images_only_keeps_legacy_behaviour(api_client, owner, kb, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    api_client.force_authenticate(owner)
    files = [
        SimpleUploadedFile("a.png", PNG_BYTES, content_type="image/png"),
        SimpleUploadedFile("b.png", PNG_BYTES, content_type="image/png"),
    ]
    resp = api_client.post(
        reverse("api_v1:import-batch"),
        data={"knowledge_base": kb.id, "files": files, "paths": ["a.png", "b.png"]},
        format="multipart",
    )
    assert resp.status_code == 201, resp.content
    # No markdown present → images stay one-document-each (media-library style).
    assert len(resp.data["created"]) == 2
