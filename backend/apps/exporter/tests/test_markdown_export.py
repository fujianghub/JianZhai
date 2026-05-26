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
def test_kb_zip_has_unique_paths(owner, kb):
    make_doc(kb, "same-title")
    make_doc(kb, "same-title-2")
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    path, filename, mime = markdown_export.export(scope)
    assert filename.endswith("-markdown.zip")
    with zipfile.ZipFile(BytesIO(path.read_bytes())) as zf:
        names = zf.namelist()
    assert len(names) == len(set(names))
