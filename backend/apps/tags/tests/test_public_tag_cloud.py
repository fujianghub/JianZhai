from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient

from apps.knowledge.models import Document, KnowledgeBase
from apps.tags.models import Tag

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def owner():
    return User.objects.create_user("tagowner", "tagowner@example.com", "pass")


@pytest.fixture
def public_kb(owner):
    return KnowledgeBase.objects.create(
        owner=owner,
        name="Public KB",
        slug="public-kb",
        visibility="public",
    )


def _tag(owner, name: str) -> Tag:
    return Tag.objects.create(owner=owner, name=name, slug=name.lower())


def _doc(kb, *, slug: str, status="draft", visibility="private", title=None):
    return Document.objects.create(
        knowledge_base=kb,
        title=title or slug,
        slug=slug,
        status=status,
        visibility=visibility,
    )


@pytest.mark.django_db
def test_public_tag_cloud_excludes_draft_document(api_client, owner, public_kb):
    tag = _tag(owner, "DraftOnly")
    doc = _doc(public_kb, slug="draft-post", status="draft", visibility="public")
    doc.tags.add(tag)

    resp = api_client.get(reverse("api_v1:public-tag-cloud"))
    assert resp.status_code == 200
    ids = [t["id"] for t in resp.data]
    assert tag.id not in ids


@pytest.mark.django_db
def test_public_tag_cloud_includes_published_public_document(api_client, owner, public_kb):
    tag = _tag(owner, "Published")
    doc = _doc(
        public_kb,
        slug="live-post",
        status="published",
        visibility="public",
        title="Live Post",
    )
    doc.tags.add(tag)

    resp = api_client.get(reverse("api_v1:public-tag-cloud"))
    assert resp.status_code == 200
    row = next(t for t in resp.data if t["id"] == tag.id)
    assert row["doc_count"] == 1

    entries = api_client.get(reverse("api_v1:public-tag-entries", args=[tag.id]))
    assert entries.status_code == 200
    assert len(entries.data["posts"]) == 1
    assert entries.data["posts"][0]["slug"] == "live-post"


@pytest.mark.django_db
def test_public_tag_cloud_excludes_kb_only_tag(api_client, owner, public_kb):
    tag = _tag(owner, "KbOnly")
    public_kb.tags.add(tag)

    resp = api_client.get(reverse("api_v1:public-tag-cloud"))
    assert resp.status_code == 200
    ids = [t["id"] for t in resp.data]
    assert tag.id not in ids


@pytest.mark.django_db
def test_public_tag_cloud_doc_count_matches_entries_only_public(
    api_client, owner, public_kb
):
    tag = _tag(owner, "Mixed")
    published = _doc(
        public_kb,
        slug="pub",
        status="published",
        visibility="public",
    )
    draft = _doc(public_kb, slug="draft", status="draft", visibility="public")
    published.tags.add(tag)
    draft.tags.add(tag)

    resp = api_client.get(reverse("api_v1:public-tag-cloud"))
    row = next(t for t in resp.data if t["id"] == tag.id)
    assert row["doc_count"] == 1

    entries = api_client.get(reverse("api_v1:public-tag-entries", args=[tag.id]))
    assert len(entries.data["posts"]) == 1
