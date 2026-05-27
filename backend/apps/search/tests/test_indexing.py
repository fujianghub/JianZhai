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
    return User.objects.create_user("searchowner", "search@example.com", "pass")


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
