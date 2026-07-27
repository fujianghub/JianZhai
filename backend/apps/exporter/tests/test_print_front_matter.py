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
def test_front_matter_toc_nests_doc_headings(owner, kb):
    """卷首目录页：每篇文档条目下嵌套其 h1–h3 标题子条目（带前缀锚点可点击）。"""
    from apps.knowledge.models import Document

    make_doc(kb, "alpha", published="# 甲章\n\n## 甲节\n\n#### 太深不进卷首\n\n正文")
    make_doc(kb, "beta", published="# 乙章\n\n正文")
    doc_a = Document.objects.get(knowledge_base=kb, slug="alpha")
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    html = html_export.render_html(scope, mode="print")
    toc_page = html.split('class="export-print-toc"')[1].split("</section>")[0]
    assert 'class="export-toc-heading"' in toc_page
    assert f'href="#d{doc_a.id}-' in toc_page
    assert "甲章" in toc_page and "甲节" in toc_page
    assert "太深不进卷首" not in toc_page  # h4 不进卷首目录页


@pytest.mark.django_db
def test_per_doc_toc_nav_in_print(owner, kb):
    """print 模式每篇开头有「本篇目录」；正文自带 [TOC] 的文档不重复注入。"""
    make_doc(kb, "with-headings", published="# 一\n\n## 二\n\n正文")
    make_doc(kb, "own-toc", published="[TOC]\n\n# 自带\n\n正文")
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    html = html_export.render_html(scope, mode="print")
    assert html.count('class="export-doc-toc"') == 1  # 仅无 [TOC] 的那篇
    assert "本篇目录" in html
    # interactive 不注入
    interactive = html_export.render_html(scope, mode="interactive")
    assert 'class="export-doc-toc"' not in interactive


@pytest.mark.django_db
def test_anchor_prefix_dedupes_same_heading_across_docs(owner, kb):
    """两篇文档同名标题 → 前缀锚点各自唯一（此前重复 id 目录跳错篇）。"""
    from apps.knowledge.models import Document

    make_doc(kb, "one", published="# 介绍\n\nA")
    make_doc(kb, "two", published="# 介绍\n\nB")
    d1 = Document.objects.get(knowledge_base=kb, slug="one")
    d2 = Document.objects.get(knowledge_base=kb, slug="two")
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    html = html_export.render_html(scope, mode="print")
    assert f'id="d{d1.id}-介绍"' in html
    assert f'id="d{d2.id}-介绍"' in html


@pytest.mark.django_db
def test_print_heading_semantics_for_bookmarks(owner, kb):
    """书签层级语义：封面标题非 heading、目录页标题 h1、正文标题降一级。"""
    make_doc(kb, "alpha", published="# 章标题\n\n正文")
    make_doc(kb, "beta", published="内容")
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    html = html_export.render_html(scope, mode="print")
    assert '<div class="export-cover-title">' in html  # 封面不进书签树
    assert '<h1 class="export-print-toc-title">' in html  # 「目录」是顶层书签
    assert "<h2" in html and "章标题" in html  # 正文 h1 → h2 嵌套于文档标题下
    assert '<h1 id="' not in html  # 带锚点的正文标题没有停留在 h1
    # interactive 不降级
    interactive = html_export.render_html(scope, mode="interactive")
    assert '<h1 id="' in interactive


@pytest.mark.django_db
def test_interactive_mode_keeps_sidebar_no_cover(owner, kb):
    make_doc(kb, "alpha", published="one")
    make_doc(kb, "beta", published="two")
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    html = html_export.render_html(scope, mode="interactive")
    assert 'class="export-cover"' not in html
    assert '<nav class="export-toc"' in html
