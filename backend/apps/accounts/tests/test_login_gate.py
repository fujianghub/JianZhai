"""Tests for v0.9.8 ``SITE_REQUIRE_LOGIN`` private-blog mode.

Pins the contract that PublicOrLoginGated returns 401 for anonymous
visitors when the flag is on, and remains identical to AllowAny when off.
Also verifies the session endpoint surfaces the flag so the frontend can
gate its routes without a separate call.
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient

User = get_user_model()


@pytest.fixture
def alice(db):
    return User.objects.create_user(username="alice", password="x")


# ── Session endpoint surfaces the flag ────────────────────────────────


def test_session_endpoint_includes_require_login_default_true(db):
    """The product default is friends-only: with no env override the
    session endpoint must advertise ``require_login: true`` so the SPA
    bounces anonymous visitors to the login page."""
    c = APIClient()
    r = c.get("/api/v1/auth/session/")
    assert r.status_code == 200
    body = r.json()
    assert body["authenticated"] is False
    assert body["require_login"] is True


def test_blog_public_endpoints_closed_by_default(db):
    """Pin the production default: without any ``SITE_REQUIRE_LOGIN``
    override, anonymous access to a public endpoint is gated."""
    c = APIClient()
    r = c.get("/api/v1/public/posts/")
    assert r.status_code in {401, 403}


@override_settings(SITE_REQUIRE_LOGIN=True)
def test_session_endpoint_reflects_flag_on(db):
    c = APIClient()
    r = c.get("/api/v1/auth/session/")
    assert r.status_code == 200
    assert r.json()["require_login"] is True


# ── Public blog gate ──────────────────────────────────────────────────


@override_settings(SITE_REQUIRE_LOGIN=False)
def test_blog_public_endpoints_open_when_flag_off(db):
    """Default (local dev) mode: any visitor can read the blog."""
    c = APIClient()
    r = c.get("/api/v1/public/posts/")
    # The endpoint may return an empty list or paginated 200 — either way
    # the auth gate must NOT trigger.
    assert r.status_code == 200


@override_settings(SITE_REQUIRE_LOGIN=True)
def test_blog_public_endpoints_closed_when_flag_on(db):
    """Friends-only mode: anonymous gets 401, login required."""
    c = APIClient()
    r = c.get("/api/v1/public/posts/")
    assert r.status_code in {401, 403}


@override_settings(SITE_REQUIRE_LOGIN=True)
def test_blog_public_endpoints_open_for_logged_in(alice):
    c = APIClient()
    c.force_authenticate(alice)
    r = c.get("/api/v1/public/posts/")
    assert r.status_code == 200


@override_settings(SITE_REQUIRE_LOGIN=True)
def test_hero_public_endpoint_gated(db, alice):
    """The hero quote endpoint feeds the homepage banner — must follow
    the same gate as the rest of the blog."""
    anon = APIClient()
    r = anon.get("/api/v1/public/hero/")
    assert r.status_code in {401, 403}
    auth = APIClient()
    auth.force_authenticate(alice)
    r = auth.get("/api/v1/public/hero/")
    assert r.status_code == 200


@override_settings(SITE_REQUIRE_LOGIN=True)
def test_login_endpoint_still_accessible(db):
    """Critical: even in gated mode, the login form must stay reachable
    or the user can never get IN to the site."""
    c = APIClient()
    # The login endpoint accepts POST; we just verify the CSRF helper +
    # GET-session (used by frontend BlogLayout) don't 401 themselves.
    r = c.get("/api/v1/auth/csrf/")
    assert r.status_code == 200
    r = c.get("/api/v1/auth/session/")
    assert r.status_code == 200
