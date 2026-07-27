"""多篇 print/PDF 卷首（封面 + 目录页）回归。"""
from __future__ import annotations

import pytest

from apps.exporter.scope import collect_for_scope
from apps.exporter.services import html_export
from apps.exporter.tests.conftest import make_doc
from apps.knowledge.models import KnowledgeBaseCategory


@pytest.mark.django_db
def test_print_mode_has_cover_and_toc_page(owner, kb, folder):
    cat = KnowledgeBaseCategory.objects.create(owner=owner, name="技术", slug="tech")
    kb.category = cat
    kb.save(update_fields=["category"])
    make_doc(kb, "alpha", published="one", folder=folder)
    make_doc(kb, "beta", published="two")
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    html = html_export.render_html(scope, mode="print")
    # 封面：大类 + 标题 + 篇数
    assert 'class="export-cover"' in html
    assert "技术" in html
    assert "共 2 篇" in html
    # 目录页：树形条目 + #doc-N 内链（PDF 中可点击）
    assert 'class="export-print-toc"' in html
    assert "export-toc-folder" in html
    assert 'href="#doc-' in html
    # 交互侧栏与脚本不进 print 产物（CSS 文本里仍会出现选择器，故查元素标记）
    assert '<nav class="export-toc"' not in html
    assert "<script>" not in html


@pytest.mark.django_db
def test_interactive_mode_keeps_sidebar_no_cover(owner, kb):
    make_doc(kb, "alpha", published="one")
    make_doc(kb, "beta", published="two")
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    html = html_export.render_html(scope, mode="interactive")
    assert 'class="export-cover"' not in html
    assert '<nav class="export-toc"' in html
