from __future__ import annotations

import zipfile
from io import BytesIO

import pytest

from apps.exporter.scope import collect_for_scope
from apps.exporter.services import static_site
from apps.exporter.tests.conftest import make_doc


def _zip_contents(path):
    with zipfile.ZipFile(BytesIO(path.read_bytes())) as zf:
        return {n: zf.read(n).decode("utf-8", errors="ignore") for n in zf.namelist()}


@pytest.mark.django_db
def test_static_site_uses_published_content(owner, kb):
    make_doc(kb, "draft", raw="RAW ONLY", status="draft")
    make_doc(kb, "live", raw="raw", published="PUBLISHED", status="published")
    scope = collect_for_scope(
        owner=owner, scope="kb", target_id=kb.id, only_published=True
    )
    path, _, _ = static_site.export(scope)
    contents = _zip_contents(path)
    bodies = "".join(v for n, v in contents.items() if n.endswith(".html"))
    assert "PUBLISHED" in bodies
    assert "RAW ONLY" not in bodies


@pytest.mark.django_db
def test_static_site_never_falls_back_to_raw(owner, kb):
    """status=published 但 published_content 为空 → 宁可出 stub 站，也不泄漏 raw。"""
    make_doc(kb, "hollow", raw="SECRET DRAFT", published="", status="published")
    scope = collect_for_scope(
        owner=owner, scope="kb", target_id=kb.id, only_published=True
    )
    path, _, _ = static_site.export(scope)
    contents = _zip_contents(path)
    all_text = "".join(contents.values())
    assert "SECRET DRAFT" not in all_text
    assert "index.html" in contents  # stub site still generated


@pytest.mark.django_db
def test_static_site_feed_uses_published_only(owner, kb):
    make_doc(
        kb, "live", raw="RAW SECRET", published="published body text", status="published"
    )
    scope = collect_for_scope(
        owner=owner, scope="kb", target_id=kb.id, only_published=True
    )
    path, _, _ = static_site.export(scope)
    contents = _zip_contents(path)
    assert "RAW SECRET" not in contents["feed.xml"]
    assert "published body text" in contents["feed.xml"]
    assert "<guid" in contents["feed.xml"]


@pytest.mark.django_db
def test_static_site_search_js_has_no_innerhtml_injection(owner, kb):
    """搜索结果必须走 textContent 构建——doc.title 是作者内容，禁止拼 innerHTML。"""
    assert ".innerHTML" not in static_site.SEARCH_JS
    assert "textContent" in static_site.SEARCH_JS


@pytest.mark.django_db
def test_static_site_shared_css_and_tree_nav(owner, kb, folder):
    make_doc(kb, "a", published="alpha", status="published", folder=folder)
    make_doc(kb, "b", published="beta", status="published")
    scope = collect_for_scope(
        owner=owner, scope="kb", target_id=kb.id, only_published=True
    )
    path, _, _ = static_site.export(scope)
    contents = _zip_contents(path)
    # CSS 抽成共享文件，页面用 <link> 引用而非每页内联
    assert "style.css" in contents
    page = next(v for n, v in contents.items() if n.endswith(".html") and n != "index.html")
    assert '<link rel="stylesheet" href="style.css">' in page
    # 导航含文件夹层级条目
    assert "export-toc-folder" in contents["index.html"]
    assert "Notes" in contents["index.html"]


@pytest.mark.django_db
def test_static_site_sitemap_absolute_urls(owner, kb, settings):
    settings.SITE_PUBLIC_URL = "https://example.com"
    make_doc(kb, "live", published="body", status="published")
    scope = collect_for_scope(
        owner=owner, scope="kb", target_id=kb.id, only_published=True
    )
    path, _, _ = static_site.export(scope)
    contents = _zip_contents(path)
    assert "https://example.com/index.html" in contents["sitemap.xml"]
    assert "https://example.com/live-" in contents["sitemap.xml"]


@pytest.mark.django_db
def test_static_site_doc_scope_respects_only_published(owner, kb):
    from apps.knowledge.models import Document

    make_doc(kb, "draft-doc", raw="DRAFT TEXT", status="draft")
    doc = Document.objects.get(knowledge_base=kb, slug="draft-doc")
    scope = collect_for_scope(
        owner=owner, scope="doc", target_id=doc.id, only_published=True
    )
    assert scope.documents == []
