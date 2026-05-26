from __future__ import annotations

import pytest

pytest.importorskip("playwright")

from apps.exporter.scope import collect_for_scope
from apps.exporter.services import pdf_export
from apps.exporter.tests.conftest import make_doc


@pytest.mark.django_db
def test_pdf_export_smoke(owner, kb):
    make_doc(kb, "pdf-doc", published="# PDF\n\nParagraph.")
    from apps.knowledge.models import Document

    doc = Document.objects.get(knowledge_base=kb)
    scope = collect_for_scope(owner=owner, scope="doc", target_id=doc.id)
    path, filename, mime = pdf_export.export(scope)
    assert filename.endswith(".pdf")
    assert path.stat().st_size > 100
    assert mime == "application/pdf"
