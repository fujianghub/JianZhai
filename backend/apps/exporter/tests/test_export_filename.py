"""默认导出文件名规则：大类-知识库-[标题|文件夹-N篇|N篇]-时间(-tag).ext"""
from __future__ import annotations

import re

import pytest

from apps.exporter.scope import collect_for_scope
from apps.exporter.services.common import build_export_filename
from apps.exporter.tests.conftest import make_doc
from apps.knowledge.models import KnowledgeBaseCategory

TS = r"\d{4}-\d{2}-\d{2}-\d{2}-\d{2}"


@pytest.fixture
def category(owner, kb):
    cat = KnowledgeBaseCategory.objects.create(owner=owner, name="技术", slug="tech")
    kb.category = cat
    kb.save(update_fields=["category"])
    return cat


@pytest.mark.django_db
def test_doc_scope_filename(owner, kb, category):
    doc = make_doc(kb, "guide", published="body")
    scope = collect_for_scope(owner=owner, scope="doc", target_id=doc.id)
    name = build_export_filename(scope, ".md")
    assert re.fullmatch(rf"技术-Export KB-guide-{TS}\.md", name)


@pytest.mark.django_db
def test_doc_scope_without_category_omits_segment(owner, kb):
    doc = make_doc(kb, "guide", published="body")
    scope = collect_for_scope(owner=owner, scope="doc", target_id=doc.id)
    name = build_export_filename(scope, ".pdf")
    assert re.fullmatch(rf"Export KB-guide-{TS}\.pdf", name)


@pytest.mark.django_db
def test_kb_scope_filename(owner, kb, category):
    make_doc(kb, "a")
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    name = build_export_filename(scope, ".zip")
    assert re.fullmatch(rf"技术-Export KB-{TS}\.zip", name)


@pytest.mark.django_db
def test_kb_scope_with_single_doc_keeps_kb_shape(owner, kb, category):
    # 整库仅 1 篇时命名仍按 kb 形态，不退化为单篇命名
    make_doc(kb, "only-one")
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    name = build_export_filename(scope, ".md")
    assert "only-one" not in name


@pytest.mark.django_db
def test_folder_scope_filename(owner, kb, folder, category):
    make_doc(kb, "a", folder=folder)
    make_doc(kb, "b", folder=folder)
    scope = collect_for_scope(owner=owner, scope="folder", target_id=folder.id)
    name = build_export_filename(scope, ".zip")
    assert re.fullmatch(rf"技术-Export KB-Notes-2篇-{TS}\.zip", name)


@pytest.mark.django_db
def test_selection_scope_filename(owner, kb, category):
    d1 = make_doc(kb, "a")
    d2 = make_doc(kb, "b")
    scope = collect_for_scope(
        owner=owner, scope="selection", target_id=0, doc_ids=[d1.id, d2.id]
    )
    name = build_export_filename(scope, ".docx")
    assert re.fullmatch(rf"技术-Export KB-2篇-{TS}\.docx", name)


@pytest.mark.django_db
def test_selection_of_single_doc_uses_doc_title(owner, kb, category):
    # 批量勾选但恰好只选 1 篇 = 单篇导出，携带文档标题而非「1篇」
    doc = make_doc(kb, "only-pick")
    scope = collect_for_scope(
        owner=owner, scope="selection", target_id=0, doc_ids=[doc.id]
    )
    name = build_export_filename(scope, ".pdf")
    assert re.fullmatch(rf"技术-Export KB-only-pick-{TS}\.pdf", name)


@pytest.mark.django_db
def test_site_tag_appended_after_timestamp(owner, kb, category):
    make_doc(kb, "a")
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    name = build_export_filename(scope, ".zip", tag="site")
    assert re.fullmatch(rf"技术-Export KB-{TS}-site\.zip", name)


@pytest.mark.django_db
def test_long_segments_truncated_within_filename_limit(owner, kb, category):
    doc = make_doc(kb, "t", published="body")
    doc.title = "长" * 200  # Document.title 列上限
    doc.save(update_fields=["title"])
    scope = collect_for_scope(owner=owner, scope="doc", target_id=doc.id)
    name = build_export_filename(scope, ".md")
    # ExportTask.filename max_length=255；单段截到 60
    assert len(name) <= 255
    assert "长" * 60 in name
    assert "长" * 61 not in name
    assert name.endswith(".md")


@pytest.mark.django_db
def test_illegal_characters_sanitized(owner, kb, category):
    doc = make_doc(kb, "t", published="body")
    doc.title = 'a/b\\c:d*e?f"g<h>i|j'
    doc.save(update_fields=["title"])
    scope = collect_for_scope(owner=owner, scope="doc", target_id=doc.id)
    name = build_export_filename(scope, ".md")
    assert not set('/\\:*?"<>|') & set(name)
