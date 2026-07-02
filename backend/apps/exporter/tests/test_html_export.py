from __future__ import annotations

import re

import pytest

from apps.exporter.anthology_tree import iter_tree_documents
from apps.exporter.scope import collect_for_scope
from apps.exporter.services import html_export
from apps.exporter.tests.conftest import make_doc
from apps.knowledge.models import Folder

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
    assert "measureFrame" in html
    assert "data-srcdoc" in html
    assert "max-width: 760px" not in css.replace(" ", "")
    assert "max-width: 860px" not in css
    assert "z-index:10" in css.replace(" ", "")
    assert "export-toc-body" in html


@pytest.mark.django_db
def test_heading_numbering_flag_flows_into_export(owner, kb):
    # A document with heading_numbering=True exports with visible numbers +
    # anchors; the [TOC] marker expands to a linked heading list.
    doc = make_doc(kb, "numbered", published="[TOC]\n\n# A\n\n## B\n\n#### C\n")
    doc.heading_numbering = True
    doc.save(update_fields=["heading_numbering"])
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    html = html_export.render_html(scope)
    assert '<span class="jz-heading-num">1.1</span>' in html
    assert '<span class="jz-heading-num">1.1.1</span>' in html  # compacted h4
    assert "jz-inline-toc" in html
    assert '<span class="jz-toc-num">1</span>' in html


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
    # Headings now carry anchor ids (for in-doc TOC links) — slug of "Section".
    assert '<h2 id="section">' in html
    assert "jz-callout" in html
    assert "<table>" in html
    assert "\n## Section\n" not in html


@pytest.mark.django_db
def test_kb_markdown_table_wrapped_in_scroll_container(owner, kb):
    make_doc(
        kb,
        "md-table",
        published="| A | B |\n|---|---|\n| 1 | 2 |\n",
    )
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    html = html_export.render_html(scope)
    # 宽表格滚动容器：包裹 div 须紧贴 <table> 之前/之后（见 markdown_render）
    assert '<div class="jz-table-wrap">' in html
    assert html.index('<div class="jz-table-wrap">') < html.index("<table>")
    assert "</table>\n</div>" in html


@pytest.mark.django_db
def test_mixed_kb_tree_toc_folders_and_panel_order(owner, kb):
    root_folder = Folder.objects.create(knowledge_base=kb, name="Chapter A", order=0)
    sub_folder = Folder.objects.create(
        knowledge_base=kb, parent=root_folder, name="Section 1", order=0
    )
    root_doc = make_doc(kb, "root-md", published="# Root", folder=None, order=0)
    chapter_doc = make_doc(
        kb, "in-chapter", published="# In chapter", folder=root_folder, order=0
    )
    sub_doc = make_doc(
        kb, "html-in-sub", published=HTML_DOC, folder=sub_folder, order=0
    )
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    html = html_export.render_html(scope)

    assert "export-toc-folder" in html
    assert "Chapter A" in html
    assert "Section 1" in html

    ordered = iter_tree_documents(kb, scope.documents)
    assert [d.id for d in ordered] == [root_doc.id, chapter_doc.id, sub_doc.id]

    panel_ids = re.findall(
        r'<section class="export-doc-panel" id="doc-(\d+)"', html
    )
    assert panel_ids == [str(root_doc.id), str(chapter_doc.id), str(sub_doc.id)]


@pytest.mark.django_db
def test_selection_toc_omits_unselected_folders(owner, kb):
    # Two folders; select a doc from only one + a loose root doc. The TOC must
    # NOT list the folder that has no selected document inside it.
    kept = Folder.objects.create(knowledge_base=kb, name="Kept Folder", order=0)
    skipped = Folder.objects.create(knowledge_base=kb, name="Skipped Folder", order=1)
    loose = make_doc(kb, "loose", published="# Loose", folder=None, order=0)
    kept_doc = make_doc(kb, "kept", published="# Kept", folder=kept, order=0)
    make_doc(kb, "skipped", published="# Skipped", folder=skipped, order=0)

    scope = collect_for_scope(
        owner=owner, scope="selection", target_id=0, doc_ids=[loose.id, kept_doc.id]
    )
    html = html_export.render_html(scope)

    assert "Kept Folder" in html
    assert "Skipped Folder" not in html
    panel_ids = re.findall(r'<section class="export-doc-panel" id="doc-(\d+)"', html)
    assert panel_ids == [str(loose.id), str(kept_doc.id)]


@pytest.mark.django_db
def test_markdown_code_fence_syntax_highlight(owner, kb):
    make_doc(
        kb,
        "code-sample",
        published="```python\ndef hello():\n    return 42\n```\n",
    )
    make_doc(kb, "code-sample-2", published="# second")
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    html = html_export.render_html(scope)
    assert "hljs-keyword" in html
    assert "hljs-number" in html
    assert 'data-code-theme="one-dark-pro"' in html
    assert "hljs-keyword\">def</span>" in html
    assert "hello" in html


@pytest.mark.django_db
def test_mixed_kb_markdown_and_html_deferred_iframe(owner, kb):
    make_doc(kb, "md-one", published="# Markdown doc\n\nParagraph.")
    html_doc = make_doc(kb, "html-one", published=HTML_DOC)
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    html = html_export.render_html(scope)
    assert "jz-markdown export-markdown" in html
    assert "Paragraph." in html
    assert '<iframe class="export-html-frame"' in html
    assert "data-srcdoc=" in html
    assert 'class="export-html-embed"' not in html
    html_panel = re.search(
        rf'<section class="export-doc-panel" id="doc-{html_doc.id}"[^>]*>(.*?)</section>',
        html,
        re.S,
    )
    assert html_panel
    assert "export-doc-header" not in html_panel.group(1)
    assert "HTML body" in html_panel.group(1)


@pytest.mark.django_db
def test_html_export_body_from_attachment(settings, tmp_path, owner, kb):
    from django.core.files.uploadedfile import SimpleUploadedFile

    from apps.editor.models import Attachment
    from apps.exporter.services import common

    settings.MEDIA_ROOT = str(tmp_path)
    body = (
        "<!doctype html><html><head><title>T</title></head>"
        "<body><p>From attachment file</p></body></html>"
    )
    doc = make_doc(kb, "html-att", published="", raw="")
    Attachment.objects.create(
        document=doc,
        uploaded_by=owner,
        file=SimpleUploadedFile("page.html", body.encode(), content_type="text/html"),
        original_filename="page.html",
        kind="document",
        mime_type="text/html",
    )
    assert "From attachment file" in common.doc_export_body(doc)
    make_doc(kb, "md-pad", published="# pad")
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    html = html_export.render_html(scope)
    assert "From attachment file" in html
    assert "data-srcdoc=" in html


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
