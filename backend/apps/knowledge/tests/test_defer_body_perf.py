"""Phase A 性能回归：列表/树接口 ``.defer()`` 大正文字段后行为不变。

核心保证：
1. ``DocumentListSerializer`` / ``build_tree`` 不再把 ``raw_content`` /
   ``published_content`` / ``search_vector`` 取进结果集（用 ``query.deferred_loading``
   断言），但读 ``doc_format`` 不会触发 per-row 反延迟查询。
2. 无附件、正文为 HTML 的文档仍被 ``_fmt_head`` 注解正确识别为 ``html``。
3. 无附件、正文为 Markdown 的文档识别为 ``markdown``。
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.test.utils import CaptureQueriesContext
from django.db import connection

from apps.knowledge.models import Document, KnowledgeBase
from apps.knowledge.serializers import DocumentListSerializer, build_tree, detect_doc_format

pytestmark = pytest.mark.django_db


def _mk_kb(user):
    return KnowledgeBase.objects.create(name="KB", owner=user)


def _user():
    return get_user_model().objects.create_user(username="u", password="x")


def test_list_serializer_defers_body_but_keeps_format():
    user = _user()
    kb = _mk_kb(user)
    html_doc = Document.objects.create(
        knowledge_base=kb,
        title="HTML",
        raw_content="<!DOCTYPE html><html><body>hi</body></html>",
    )
    md_doc = Document.objects.create(
        knowledge_base=kb, title="MD", raw_content="# 标题\n正文"
    )

    # Replicate the viewset's list queryset (defer + annotate + attachment prefetch).
    from apps.editor.services.derived import derived_prefetch
    from apps.knowledge.serializers import _FMT_HEAD_EXPR
    from apps.knowledge.views import _PRIMARY_ATTACHMENT_PREFETCH

    qs = (
        Document.objects.filter(knowledge_base=kb)
        .defer("raw_content", "published_content", "search_vector")
        .annotate(_fmt_head=_FMT_HEAD_EXPR)
        .prefetch_related(_PRIMARY_ATTACHMENT_PREFETCH, derived_prefetch())
        .order_by("id")
    )

    with CaptureQueriesContext(connection) as ctx:
        data = DocumentListSerializer(qs, many=True).data
    # Docs SELECT + attachment prefetch + derived-file prefetch (poster_url,
    # 2026-09-08) — no per-row un-defer of the body, no per-row poster lookup.
    assert len(ctx.captured_queries) == 3
    main_sql = ctx.captured_queries[0]["sql"]
    # search_vector appears in no annotation, so it's fully absent from the SELECT.
    # (raw_content/published_content appear only wrapped in SUBSTRING/COALESCE for
    # the bounded 4096-char _fmt_head, never as full standalone columns.)
    assert '"knowledge_document"."search_vector"' not in main_sql
    assert "AS \"_fmt_head\"" in main_sql

    # All three big columns are deferred on the instantiated models — reading
    # them would issue a fresh query, confirming they weren't transferred whole.
    deferred = list(qs)[0].get_deferred_fields()
    assert {"raw_content", "published_content", "search_vector"} <= deferred

    by_title = {d["title"]: d for d in data}
    assert by_title["HTML"]["doc_format"] == "html"
    assert by_title["MD"]["doc_format"] == "markdown"


def test_build_tree_classifies_no_attachment_html():
    user = _user()
    kb = _mk_kb(user)
    Document.objects.create(
        knowledge_base=kb,
        title="HtmlDoc",
        raw_content="<html><head></head><body>x</body></html>",
    )
    Document.objects.create(knowledge_base=kb, title="MdDoc", raw_content="正文")

    tree = build_tree(kb, user=user)
    docs = {d["title"]: d for d in tree["documents"]}
    assert docs["HtmlDoc"]["doc_format"] == "html"
    assert docs["MdDoc"]["doc_format"] == "markdown"


def test_fmt_head_prefers_raw_then_published():
    """``_fmt_head`` mirrors the old ``raw_content or published_content`` rule."""
    user = _user()
    kb = _mk_kb(user)
    # Empty raw_content, HTML only in published_content → still html.
    doc = Document.objects.create(
        knowledge_base=kb,
        title="PubHtml",
        raw_content="",
        published_content="<!doctype html><html></html>",
    )
    # Fetched fresh (no annotation) falls back to the columns directly.
    fresh = Document.objects.get(pk=doc.pk)
    assert detect_doc_format(fresh) == "html"
