"""Per-user reading whitelist (``ReadGrant``): model constraints + user API.

Covers the DB-level exactly-one-target guarantee, creating/replacing/clearing
grants through the staff-gated user endpoints, the staff-rejection rule, and
the read-side brief payload. Visibility enforcement lives in
``apps/knowledge/tests/test_read_grants_visibility.py``.
"""

from __future__ import annotations

import pytest
from django.db import IntegrityError, transaction
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import ReadGrant
from apps.knowledge.models import Document, Folder, KnowledgeBase

User = pytest.importorskip("django.contrib.auth").get_user_model()


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def author():
    return User.objects.create_user("staff1", "staff1@e.com", "pass", is_staff=True)


@pytest.fixture
def reader():
    return User.objects.create_user("reader1", "reader1@e.com", "pass")


@pytest.fixture
def kb(author):
    return KnowledgeBase.objects.create(
        owner=author, name="KB", slug="kb", visibility="public"
    )


@pytest.fixture
def folder(kb):
    return Folder.objects.create(knowledge_base=kb, name="F1")


@pytest.fixture
def doc(kb):
    return Document.objects.create(
        knowledge_base=kb, title="Doc", slug="doc", raw_content="x"
    )


# ── model constraints ──────────────────────────────────────────────────────

@pytest.mark.django_db
def test_constraint_rejects_zero_targets(reader):
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            ReadGrant.objects.create(user=reader)


@pytest.mark.django_db
def test_constraint_rejects_two_targets(reader, kb, doc):
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            ReadGrant.objects.create(user=reader, knowledge_base=kb, document=doc)


@pytest.mark.django_db
def test_constraint_rejects_duplicate_same_target(reader, kb):
    ReadGrant.objects.create(user=reader, knowledge_base=kb)
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            ReadGrant.objects.create(user=reader, knowledge_base=kb)


# ── user API: create / replace / clear ─────────────────────────────────────

@pytest.mark.django_db
def test_create_user_with_grants(api, author, kb, folder):
    api.force_authenticate(user=author)
    resp = api.post(
        reverse("api_v1:user-list"),
        {
            "username": "limited",
            "password": "secretpass",
            "email": "limited@e.com",
            "read_grant_items": [{"kb_id": kb.id}, {"folder_id": folder.id}],
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    u = User.objects.get(username="limited")
    assert u.read_grants.count() == 2
    types = sorted(g["type"] for g in resp.data["read_grants"])
    assert types == ["folder", "kb"]


@pytest.mark.django_db
def test_patch_replaces_and_empty_list_clears(api, author, reader, kb, doc):
    api.force_authenticate(user=author)
    url = reverse("api_v1:user-detail", args=[reader.id])

    resp = api.patch(url, {"read_grant_items": [{"kb_id": kb.id}]}, format="json")
    assert resp.status_code == 200, resp.data
    assert [g["type"] for g in resp.data["read_grants"]] == ["kb"]

    # Full replacement — the kb grant is swapped for a document grant.
    resp = api.patch(url, {"read_grant_items": [{"document_id": doc.id}]}, format="json")
    assert resp.status_code == 200
    grants = resp.data["read_grants"]
    assert [g["type"] for g in grants] == ["document"]
    assert grants[0]["kb_name"] == kb.name

    # Omitting the field leaves grants untouched.
    resp = api.patch(url, {"email": "reader1@e.com"}, format="json")
    assert resp.status_code == 200
    assert len(resp.data["read_grants"]) == 1

    # Empty list clears back to unrestricted.
    resp = api.patch(url, {"read_grant_items": []}, format="json")
    assert resp.status_code == 200
    assert resp.data["read_grants"] == []
    assert reader.read_grants.count() == 0


@pytest.mark.django_db
def test_duplicate_items_in_payload_are_deduped(api, author, reader, kb):
    api.force_authenticate(user=author)
    resp = api.patch(
        reverse("api_v1:user-detail", args=[reader.id]),
        {"read_grant_items": [{"kb_id": kb.id}, {"kb_id": kb.id}]},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert reader.read_grants.count() == 1


# ── validation guards ──────────────────────────────────────────────────────

@pytest.mark.django_db
def test_rejects_item_with_two_keys(api, author, reader, kb, doc):
    api.force_authenticate(user=author)
    resp = api.patch(
        reverse("api_v1:user-detail", args=[reader.id]),
        {"read_grant_items": [{"kb_id": kb.id, "document_id": doc.id}]},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_rejects_grants_on_staff_user(api, author, kb):
    """Authors bypass reader filtering — a grant on them is an illusion."""
    other_staff = User.objects.create_user(
        "staff2", "staff2@e.com", "pass", is_staff=True
    )
    root = User.objects.create_superuser("fengfujiang", "root@e.com", "pass")
    api.force_authenticate(user=root)
    resp = api.patch(
        reverse("api_v1:user-detail", args=[other_staff.id]),
        {"read_grant_items": [{"kb_id": kb.id}]},
        format="json",
    )
    assert resp.status_code == 400
    # Creating a staff user with grants in one shot is rejected too.
    resp = api.post(
        reverse("api_v1:user-list"),
        {
            "username": "staffnew",
            "password": "secretpass",
            "email": "staffnew@e.com",
            "is_staff": True,
            "read_grant_items": [{"kb_id": kb.id}],
        },
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_rejects_soft_deleted_targets(api, author, reader, kb, folder, doc):
    api.force_authenticate(user=author)
    url = reverse("api_v1:user-detail", args=[reader.id])
    folder.soft_delete()
    resp = api.patch(url, {"read_grant_items": [{"folder_id": folder.id}]}, format="json")
    assert resp.status_code == 400
    doc.refresh_from_db()
    if not doc.is_deleted:
        doc.soft_delete()
    resp = api.patch(url, {"read_grant_items": [{"document_id": doc.id}]}, format="json")
    assert resp.status_code == 400


# ── read-side brief ────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_read_side_marks_deleted_targets(api, author, reader, kb, doc):
    ReadGrant.objects.create(user=reader, document=doc)
    doc.soft_delete()
    api.force_authenticate(user=author)
    resp = api.get(reverse("api_v1:user-detail", args=[reader.id]))
    assert resp.status_code == 200
    grants = resp.data["read_grants"]
    assert len(grants) == 1
    assert grants[0]["type"] == "document"
    assert "已删除" in grants[0]["name"]
