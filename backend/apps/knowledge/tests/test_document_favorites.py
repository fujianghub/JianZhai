from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient

from apps.knowledge.models import Document, DocumentFavorite, KnowledgeBase
User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def owner():
    return User.objects.create_user("favowner", "favowner@example.com", "pass")


@pytest.fixture
def other():
    return User.objects.create_user("favother", "favother@example.com", "pass")


@pytest.fixture
def kb(owner):
    return KnowledgeBase.objects.create(owner=owner, name="KB", slug="fav-kb")


def _doc(kb, slug: str, title: str | None = None) -> Document:
    return Document.objects.create(
        knowledge_base=kb,
        title=title or slug,
        slug=slug,
    )


@pytest.mark.django_db
def test_favorites_list_returns_favorited_docs_ordered(api_client, owner, kb):
    d1 = _doc(kb, "doc-a", "A")
    d2 = _doc(kb, "doc-b", "B")
    DocumentFavorite.objects.create(user=owner, document=d1)
    DocumentFavorite.objects.create(user=owner, document=d2)

    api_client.force_authenticate(user=owner)
    resp = api_client.get(reverse("api_v1:document-favorites"))
    assert resp.status_code == 200
    assert len(resp.data) == 2
    assert resp.data[0]["id"] == d2.id
    assert resp.data[1]["id"] == d1.id
    assert resp.data[0]["knowledge_base"]["slug"] == "fav-kb"
    assert "favorited_at" in resp.data[0]


@pytest.mark.django_db
def test_favorites_excludes_after_unfavorite(api_client, owner, kb):
    doc = _doc(kb, "gone")
    DocumentFavorite.objects.create(user=owner, document=doc)
    api_client.force_authenticate(user=owner)

    assert len(api_client.get(reverse("api_v1:document-favorites")).data) == 1
    api_client.post(reverse("api_v1:document-favorite", args=[doc.id]))
    assert len(api_client.get(reverse("api_v1:document-favorites")).data) == 0


@pytest.mark.django_db
def test_favorites_excludes_soft_deleted_document(api_client, owner, kb):
    doc = _doc(kb, "deleted")
    DocumentFavorite.objects.create(user=owner, document=doc)
    doc.soft_delete()
    api_client.force_authenticate(user=owner)

    assert api_client.get(reverse("api_v1:document-favorites")).data == []


@pytest.mark.django_db
def test_favorites_scoped_to_owner_kb(api_client, owner, other):
    other_kb = KnowledgeBase.objects.create(owner=other, name="Other", slug="other-kb")
    doc = _doc(other_kb, "private-doc")
    DocumentFavorite.objects.create(user=owner, document=doc)

    api_client.force_authenticate(user=owner)
    assert api_client.get(reverse("api_v1:document-favorites")).data == []
