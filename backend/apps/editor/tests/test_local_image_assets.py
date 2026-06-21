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
    # Import endpoints (import-batch / import-zip) are author-only (is_staff).
    return User.objects.create_user("bundleowner", "bo@e.com", "pass", is_staff=True)


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


# ── integration: import_zip view ──

def _make_zip(files: dict[str, bytes]) -> bytes:
    import io
    import zipfile

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in files.items():
            zf.writestr(name, data)
    return buf.getvalue()


@pytest.mark.django_db
def test_import_zip_bundles_md_and_images(api_client, owner, kb, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    api_client.force_authenticate(owner)

    md = "# 教程\n![一](./images/pic.png)\n![二](./images/diagram.svg)\n"
    zip_bytes = _make_zip({
        "教程/教程.md": md.encode("utf-8"),
        "教程/images/pic.png": PNG_BYTES,
        "教程/images/diagram.svg": SVG_BYTES,
        "教程/__MACOSX/junk": b"x",          # system cruft → skipped
        "教程/.DS_Store": b"x",               # hidden → skipped
        "教程/notes.exe": b"x",               # unsupported → skipped
    })
    zf = SimpleUploadedFile("bundle.zip", zip_bytes, content_type="application/zip")

    resp = api_client.post(
        reverse("api_v1:import-zip"),
        data={"knowledge_base": kb.id, "file": zf},
        format="multipart",
    )
    assert resp.status_code == 201, resp.content
    assert len(resp.data["created"]) == 1
    doc = Document.objects.get(pk=resp.data["created"][0]["id"])
    assert "./images/pic.png" not in doc.raw_content
    assert doc.raw_content.count("/media/") == 2
    atts = Attachment.objects.filter(kind=Attachment.KIND_IMAGE)
    assert atts.count() == 2
    assert all(a.document_id == doc.id for a in atts)
    # cruft reported as skipped, not imported
    assert len(resp.data["skipped"]) == 3
    assert Document.objects.count() == 1


@pytest.mark.django_db
def test_import_zip_rejects_path_traversal(api_client, owner, kb, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    api_client.force_authenticate(owner)
    zip_bytes = _make_zip({"../evil.md": b"# x", "ok/note.md": b"# ok"})
    zf = SimpleUploadedFile("b.zip", zip_bytes, content_type="application/zip")
    resp = api_client.post(
        reverse("api_v1:import-zip"),
        data={"knowledge_base": kb.id, "file": zf},
        format="multipart",
    )
    assert resp.status_code == 201, resp.content
    # only the safe entry imported; traversal entry skipped
    assert len(resp.data["created"]) == 1
    assert any("evil.md" in s for s in resp.data["skipped"])


@pytest.mark.django_db
def test_bundled_md_classified_as_markdown_not_image(settings, tmp_path):
    """A markdown doc carrying image *assets* must stay doc_format=markdown even
    when an image is its oldest attachment (regression: whole article was hidden
    behind a single inline-image preview)."""
    from apps.knowledge.serializers import detect_doc_format

    settings.MEDIA_ROOT = str(tmp_path)
    user = User.objects.create_user("fmt", "fmt@e.com", "p")
    kb = KnowledgeBase.objects.create(owner=user, name="K", slug="k-fmt")
    doc = Document.objects.create(
        knowledge_base=kb, title="教程", slug="d-fmt",
        raw_content="# 教程\n![x](/media/uploads/x.png)\n正文……\n",
        published_content="# 教程\n![x](/media/uploads/x.png)\n",
    )
    # Image attachment created first → it is the "primary" (oldest) attachment.
    Attachment.objects.create(
        document=doc, uploaded_by=user,
        file=SimpleUploadedFile("x.png", PNG_BYTES, content_type="image/png"),
        original_filename="x.png", kind=Attachment.KIND_IMAGE, mime_type="image/png",
        size=len(PNG_BYTES),
    )
    assert detect_doc_format(doc) == "markdown"


@pytest.mark.django_db
def test_genuine_image_doc_still_image(settings, tmp_path):
    """A real image upload (no text body) must stay doc_format=image."""
    from apps.knowledge.serializers import detect_doc_format

    settings.MEDIA_ROOT = str(tmp_path)
    user = User.objects.create_user("img", "img@e.com", "p")
    kb = KnowledgeBase.objects.create(owner=user, name="K", slug="k-img")
    doc = Document.objects.create(
        knowledge_base=kb, title="photo", slug="d-img", raw_content="", published_content=""
    )
    Attachment.objects.create(
        document=doc, uploaded_by=user,
        file=SimpleUploadedFile("p.png", PNG_BYTES, content_type="image/png"),
        original_filename="p.png", kind=Attachment.KIND_IMAGE, mime_type="image/png",
        size=len(PNG_BYTES),
    )
    assert detect_doc_format(doc) == "image"


@pytest.mark.django_db
def test_import_batch_bundle_yields_markdown_format(api_client, owner, kb, settings, tmp_path):
    """End-to-end: bundled import → created doc reports doc_format=markdown."""
    from apps.knowledge.serializers import detect_doc_format

    settings.MEDIA_ROOT = str(tmp_path)
    api_client.force_authenticate(owner)
    md = "# 教程\n![一](./images/pic.png)\n"
    files = [
        SimpleUploadedFile("教程.md", md.encode("utf-8"), content_type="text/markdown"),
        SimpleUploadedFile("pic.png", PNG_BYTES, content_type="image/png"),
    ]
    resp = api_client.post(
        reverse("api_v1:import-batch"),
        data={"knowledge_base": kb.id, "files": files, "paths": ["教程/教程.md", "教程/images/pic.png"]},
        format="multipart",
    )
    assert resp.status_code == 201, resp.content
    doc = Document.objects.get(pk=resp.data["created"][0]["id"])
    assert detect_doc_format(doc) == "markdown"


@pytest.mark.django_db
def test_import_zip_rejects_non_zip(api_client, owner, kb):
    api_client.force_authenticate(owner)
    zf = SimpleUploadedFile("a.md", b"# hi", content_type="text/markdown")
    resp = api_client.post(
        reverse("api_v1:import-zip"),
        data={"knowledge_base": kb.id, "file": zf},
        format="multipart",
    )
    assert resp.status_code == 415
