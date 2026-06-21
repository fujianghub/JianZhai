from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient

from apps.knowledge.models import Document, KnowledgeBase

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def owner():
    # Author tier: trash list + restore are author actions.
    return User.objects.create_user(
        "trashowner", "trash@example.com", "pass", is_staff=True
    )


@pytest.fixture
def root():
    # Irreversible destruction (purge / empty trash) is root-only in v1.0 RBAC.
    return User.objects.create_user(
        "fengfujiang",
        "root@example.com",
        "pass",
        is_staff=True,
        is_superuser=True,
    )


@pytest.fixture
def kb(owner):
    return KnowledgeBase.objects.create(owner=owner, name="KB", slug="trash-kb")


def _doc(kb, slug: str) -> Document:
    return Document.objects.create(knowledge_base=kb, title=slug, slug=slug)


@pytest.mark.django_db
def test_trash_list_paginated(api_client, owner, kb):
    for i in range(3):
        d = _doc(kb, f"doc-{i}")
        d.soft_delete()

    api_client.force_authenticate(user=owner)
    resp = api_client.get(
        reverse("api_v1:trash-list"),
        {"doc_page": 1, "doc_page_size": 2},
    )
    assert resp.status_code == 200
    docs = resp.data["documents"]
    assert docs["count"] == 3
    assert len(docs["results"]) == 2
    assert docs["page"] == 1


@pytest.mark.django_db
def test_batch_restore_documents(api_client, owner, kb):
    d1 = _doc(kb, "r1")
    d2 = _doc(kb, "r2")
    d1.soft_delete()
    d2.soft_delete()

    api_client.force_authenticate(user=owner)
    resp = api_client.post(
        reverse("api_v1:trash-doc-batch-restore"),
        {"ids": [d1.id, d2.id]},
        format="json",
    )
    assert resp.status_code == 200
    assert set(resp.data["succeeded"]) == {d1.id, d2.id}
    assert resp.data["failed"] == []
    assert Document.objects.filter(pk__in=[d1.id, d2.id]).count() == 2


@pytest.mark.django_db
def test_batch_restore_doc_fails_when_kb_deleted(api_client, owner, kb):
    doc = _doc(kb, "orphan")
    doc.soft_delete()
    kb.soft_delete()

    api_client.force_authenticate(user=owner)
    resp = api_client.post(
        reverse("api_v1:trash-doc-batch-restore"),
        {"ids": [doc.id]},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["succeeded"] == []
    assert len(resp.data["failed"]) == 1
    assert "知识库" in resp.data["failed"][0]["detail"]


@pytest.mark.django_db
def test_batch_purge_and_empty(api_client, root, kb):
    # purge + empty_trash are root-only; KB created by `kb` fixture (any owner)
    # lives in the shared pool so root can purge it.
    d1 = _doc(kb, "p1")
    d1.soft_delete()
    kb.soft_delete()

    api_client.force_authenticate(user=root)
    purge = api_client.post(
        reverse("api_v1:trash-doc-batch-purge"),
        {"ids": [d1.id]},
        format="json",
    )
    assert purge.status_code == 200
    assert purge.data["succeeded"] == [d1.id]
    assert not Document.all_objects.filter(pk=d1.id).exists()

    empty = api_client.post(
        reverse("api_v1:trash-empty"),
        {"scope": "knowledge_bases"},
        format="json",
    )
    assert empty.status_code == 200
    assert empty.data["purged_knowledge_bases"] == 1
    assert not KnowledgeBase.all_objects.filter(pk=kb.id).exists()
