"""v1.0 RBAC — role resolution + the role/endpoint boundaries that the
migration of legacy suites didn't already cover head-on.

Roles: anon / user (reader) / admin (author) / root.
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.accounts.permissions import get_role
from apps.knowledge.models import Document, KnowledgeBase

User = get_user_model()


# ── fixtures ───────────────────────────────────────────────────────────


@pytest.fixture
def root_user(db):
    return User.objects.create_user(
        "fengfujiang", "root@ex.com", "rootpass1234",
        is_staff=True, is_superuser=True,
    )


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        "author1", "a1@ex.com", "adminpass1234", is_staff=True,
    )


@pytest.fixture
def reader_user(db):
    return User.objects.create_user("reader1", "r1@ex.com", "readerpass1234")


@pytest.fixture
def public_doc(admin_user):
    kb = KnowledgeBase.objects.create(
        owner=admin_user, name="Pub", slug="pub", visibility="public",
    )
    return Document.objects.create(
        knowledge_base=kb, title="Hello", slug="hello",
        raw_content="x", published_content="x",
        status="published", visibility="public",
    )


def client_as(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def _rows(body):
    """User list may be paginated ({results: [...]}) or a bare list."""
    return body["results"] if isinstance(body, dict) else body


# ── get_role ───────────────────────────────────────────────────────────


def test_get_role_anonymous():
    from django.contrib.auth.models import AnonymousUser
    assert get_role(AnonymousUser()) == "anon"


def test_get_role_reader(reader_user):
    assert get_role(reader_user) == "user"


def test_get_role_admin(admin_user):
    assert get_role(admin_user) == "admin"


def test_get_role_root(root_user):
    assert get_role(root_user) == "root"


# ── /me exposes role ───────────────────────────────────────────────────


@pytest.mark.parametrize("fixture,expected", [
    ("reader_user", "user"),
    ("admin_user", "admin"),
    ("root_user", "root"),
])
def test_me_returns_role(request, fixture, expected):
    user = request.getfixturevalue(fixture)
    r = client_as(user).get("/api/v1/auth/me/")
    assert r.status_code == 200
    assert r.json()["user"]["role"] == expected


# ── user-management visibility + create restriction ────────────────────


def test_admin_user_list_hides_root_and_other_admins(admin_user, root_user):
    other_admin = User.objects.create_user("author2", "a2@ex.com", "x", is_staff=True)
    reader = User.objects.create_user("plain", "p@ex.com", "x")
    r = client_as(admin_user).get("/api/v1/auth/users/")
    assert r.status_code == 200
    ids = {u["id"] for u in _rows(r.json())}
    assert reader.id in ids          # normal users visible
    assert admin_user.id in ids      # self visible
    assert root_user.id not in ids   # root hidden
    assert other_admin.id not in ids  # other admins hidden


def test_root_user_list_sees_everyone(root_user, admin_user, reader_user):
    r = client_as(root_user).get("/api/v1/auth/users/")
    assert r.status_code == 200
    ids = {u["id"] for u in _rows(r.json())}
    assert {root_user.id, admin_user.id, reader_user.id} <= ids


def test_admin_cannot_create_admin(admin_user):
    r = client_as(admin_user).post(
        "/api/v1/auth/users/",
        {"username": "nu", "password": "pw12345678", "email": "nu@ex.com", "is_staff": True},
        format="json",
    )
    assert r.status_code == 400


def test_admin_can_create_plain_user(admin_user):
    r = client_as(admin_user).post(
        "/api/v1/auth/users/",
        {"username": "nu2", "password": "pw12345678", "email": "nu2@ex.com"},
        format="json",
    )
    assert r.status_code == 201
    assert r.json()["role"] == "user"


def test_root_can_create_admin(root_user):
    r = client_as(root_user).post(
        "/api/v1/auth/users/",
        {"username": "nu3", "password": "pw12345678", "email": "nu3@ex.com", "is_staff": True},
        format="json",
    )
    assert r.status_code == 201
    assert r.json()["role"] == "admin"


def test_admin_cannot_grant_staff_via_update(admin_user, reader_user):
    r = client_as(admin_user).patch(
        f"/api/v1/auth/users/{reader_user.id}/",
        {"is_staff": True}, format="json",
    )
    assert r.status_code == 400
    reader_user.refresh_from_db()
    assert reader_user.is_staff is False


# ── reader capabilities: browse / comment / favorite public docs ───────


def test_reader_cannot_list_knowledge_bases(reader_user):
    r = client_as(reader_user).get("/api/v1/kbs/")
    # Reader owns no content pool — empty list (or forbidden), never content.
    assert r.status_code in {200, 403}
    if r.status_code == 200:
        assert r.json() == [] or r.json().get("results", []) == []


def test_reader_cannot_create_kb(reader_user):
    r = client_as(reader_user).post(
        "/api/v1/kbs/", {"name": "X", "slug": "x"}, format="json",
    )
    assert r.status_code == 403


def test_reader_can_comment_on_public_doc(reader_user, public_doc):
    r = client_as(reader_user).post(
        f"/api/v1/documents/{public_doc.id}/comments/",
        {"content": "nice"}, format="json",
    )
    assert r.status_code == 201


def test_reader_can_favorite_public_doc(reader_user, public_doc):
    r = client_as(reader_user).post(f"/api/v1/documents/{public_doc.id}/favorite/")
    assert r.status_code == 200
    assert r.json()["is_favorited"] is True
    # and it shows up in their personal favorites list
    r2 = client_as(reader_user).get("/api/v1/documents/favorites/")
    assert r2.status_code == 200
    assert any(d["id"] == public_doc.id for d in r2.json())


# ── deletion tiering: admin vs root ────────────────────────────────────


def test_admin_cannot_delete_kb_root_can(admin_user, root_user):
    kb = KnowledgeBase.objects.create(owner=admin_user, name="K", slug="k")
    assert client_as(admin_user).delete(f"/api/v1/kbs/{kb.id}/").status_code == 403
    assert client_as(root_user).delete(f"/api/v1/kbs/{kb.id}/").status_code in {200, 204}


def test_admin_can_soft_delete_document(admin_user):
    kb = KnowledgeBase.objects.create(owner=admin_user, name="K2", slug="k2")
    doc = Document.objects.create(knowledge_base=kb, title="D", slug="d", raw_content="x")
    assert client_as(admin_user).delete(f"/api/v1/documents/{doc.id}/").status_code in {200, 204}


def test_admin_cannot_empty_trash(admin_user, root_user):
    assert client_as(admin_user).post("/api/v1/trash/empty/").status_code == 403
    assert client_as(root_user).post("/api/v1/trash/empty/").status_code in {200, 204}
