"""Tests for v0.9.9 user management: root admin vs other superusers, email
+ self-service password/email/username rotation, and disable/enable/reset.
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.permissions import can_manage_user, is_root_admin

User = get_user_model()


@pytest.fixture
def root_user(db):
    return User.objects.create_user(
        username="fengfujiang", password="rootpass1234", email="root@example.com",
        is_staff=True, is_superuser=True,
    )


@pytest.fixture
def admin_user(db):
    # v1.0 RBAC: an "admin" is the author tier — is_staff, NOT is_superuser.
    # Only the single root admin is a superuser.
    return User.objects.create_user(
        username="admin", password="adminpass1234", email="admin@example.com",
        is_staff=True, is_superuser=False,
    )


@pytest.fixture
def staff_user(db):
    return User.objects.create_user(
        username="staff1", password="staffpass1234", email="staff@example.com",
        is_staff=True,
    )


@pytest.fixture
def member_user(db):
    return User.objects.create_user(
        username="member", password="memberpass1234", email="m@example.com",
    )


def client_as(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


# ── is_root_admin / can_manage_user logic ──────────────────────────────


def test_is_root_admin_recognises_fengfujiang(root_user):
    assert is_root_admin(root_user) is True


def test_is_root_admin_rejects_other_superusers(admin_user):
    assert is_root_admin(admin_user) is False


def test_is_root_admin_rejects_non_superuser_named_fengfujiang(db):
    """A regular user named fengfujiang must NOT count as root — both
    username AND is_superuser are required."""
    u = User.objects.create_user(username="fengfujiang", password="x")
    assert is_root_admin(u) is False


def test_can_manage_user_blocks_self(root_user):
    allowed, reason = can_manage_user(root_user, root_user)
    assert not allowed
    assert "自己" in reason


def test_root_can_manage_other_superuser(root_user, admin_user):
    allowed, _ = can_manage_user(root_user, admin_user)
    assert allowed


def test_admin_cannot_manage_root(admin_user, root_user):
    allowed, reason = can_manage_user(admin_user, root_user)
    assert not allowed
    assert "普通用户" in reason


def test_admin_cannot_manage_other_admin(admin_user, db):
    """A non-root admin may manage ONLY plain normal users — not peers."""
    other_admin = User.objects.create_user(
        username="admin2", password="x", is_staff=True, is_superuser=False,
    )
    allowed, reason = can_manage_user(admin_user, other_admin)
    assert not allowed
    assert "普通用户" in reason


def test_admin_can_manage_regular_user(admin_user, member_user):
    allowed, _ = can_manage_user(admin_user, member_user)
    assert allowed


def test_non_staff_cannot_manage_anyone(member_user, root_user):
    allowed, reason = can_manage_user(member_user, root_user)
    assert not allowed


# ── Disable / enable endpoints ─────────────────────────────────────────


def test_root_can_disable_admin(root_user, admin_user):
    c = client_as(root_user)
    r = c.post(f"/api/v1/auth/users/{admin_user.id}/disable/")
    assert r.status_code == 200
    admin_user.refresh_from_db()
    assert admin_user.is_active is False


def test_admin_cannot_disable_root(admin_user, root_user):
    c = client_as(admin_user)
    r = c.post(f"/api/v1/auth/users/{root_user.id}/disable/")
    # Root is invisible to a non-root admin (get_queryset hides it) → 404,
    # which is a stronger guarantee than the old 403.
    assert r.status_code in {403, 404}


def test_admin_cannot_disable_other_admin(admin_user, db):
    """A non-root admin can't disable another admin — they aren't even
    visible in the admin's user list."""
    other_admin = User.objects.create_user(
        username="other_admin", password="x", is_staff=True, is_superuser=False,
    )
    c = client_as(admin_user)
    r = c.post(f"/api/v1/auth/users/{other_admin.id}/disable/")
    assert r.status_code in {403, 404}
    other_admin.refresh_from_db()
    assert other_admin.is_active is True


def test_admin_can_disable_member(admin_user, member_user):
    c = client_as(admin_user)
    r = c.post(f"/api/v1/auth/users/{member_user.id}/disable/")
    assert r.status_code == 200
    member_user.refresh_from_db()
    assert member_user.is_active is False


def test_enable_round_trips(root_user, admin_user):
    admin_user.is_active = False
    admin_user.save()
    c = client_as(root_user)
    r = c.post(f"/api/v1/auth/users/{admin_user.id}/enable/")
    assert r.status_code == 200
    admin_user.refresh_from_db()
    assert admin_user.is_active is True


def test_root_cannot_be_disabled_by_anyone(admin_user, root_user):
    """Even via crafted API, root must stay enabled."""
    c = client_as(admin_user)
    r = c.post(f"/api/v1/auth/users/{root_user.id}/disable/")
    assert r.status_code in {400, 403, 404}
    root_user.refresh_from_db()
    assert root_user.is_active is True


def test_member_cannot_disable_anyone(member_user, staff_user):
    c = client_as(member_user)
    r = c.post(f"/api/v1/auth/users/{staff_user.id}/disable/")
    assert r.status_code == 403


# ── Reset password ─────────────────────────────────────────────────────


