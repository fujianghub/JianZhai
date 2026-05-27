"""Regression tests: creating documents/folders may not reference another
tenant's knowledge base (cross-tenant IDOR on the create path)."""

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
def owner_a():
    return User.objects.create_user("scope_a", "scope_a@example.com", "pass")


@pytest.fixture
def owner_b():
    return User.objects.create_user("scope_b", "scope_b@example.com", "pass")


@pytest.fixture
def kb_b(owner_b):
    return KnowledgeBase.objects.create(owner=owner_b, name="KB B", slug="kb-b")


@pytest.mark.django_db
def test_cannot_create_document_in_foreign_kb(api_client, owner_a, kb_b):
    api_client.force_authenticate(user=owner_a)
    resp = api_client.post(
        reverse("api_v1:document-list"),
        {"knowledge_base": kb_b.id, "title": "Intruder", "raw_content": "x"},
        format="json",
    )
    assert resp.status_code == 400
    assert not kb_b.documents(manager="all_objects").exists()


@pytest.mark.django_db
def test_cannot_create_folder_in_foreign_kb(api_client, owner_a, kb_b):
    api_client.force_authenticate(user=owner_a)
    resp = api_client.post(
        reverse("api_v1:folder-list"),
        {"knowledge_base": kb_b.id, "name": "Intruder"},
        format="json",
    )
    assert resp.status_code == 400
    assert not Folder.objects.filter(knowledge_base=kb_b).exists()


@pytest.mark.django_db
def test_owner_can_create_in_own_kb(api_client, owner_b, kb_b):
    api_client.force_authenticate(user=owner_b)
    resp = api_client.post(
        reverse("api_v1:document-list"),
        {"knowledge_base": kb_b.id, "title": "Mine", "raw_content": "x"},
        format="json",
    )
    assert resp.status_code == 201


@pytest.mark.django_db
def test_superuser_may_create_across_tenants(api_client, owner_a, kb_b):
    owner_a.is_superuser = True
    owner_a.is_staff = True
    owner_a.save(update_fields=["is_superuser", "is_staff"])
    api_client.force_authenticate(user=owner_a)
    resp = api_client.post(
        reverse("api_v1:document-list"),
        {"knowledge_base": kb_b.id, "title": "Admin", "raw_content": "x"},
        format="json",
    )
    assert resp.status_code == 201
