"""RBAC v1.0 create-path access tests.

Cross-tenant (author↔author) isolation has been **deliberately removed**:
authoring content is one shared pool gated by ``is_staff`` (the "author"
tier). These tests now verify the new boundary:

  - a reader (non-staff authenticated user) may not create any KB content → 403;
  - any author (``is_staff``) may create in any KB (shared pool), even one
    whose ``owner`` FK points at a different author;
  - root/superuser may likewise create across the pool.
"""

from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.knowledge.models import Folder, KnowledgeBase

User = pytest.importorskip("django.contrib.auth").get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def reader():
    # Plain authenticated reader — no authoring rights.
    return User.objects.create_user("scope_reader", "scope_reader@example.com", "pass")


@pytest.fixture
def author_a():
    return User.objects.create_user(
        "scope_a", "scope_a@example.com", "pass", is_staff=True
    )


@pytest.fixture
def author_b():
    return User.objects.create_user(
        "scope_b", "scope_b@example.com", "pass", is_staff=True
    )


@pytest.fixture
def kb_b(author_b):
    return KnowledgeBase.objects.create(owner=author_b, name="KB B", slug="kb-b")


@pytest.mark.django_db
def test_reader_cannot_create_document(api_client, reader, kb_b):
    """A non-staff reader has no authoring rights → 403, nothing created."""
    api_client.force_authenticate(user=reader)
    resp = api_client.post(
        reverse("api_v1:document-list"),
        {"knowledge_base": kb_b.id, "title": "Intruder", "raw_content": "x"},
        format="json",
    )
    assert resp.status_code == 403
    assert not kb_b.documents(manager="all_objects").exists()


@pytest.mark.django_db
def test_reader_cannot_create_folder(api_client, reader, kb_b):
    api_client.force_authenticate(user=reader)
    resp = api_client.post(
        reverse("api_v1:folder-list"),
        {"knowledge_base": kb_b.id, "name": "Intruder"},
        format="json",
    )
    assert resp.status_code == 403
    assert not Folder.objects.filter(knowledge_base=kb_b).exists()


@pytest.mark.django_db
def test_author_can_create_in_shared_pool(api_client, author_a, kb_b):
    """Authors share one content pool: author_a may create in author_b's KB."""
    api_client.force_authenticate(user=author_a)
    resp = api_client.post(
        reverse("api_v1:document-list"),
        {"knowledge_base": kb_b.id, "title": "Shared", "raw_content": "x"},
        format="json",
    )
    assert resp.status_code == 201


@pytest.mark.django_db
def test_author_can_create_in_own_kb(api_client, author_b, kb_b):
    api_client.force_authenticate(user=author_b)
    resp = api_client.post(
        reverse("api_v1:document-list"),
        {"knowledge_base": kb_b.id, "title": "Mine", "raw_content": "x"},
        format="json",
    )
    assert resp.status_code == 201


@pytest.mark.django_db
def test_superuser_may_create_across_tenants(api_client, reader, kb_b):
    reader.is_superuser = True
    reader.is_staff = True
    reader.save(update_fields=["is_superuser", "is_staff"])
    api_client.force_authenticate(user=reader)
    resp = api_client.post(
        reverse("api_v1:document-list"),
        {"knowledge_base": kb_b.id, "title": "Admin", "raw_content": "x"},
        format="json",
    )
    assert resp.status_code == 201
