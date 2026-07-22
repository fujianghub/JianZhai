from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.comments.models import Comment
from apps.knowledge.models import Document, KnowledgeBase
from apps.search.services import update_search_vector
from apps.tags.models import DocumentTag, Tag

User = pytest.importorskip("django.contrib.auth").get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def owner():
    # Full-text search over the content pool is author-only in v1.0 RBAC.
    return User.objects.create_user(
        "searchowner", "search@example.com", "pass", is_staff=True
    )


@pytest.fixture
def kb(owner):
    return KnowledgeBase.objects.create(owner=owner, name="Search KB", slug="search-kb")


@pytest.mark.django_db
def test_search_finds_document_by_tag_name(api_client, owner, kb):
    doc = Document.objects.create(
        knowledge_base=kb,
        title="Plain",
        slug="plain",
        raw_content="unrelated body",
    )
    tag = Tag.objects.create(owner=owner, name="量子计算", slug="quantum")
    DocumentTag.objects.create(document=doc, tag=tag)
    update_search_vector(doc)

    api_client.force_authenticate(user=owner)
    resp = api_client.get(reverse("api_v1:search"), {"q": "量子"})
    assert resp.status_code == 200
    ids = [r["id"] for r in resp.data["results"]]
    assert doc.id in ids


@pytest.mark.django_db
def test_search_finds_document_by_comment(api_client, owner, kb):
    doc = Document.objects.create(
        knowledge_base=kb,
        title="Notes",
        slug="notes",
        raw_content="minimal",
    )
    Comment.objects.create(document=doc, author=owner, content="讨论 Celery 队列调优")
    update_search_vector(doc)

    api_client.force_authenticate(user=owner)
    resp = api_client.get(reverse("api_v1:search"), {"q": "Celery"})
    assert resp.status_code == 200
    ids = [r["id"] for r in resp.data["results"]]
    assert doc.id in ids


@pytest.mark.django_db
def test_math_syntax_stripped_from_index(owner, kb):
    """公式的 LaTeX 命令碎片（frac/mathbb/$…）不入索引，正文照常可搜。"""
    from apps.search.services import collect_search_text

    doc = Document.objects.create(
        knowledge_base=kb,
        title="Math Doc",
        slug="math-doc",
        raw_content=(
            "勾股定理 $a_1^2 + b^2 = c^2$ 成立。\n\n"
            "$$\n\\frac{\\partial f}{\\partial x} = \\mathbb{E}[X]\n$$\n\n"
            "价格从 5$ 涨到 10$ 不受影响。"
        ),
    )
    blob = collect_search_text(doc)
    assert "frac" not in blob
    assert "mathbb" not in blob
    assert "a_1" not in blob
    # 正文与货币写法保留
    assert "勾股定理" in blob
    assert "成立" in blob
    assert "5$" in blob and "10$" in blob


@pytest.mark.django_db
def test_backslash_delimited_math_stripped_from_index(owner, kb):
    """``\\(..\\)`` / ``\\[..\\]`` 反斜杠定界的公式同样不入索引。"""
    from apps.search.services import collect_search_text

    doc = Document.objects.create(
        knowledge_base=kb,
        title="Backslash Math",
        slug="backslash-math",
        raw_content=(
            "面积 \\(\\pi r^2\\) 如下：\n\n\\[\n\\sum_{i=1}^n \\alpha_i\n\\]\n结束"
        ),
    )
    blob = collect_search_text(doc)
    assert "alpha" not in blob
    assert "sum_" not in blob
    assert "pi r^2" not in blob
    assert "面积" in blob
    assert "结束" in blob
