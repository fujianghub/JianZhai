from __future__ import annotations

import pytest

from apps.exporter.services import common
from apps.exporter.tests.conftest import make_doc


@pytest.mark.django_db
def test_doc_export_body_prefers_published(kb):
    doc = make_doc(kb, "pub", raw="draft body", published="published body")
    assert common.doc_export_body(doc) == "published body"


@pytest.mark.django_db
def test_doc_export_body_falls_back_to_raw(kb):
    doc = make_doc(kb, "draft-only", raw="draft only", published="")
    assert common.doc_export_body(doc) == "draft only"


def test_rewrite_html_media_embeds_local_file(settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    img_dir = tmp_path / "uploads" / "2026" / "01"
    img_dir.mkdir(parents=True)
    img = img_dir / "x.png"
    img.write_bytes(b"\x89PNG\r\n\x1a\n")

    html = '<img src="/media/uploads/2026/01/x.png">'
    out = common.rewrite_html_media(html, embed=True)
    assert "data:image/png;base64," in out
    assert "/media/" not in out


def test_rewrite_markdown_media_paths(settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    img = tmp_path / "uploads" / "2026" / "01" / "a.png"
    img.parent.mkdir(parents=True)
    img.write_bytes(b"x")
    md = "![pic](/media/uploads/2026/01/a.png)"
    out = common.rewrite_markdown_media_paths(md)
    assert "assets/uploads/2026/01/a.png" in out
