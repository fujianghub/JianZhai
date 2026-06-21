"""Phase C 性能回归：标签列表的 document_count 不再 per-row COUNT。

旧实现 ``TagSerializer.get_document_count`` 对每个标签跑一次 ``COUNT(*)``，
标签数 = N 次额外查询。改为 ``TagViewSet`` 单次 annotate ``_doc_count`` 后，
列表查询数与标签数量无关。
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.test.utils import CaptureQueriesContext
from django.db import connection
from rest_framework.test import APIClient

from apps.knowledge.models import Document, KnowledgeBase
from apps.tags.models import Tag

pytestmark = pytest.mark.django_db
User = get_user_model()


def _setup(n_tags: int, uname: str):
    # Tag CRUD/list is an authoring surface → author tier (is_staff).
    owner = User.objects.create_user(uname, f"{uname}@e.com", "pass", is_staff=True)
    kb = KnowledgeBase.objects.create(owner=owner, name="KB", slug=f"kb-{uname}")
    doc = Document.objects.create(knowledge_base=kb, title="D", raw_content="x")
    for i in range(n_tags):
        t = Tag.objects.create(owner=owner, name=f"t{i}", slug=f"{uname}-t{i}")
        doc.tags.add(t)
    return owner


def _count_list_queries(owner) -> int:
    client = APIClient()
    client.force_authenticate(owner)
    with CaptureQueriesContext(connection) as ctx:
        resp = client.get("/api/v1/tags/")
    assert resp.status_code == 200
    rows = resp.data["results"] if isinstance(resp.data, dict) else resp.data
    # The count must be present and correct (annotation wired through).
    assert rows and all(row["document_count"] == 1 for row in rows)
    return len(ctx.captured_queries)


def test_tag_list_query_count_constant():
    q_small = _count_list_queries(_setup(2, "small"))
    q_large = _count_list_queries(_setup(12, "large"))
    # Query count must not grow with the number of tags (no per-row COUNT).
    assert q_large <= q_small
