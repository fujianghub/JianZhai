"""Perf regression: the comment list joins the author, not one SELECT per row.

``CommentSerializer`` emits ``author`` for every comment, so without
``select_related("author")`` each row triggers its own SELECT on the user table
(N+1). This asserts the list query count is independent of the number of
comments (and their distinct authors).
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.comments.models import Comment
from apps.knowledge.models import Document, KnowledgeBase

pytestmark = pytest.mark.django_db
User = get_user_model()


def _make_doc(uname: str) -> Document:
    # Authors share the content pool, so a staff viewer can read any doc —
    # keeps the fixture free of blog-visibility setup.
    owner = User.objects.create_user(uname, f"{uname}@e.com", "pass", is_staff=True)
    kb = KnowledgeBase.objects.create(owner=owner, name="KB", slug=f"kb-{uname}")
    return Document.objects.create(knowledge_base=kb, title="D", raw_content="x")


def _seed_comments(doc: Document, n: int, prefix: str) -> None:
    # Distinct authors per comment: without the JOIN each is a separate query.
    for i in range(n):
        author = User.objects.create_user(
            f"{prefix}-c{i}", f"{prefix}-c{i}@e.com", "pass"
        )
        Comment.objects.create(document=doc, author=author, content=f"c{i}")


def _count_list_queries(doc: Document, viewer) -> int:
    client = APIClient()
    client.force_authenticate(viewer)
    with CaptureQueriesContext(connection) as ctx:
        resp = client.get(f"/api/v1/documents/{doc.id}/comments/")
    assert resp.status_code == 200
    assert len(resp.data) == doc.comments.count()
    return len(ctx.captured_queries)


def test_comment_list_query_count_constant():
    viewer = User.objects.create_user("viewer", "v@e.com", "pass", is_staff=True)

    doc_small = _make_doc("small")
    _seed_comments(doc_small, 2, "s")
    q_small = _count_list_queries(doc_small, viewer)

    doc_large = _make_doc("large")
    _seed_comments(doc_large, 12, "l")
    q_large = _count_list_queries(doc_large, viewer)

    # Query count must not grow with the number of distinct comment authors.
    assert q_large <= q_small
