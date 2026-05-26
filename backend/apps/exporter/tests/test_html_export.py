from __future__ import annotations

import pytest

from apps.exporter.scope import collect_for_scope
from apps.exporter.services import html_export
from apps.exporter.tests.conftest import make_doc

HTML_DOC = (
    "<!doctype html><html><head><style>.x{color:red}</style></head>"
    "<body><p class='x'>HTML body</p></body></html>"
)


@pytest.mark.django_db
def test_multi_doc_html_has_toc_and_panels(owner, kb):
    make_doc(kb, "a", published="# A")
    make_doc(kb, "b", published="# B")
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    html = html_export.render_html(scope)
    assert "export-toc" in html
    assert "export-doc-panel" in html
    assert "export-anthology" in html
    # Second panel starts hidden; the TOC JS toggles them.
    assert html.count("export-doc-panel") >= 2
    assert " hidden>" in html
    assert "showPanel(" in html


@pytest.mark.django_db
def test_anthology_layout_grid_and_resizable_toc(owner, kb):
    make_doc(kb, "a", published="# A")
    make_doc(kb, "b", published="# B")
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    html = html_export.render_html(scope)
    css = html.split("<style>")[1].split("</style>")[0]
    assert "export-toc-resizer" in html
    assert "grid-template-columns" in css
    assert "--export-toc-width" in css
    assert "jz-export-toc-width" in html
    assert "setTocWidth" in html
    assert "max-width: 860px" not in css


@pytest.mark.django_db
def test_kb_markdown_renders_headings_and_callout(owner, kb):
    make_doc(
        kb,
        "md-guide",
        published="## Section\n\n:::tips Hint\n\nUse tables.\n\n| A | B |\n|---|---|\n| 1 | 2 |\n",
    )
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    html = html_export.render_html(scope)
    assert "jz-markdown export-markdown" in html
    assert "<h2>" in html
    assert "jz-callout" in html
    assert "<table>" in html
    assert "\n## Section\n" not in html


@pytest.mark.django_db
def test_mixed_kb_markdown_in_iframe(owner, kb):
    make_doc(kb, "md-one", published="# Markdown doc\n\nParagraph.")
    make_doc(kb, "html-one", published=HTML_DOC)
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    html = html_export.render_html(scope)
    # Markdown panel rendered through markdown_render.
    assert "jz-markdown export-markdown" in html
    assert "Paragraph." in html
    # HTML panel embedded as a style-isolated iframe carrying its own <style>.
    assert '<iframe class="export-html-frame"' in html
    assert "srcdoc=" in html
    # srcdoc attribute values don't escape <>, so author styles survive intact.
    assert "<style>.x{color:red}</style>" in html
    assert "class='x'" in html


@pytest.mark.django_db
def test_print_mode_reveals_panels_and_flattens_html(owner, kb):
    make_doc(kb, "md-one", published="# Markdown doc\n\nParagraph.")
    make_doc(kb, "html-one", published=HTML_DOC)
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    html = html_export.render_html(scope, mode="print")
    assert "is-print" in html
    # No hidden panels and no switching script in print mode.
    assert " hidden>" not in html
    assert "showPanel(" not in html
    assert '<nav class="export-toc"' not in html
    # HTML doc flattened inline (no iframe), with its <style> extracted.
    assert "export-html-print" in html
    assert '<iframe class="export-html-frame"' not in html
    assert "<style>.x{color:red}</style>" in html


@pytest.mark.django_db
def test_single_html_doc_exported_verbatim(owner, kb, tmp_path):
    body = (
        "<!doctype html><html><head><title>Raw</title></head>"
        "<body><p id='keep'>verbatim</p></body></html>"
    )
    doc = make_doc(kb, "solo-html", published=body)
    scope = collect_for_scope(owner=owner, scope="doc", target_id=doc.id)
    path, _, _ = html_export.export(scope)
    written = path.read_text(encoding="utf-8")
    assert "<html>" in written
    assert "id='keep'" in written
    assert "export-toc" not in written


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
