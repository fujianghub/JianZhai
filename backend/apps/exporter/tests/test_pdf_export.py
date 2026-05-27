from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

pytest.importorskip("playwright")

from apps.exporter.scope import collect_for_scope
from apps.exporter.services import pdf_export
from apps.exporter.tests.conftest import make_doc
from apps.knowledge.models import Document

HTML_DOC = (
    "<!doctype html><html><head><style>.x{color:red}</style></head>"
    "<body><p class='x'>HTML body</p></body></html>"
)


@pytest.mark.django_db
def test_pdf_export_smoke(owner, kb):
    make_doc(kb, "pdf-doc", published="# PDF\n\nParagraph.")
    doc = Document.objects.get(knowledge_base=kb)
    scope = collect_for_scope(owner=owner, scope="doc", target_id=doc.id)
    path, filename, mime = pdf_export.export(scope)
    assert filename.endswith(".pdf")
    assert path.stat().st_size > 100
    assert mime == "application/pdf"


@pytest.mark.django_db
def test_pdf_export_html_format_smoke(owner, kb):
    make_doc(kb, "html-pdf", published=HTML_DOC)
    doc = Document.objects.get(slug="html-pdf", knowledge_base=kb)
    scope = collect_for_scope(owner=owner, scope="doc", target_id=doc.id)
    path, filename, mime = pdf_export.export(scope)
    assert filename.endswith(".pdf")
    assert path.stat().st_size > 100
    assert mime == "application/pdf"


class _FakePlaywrightCM:
    def __init__(self, pw):
        self._pw = pw

    def __enter__(self):
        return self._pw

    def __exit__(self, *_args):
        return False


def test_render_pdf_uses_goto_file_uri_not_set_content():
    """Regression: large HTML exports must not use set_content (CDP payload limits)."""
    fake_page = MagicMock()
    fake_page.pdf.return_value = b"%PDF-1.4 fake\n"
    fake_browser = MagicMock()
    fake_browser.new_page.return_value = fake_page
    fake_pw = MagicMock()
    fake_pw.chromium.launch.return_value = fake_browser

    def _fake_sync_playwright():
        return _FakePlaywrightCM(fake_pw)

    html = "<html><body><p>ok</p></body></html>\x00evil"
    with patch("playwright.sync_api.sync_playwright", _fake_sync_playwright):
        out = pdf_export._render_pdf(html)

    fake_page.set_content.assert_not_called()
    fake_page.goto.assert_called_once()
    goto_url = fake_page.goto.call_args[0][0]
    assert isinstance(goto_url, str)
    assert goto_url.startswith("file:")
    assert out == b"%PDF-1.4 fake\n"
    fake_pw.chromium.launch.assert_called_once()
    launch_kwargs = fake_pw.chromium.launch.call_args
    assert launch_kwargs[1]["args"] == list(pdf_export.CHROMIUM_LAUNCH_ARGS)