def test_admin_resets_member_password(admin_user, member_user):
    c = client_as(admin_user)
    r = c.post(
        f"/api/v1/auth/users/{member_user.id}/reset-password/",
        {"new_password": "newsecret123"},
        format="json",
    )
    assert r.status_code == 200
    member_user.refresh_from_db()
    assert member_user.check_password("newsecret123")


def test_admin_cannot_reset_root_password(admin_user, root_user):
    c = client_as(admin_user)
    r = c.post(
        f"/api/v1/auth/users/{root_user.id}/reset-password/",
        {"new_password": "newsecret123"},
        format="json",
    )
    assert r.status_code in {403, 404}


def test_reset_rejects_short_password(admin_user, member_user):
    c = client_as(admin_user)
    r = c.post(
        f"/api/v1/auth/users/{member_user.id}/reset-password/",
        {"new_password": "short"},
        format="json",
    )
    assert r.status_code == 400


# ── Self-service password change ───────────────────────────────────────


def test_change_own_password_happy(member_user):
    c = client_as(member_user)
    r = c.post(
        "/api/v1/auth/me/change-password/",
        {"old_password": "memberpass1234", "new_password": "newpasswd2026"},
        format="json",
    )
    assert r.status_code == 200
    member_user.refresh_from_db()
    assert member_user.check_password("newpasswd2026")


def test_change_own_password_rejects_wrong_old(member_user):
    c = client_as(member_user)
    r = c.post(
        "/api/v1/auth/me/change-password/",
        {"old_password": "WRONG", "new_password": "newpasswd2026"},
        format="json",
    )
    assert r.status_code == 400


def test_change_own_password_requires_auth(db):
    c = APIClient()
    r = c.post(
        "/api/v1/auth/me/change-password/",
        {"old_password": "x", "new_password": "y"},
        format="json",
    )
    assert r.status_code in {401, 403}


# ── Self-service email change ──────────────────────────────────────────


def test_change_email_happy(member_user):
    c = client_as(member_user)
    r = c.post(
        "/api/v1/auth/me/change-email/",
        {"email": "newmail@example.com", "password": "memberpass1234"},
        format="json",
    )
    assert r.status_code == 200
    member_user.refresh_from_db()
    assert member_user.email == "newmail@example.com"
    assert r.json()["email"] == "newmail@example.com"


def test_change_email_rejects_bad_format(member_user):
    c = client_as(member_user)
    r = c.post(
        "/api/v1/auth/me/change-email/",
        {"email": "not-an-email", "password": "memberpass1234"},
        format="json",
    )
    assert r.status_code == 400


def test_change_email_rejects_wrong_password(member_user):
    c = client_as(member_user)
    r = c.post(
        "/api/v1/auth/me/change-email/",
        {"email": "x@y.com", "password": "wrong"},
        format="json",
    )
    assert r.status_code == 400


# ── Self-service username change ───────────────────────────────────────


def test_change_username_happy(member_user):
    c = client_as(member_user)
    r = c.post(
        "/api/v1/auth/me/change-username/",
        {"new_username": "newhandle", "password": "memberpass1234"},
        format="json",
    )
    assert r.status_code == 200
    member_user.refresh_from_db()
    assert member_user.username == "newhandle"


def test_change_username_rejects_collision(member_user, admin_user):
    c = client_as(member_user)
    r = c.post(
        "/api/v1/auth/me/change-username/",
        {"new_username": "admin", "password": "memberpass1234"},
        format="json",
    )
    assert r.status_code == 400


def test_change_username_rejects_bad_chars(member_user):
    c = client_as(member_user)
    r = c.post(
        "/api/v1/auth/me/change-username/",
        {"new_username": "has space", "password": "memberpass1234"},
        format="json",
    )
    assert r.status_code == 400


# ── /me returns email + is_root ────────────────────────────────────────


def test_me_returns_email_and_is_root(root_user):
    c = client_as(root_user)
    r = c.get("/api/v1/auth/me/")
    body = r.json()
    assert body["user"]["email"] == "root@example.com"
    assert body["user"]["is_root"] is True


# ── UserSerializer: email required on create ───────────────────────────


def test_create_user_requires_email(admin_user):
    c = client_as(admin_user)
    r = c.post(
        "/api/v1/auth/users/",
        {"username": "newbie", "password": "newbiepass1"},
        format="json",
    )
    assert r.status_code == 400
    assert "email" in r.json()


def test_create_user_with_email_succeeds(admin_user):
    c = client_as(admin_user)
    r = c.post(
        "/api/v1/auth/users/",
        {"username": "newbie", "password": "newbiepass1", "email": "n@ex.com"},
        format="json",
    )
    assert r.status_code == 201
    assert r.json()["email"] == "n@ex.com"


# ── Custom ROOT_ADMIN_USERNAME via env ─────────────────────────────────


@override_settings(ROOT_ADMIN_USERNAME="alt_root")
def test_root_admin_identity_follows_setting(db):
    """Operator can override the root identity for a different deployment."""
    u = User.objects.create_user(
        username="alt_root", password="x", is_staff=True, is_superuser=True,
    )
    other = User.objects.create_user(
        username="fengfujiang", password="x", is_staff=True, is_superuser=True,
    )
    assert is_root_admin(u) is True
    assert is_root_admin(other) is False
