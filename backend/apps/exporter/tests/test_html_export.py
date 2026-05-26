from __future__ import annotations

import pytest

from apps.exporter.scope import collect_for_scope
from apps.exporter.services import html_export
from apps.exporter.tests.conftest import make_doc


@pytest.mark.django_db
def test_multi_doc_html_has_toc(owner, kb):
    make_doc(kb, "a", published="# A")
    make_doc(kb, "b", published="# B")
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    html = html_export.render_html(scope)
    assert "export-toc" in html
    assert "doc-" in html


@pytest.mark.django_db
def test_html_embeds_media(settings, tmp_path, owner, kb):
    settings.MEDIA_ROOT = str(tmp_path)
    img_dir = tmp_path / "uploads" / "2026" / "01"
    img_dir.mkdir(parents=True)
    (img_dir / "pic.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    doc = make_doc(
        kb,
        "img-doc",
        published='![x](/media/uploads/2026/01/pic.png)',
    )
    scope = collect_for_scope(owner=owner, scope="doc", target_id=doc.id)
    html = html_export.render_html(scope)
    assert "data:image/png;base64," in html
