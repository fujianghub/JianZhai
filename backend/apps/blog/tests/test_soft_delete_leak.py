"""Regression test: trashing a knowledge base must hide its documents from the
anonymous public blog. KB.soft_delete() does not cascade is_deleted to its
documents, so the public querysets must join on knowledge_base__is_deleted."""

from __future__ import annotations

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.knowledge.models import Document, KnowledgeBase

User = pytest.importorskip("django.contrib.auth").get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def owner():
    return User.objects.create_user("blogowner", "blogowner@example.com", "pass")


@pytest.fixture
def public_kb(owner):
    return KnowledgeBase.objects.create(
        owner=owner, name="Public KB", slug="public-kb", visibility="public"
    )


@pytest.fixture
def public_post(public_kb):
    return Document.objects.create(
        knowledge_base=public_kb,
        title="Hello",
        slug="hello",
        raw_content="body",
        published_content="body",
        status="published",
        visibility="public",
        published_at=timezone.now(),
    )


@pytest.mark.django_db
def test_public_list_hides_posts_of_trashed_kb(api_client, public_kb, public_post):
    list_url = reverse("api_v1:public-post-list")

    resp = api_client.get(list_url)
    assert resp.status_code == 200
    ids = [p["id"] for p in resp.data["results"]]
    assert public_post.id in ids

    public_kb.soft_delete()

    resp = api_client.get(list_url)
    ids = [p["id"] for p in resp.data["results"]]
    assert public_post.id not in ids


@pytest.mark.django_db
def test_public_by_id_404_for_trashed_kb(api_client, public_kb, public_post):
    public_kb.soft_delete()
    resp = api_client.get(
        reverse("api_v1:public-post-by-id", args=[public_post.id])
    )
    assert resp.status_code == 404
