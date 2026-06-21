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
    return User.objects.create_user("owner_a", "a@example.com", "pass", is_staff=True)


@pytest.fixture
def owner_b():
    return User.objects.create_user("owner_b", "b@example.com", "pass", is_staff=True)


@pytest.fixture
def reader():
    # Non-staff reader — no authoring rights, including the backlinks surface.
    return User.objects.create_user("link_reader", "reader@example.com", "pass")


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
def test_backlinks_endpoint_is_author_only(api_client, owner_a, reader, kb_a):
    """v1.0 RBAC: backlinks is an authoring surface.

    A non-staff reader is rejected (403); an author sees the real backlinks.
    """
    target = _doc(kb_a, title="Target", slug="target")
    source = _doc(
        kb_a,
        title="Source",
        slug="source",
        raw_content=f"ref @[Target](doc:{target.id})",
    )
    sync_document_links(source.id)
    assert DocumentLink.objects.filter(source=source, target=target).exists()

    url = reverse("api_v1:document-backlinks", args=[target.id])

    # Reader → forbidden.
    api_client.force_authenticate(user=reader)
    assert api_client.get(url).status_code == 403

    # Author → sees the inbound link from the shared pool.
    api_client.force_authenticate(user=owner_a)
    resp = api_client.get(url)
    assert resp.status_code == 200
    assert [row["source"]["id"] for row in resp.data] == [source.id]
