from __future__ import annotations

import zipfile
from io import BytesIO

import pytest

from apps.exporter.scope import collect_for_scope
from apps.exporter.services import markdown_export
from apps.exporter.tests.conftest import make_doc


@pytest.mark.django_db
def test_single_doc_markdown_uses_published(owner, kb):
    from apps.knowledge.models import Document

    make_doc(kb, "doc", raw="raw", published="published text")
    doc = Document.objects.get(knowledge_base=kb, slug="doc")
    scope = collect_for_scope(owner=owner, scope="doc", target_id=doc.id)
    path, filename, mime = markdown_export.export(scope)
    assert filename.endswith(".md")
    assert "published text" in path.read_text(encoding="utf-8")
    assert "raw" not in path.read_text(encoding="utf-8") or "published text" in path.read_text(
        encoding="utf-8"
    )


@pytest.mark.django_db
def test_single_doc_zip_rewrites_media_paths(owner, kb, settings, tmp_path):
    """content.md inside the media zip must reference the bundled assets/ layout,
    for both markdown images and inline-HTML <img> tags."""
    from apps.knowledge.models import Document

    settings.MEDIA_ROOT = str(tmp_path)
    (tmp_path / "uploads").mkdir()
    (tmp_path / "uploads" / "a.png").write_bytes(b"png-a")
    (tmp_path / "uploads" / "b.png").write_bytes(b"png-b")
    make_doc(
        kb,
        "with-media",
        published='![pic](/media/uploads/a.png)\n\n<img src="/media/uploads/b.png" width="120">',
    )
    doc = Document.objects.get(knowledge_base=kb, slug="with-media")
    scope = collect_for_scope(owner=owner, scope="doc", target_id=doc.id)
    path, filename, mime = markdown_export.export(scope)
    assert filename.endswith(".zip")
    with zipfile.ZipFile(BytesIO(path.read_bytes())) as zf:
        names = set(zf.namelist())
        text = zf.read("content.md").decode("utf-8")
    assert "assets/uploads/a.png" in names
    assert "assets/uploads/b.png" in names
    assert "(assets/uploads/a.png)" in text
    assert 'src="assets/uploads/b.png"' in text
    assert "/media/" not in text


@pytest.mark.django_db
def test_oversized_asset_skipped_keeps_media_url(owner, kb, settings, tmp_path):
    """超过 EXPORT_MAX_ASSET_BYTES 的媒体不进包，正文保留可用的 /media/ 原链。"""
    from apps.knowledge.models import Document

    settings.MEDIA_ROOT = str(tmp_path)
    settings.EXPORT_MAX_ASSET_BYTES = 4
    (tmp_path / "uploads").mkdir()
    (tmp_path / "uploads" / "big.png").write_bytes(b"x" * 100)
    (tmp_path / "uploads" / "ok.png").write_bytes(b"ok")
    make_doc(
        kb,
        "cap",
        published="![b](/media/uploads/big.png)\n\n![s](/media/uploads/ok.png)",
    )
    doc = Document.objects.get(knowledge_base=kb, slug="cap")
    scope = collect_for_scope(owner=owner, scope="doc", target_id=doc.id)
    path, filename, _ = markdown_export.export(scope)
    with zipfile.ZipFile(BytesIO(path.read_bytes())) as zf:
        names = set(zf.namelist())
        text = zf.read("content.md").decode("utf-8")
    assert "assets/uploads/ok.png" in names
    assert "assets/uploads/big.png" not in names
    assert "(/media/uploads/big.png)" in text
    assert "(assets/uploads/ok.png)" in text


@pytest.mark.django_db
def test_kb_zip_has_unique_paths(owner, kb):
    make_doc(kb, "same-title")
    make_doc(kb, "same-title-2")
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    path, filename, mime = markdown_export.export(scope)
    assert filename.endswith(".zip")
    with zipfile.ZipFile(BytesIO(path.read_bytes())) as zf:
        names = zf.namelist()
    assert len(names) == len(set(names))
