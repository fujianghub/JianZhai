from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.knowledge.models import Document, KnowledgeBase
from apps.linking.models import DocumentLink
from apps.linking.tasks import sync_document_links

User = pytest.importorskip("django.contrib.auth").get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def owner_a():
    return User.objects.create_user("owner_a", "a@example.com", "pass")


@pytest.fixture
def owner_b():
    return User.objects.create_user("owner_b", "b@example.com", "pass")


@pytest.fixture
def kb_a(owner_a):
    return KnowledgeBase.objects.create(owner=owner_a, name="KB A", slug="kb-a")


@pytest.fixture
def kb_b(owner_b):
    return KnowledgeBase.objects.create(owner=owner_b, name="KB B", slug="kb-b")


def _doc(kb, **kwargs) -> Document:
    defaults = {
        "knowledge_base": kb,
        "title": "Doc",
        "slug": "doc",
        "raw_content": "",
    }
    defaults.update(kwargs)
    return Document.objects.create(**defaults)


@pytest.mark.django_db
def test_sync_rejects_cross_owner_mention(owner_a, owner_b, kb_a, kb_b):
    foreign = _doc(kb_b, title="Secret", slug="secret")
    source = _doc(
        kb_a,
        title="Source",
        slug="source",
        raw_content=f"See @[Secret](doc:{foreign.id})",
    )
    sync_document_links(source.id)
    assert not DocumentLink.objects.filter(source=source).exists()


@pytest.mark.django_db
def test_sync_allows_same_owner_mention(owner_a, kb_a):
    target = _doc(kb_a, title="Target", slug="target")
    source = _doc(
        kb_a,
        title="Source",
        slug="source",
        raw_content=f"See @[Target](doc:{target.id})",
    )
    sync_document_links(source.id)
    link = DocumentLink.objects.get(source=source)
    assert link.target_id == target.id


@pytest.mark.django_db
def test_sync_skips_soft_deleted_target(owner_a, kb_a):
    target = _doc(kb_a, title="Gone", slug="gone", is_deleted=True)
    source = _doc(
        kb_a,
        title="Source",
        slug="source",
        raw_content=f"See @[Gone](doc:{target.id})",
    )
    sync_document_links(source.id)
    assert not DocumentLink.objects.filter(source=source).exists()


@pytest.mark.django_db
def test_backlinks_no_cross_tenant_leak(api_client, owner_a, owner_b, kb_a, kb_b):
    """Cross-owner links must not appear in backlinks for the foreign doc."""
    foreign = _doc(kb_b, title="Foreign", slug="foreign")
    source = _doc(
        kb_a,
        title="Source",
        slug="source",
        raw_content=f"ref @[Foreign](doc:{foreign.id})",
    )
    sync_document_links(source.id)
    assert not DocumentLink.objects.filter(source=source, target=foreign).exists()

    api_client.force_authenticate(user=owner_b)
    url = reverse("api_v1:document-backlinks", args=[foreign.id])
    resp = api_client.get(url)
    assert resp.status_code == 200
    assert resp.data == []
