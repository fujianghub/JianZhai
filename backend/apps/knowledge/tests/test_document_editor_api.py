from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.knowledge.models import Document, KnowledgeBase

User = pytest.importorskip("django.contrib.auth").get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def owner():
    return User.objects.create_user("editowner", "editowner@example.com", "pass")


@pytest.fixture
def kb(owner):
    return KnowledgeBase.objects.create(owner=owner, name="Edit KB", slug="edit-kb")


def _doc(kb, **kwargs) -> Document:
    defaults = {
        "knowledge_base": kb,
        "title": "Doc",
        "slug": "doc",
        "raw_content": "draft body",
        "published_content": "",
        "status": "draft",
    }
    defaults.update(kwargs)
    return Document.objects.create(**defaults)


@pytest.mark.django_db
def test_patch_raw_with_expected_version_bumps(api_client, owner, kb):
    doc = _doc(kb, raw_content="v1")
    api_client.force_authenticate(user=owner)
    url = reverse("api_v1:document-detail", args=[doc.id])

    resp = api_client.patch(
        url,
        {"raw_content": "v2", "expected_version": doc.version},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["raw_content"] == "v2"
    assert resp.data["version"] == 2


@pytest.mark.django_db
def test_patch_raw_version_conflict_returns_409(api_client, owner, kb):
    doc = _doc(kb)
    api_client.force_authenticate(user=owner)
    url = reverse("api_v1:document-detail", args=[doc.id])

    resp = api_client.patch(
        url,
        {"raw_content": "stale", "expected_version": doc.version - 1},
        format="json",
    )
    assert resp.status_code == 409
    assert resp.data["code"] == "version_conflict"
    assert resp.data["document"]["id"] == doc.id


@pytest.mark.django_db
def test_published_doc_raw_patch_does_not_overwrite_published(api_client, owner, kb):
    doc = _doc(
        kb,
        raw_content="note",
        published_content="live",
        status="published",
    )
    api_client.force_authenticate(user=owner)
    url = reverse("api_v1:document-detail", args=[doc.id])

    resp = api_client.patch(
        url,
        {"raw_content": "note edited", "expected_version": doc.version},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["raw_content"] == "note edited"
    assert resp.data["published_content"] == "live"


@pytest.mark.django_db
def test_publish_copies_raw_to_published(api_client, owner, kb):
    doc = _doc(kb, raw_content="ship me")
    api_client.force_authenticate(user=owner)

    resp = api_client.post(reverse("api_v1:document-publish", args=[doc.id]))
    assert resp.status_code == 200
    assert resp.data["status"] == "published"
    assert resp.data["published_content"] == "ship me"
    assert resp.data["version"] == 2


@pytest.mark.django_db
def test_publish_expected_version_conflict(api_client, owner, kb):
    doc = _doc(kb, raw_content="body")
    api_client.force_authenticate(user=owner)
    url = reverse("api_v1:document-publish", args=[doc.id])
    resp = api_client.post(url, {"expected_version": 0}, format="json")
    assert resp.status_code == 409
    assert resp.data["code"] == "version_conflict"


@pytest.mark.django_db
def test_sequential_patch_same_expected_version_second_fails(api_client, owner, kb):
    doc = _doc(kb, raw_content="v1")
    api_client.force_authenticate(user=owner)
    url = reverse("api_v1:document-detail", args=[doc.id])
    v = doc.version

    first = api_client.patch(url, {"raw_content": "v2", "expected_version": v}, format="json")
    assert first.status_code == 200

    second = api_client.patch(url, {"raw_content": "v3", "expected_version": v}, format="json")
    assert second.status_code == 409
    assert second.data["code"] == "version_conflict"


@pytest.mark.django_db
def test_patch_published_content_bumps_version(api_client, owner, kb):
    doc = _doc(
        kb,
        raw_content="note",
        published_content="live",
        status="published",
        version=3,
    )
    api_client.force_authenticate(user=owner)
    url = reverse("api_v1:document-update-published", args=[doc.id])

    resp = api_client.patch(
        url,
        {"published_content": "live v2", "expected_version": doc.version},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["published_content"] == "live v2"
    assert resp.data["version"] == 4


@pytest.mark.django_db
def test_patch_published_version_conflict(api_client, owner, kb):
    doc = _doc(kb, published_content="x", status="published")
    api_client.force_authenticate(user=owner)
    url = reverse("api_v1:document-update-published", args=[doc.id])

    resp = api_client.patch(
        url,
        {"published_content": "y", "expected_version": 0},
        format="json",
    )
    assert resp.status_code == 409
    assert resp.data["code"] == "version_conflict"
