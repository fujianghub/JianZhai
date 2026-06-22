"""Slider-captcha generation/verification + login three-factor checks."""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts import captcha

User = get_user_model()


def _solve(client) -> tuple[str, int]:
    """Fetch a puzzle and read its answer straight from Redis (test only)."""
    r = client.get("/api/v1/auth/captcha/")
    assert r.status_code == 200
    cid = r.json()["id"]
    return cid, cache.get(f"slidecaptcha:{cid}")


@pytest.fixture
def alice(db):
    return User.objects.create_user(username="alice", password="pw-correct-1", email="alice@x.com")


# ── unit: generate / verify ───────────────────────────────────────────


def test_generate_payload_and_stores_target(db):
    p = captcha.generate()
    assert set(p) == {"id", "background", "piece", "y", "piece_width", "width", "height"}
    assert p["background"].startswith("data:image/png;base64,")
    assert cache.get(f"slidecaptcha:{p['id']}") is not None


def test_verify_correct_wrong_and_single_use(db):
    p = captcha.generate()
    target = cache.get(f"slidecaptcha:{p['id']}")
    assert captcha.verify_slider(p["id"], target + captcha.TOLERANCE) is True
    # consumed — a second verify (even correct) fails
    assert captcha.verify_slider(p["id"], target) is False


def test_verify_out_of_tolerance(db):
    p = captcha.generate()
    target = cache.get(f"slidecaptcha:{p['id']}")
    assert captcha.verify_slider(p["id"], target + captcha.TOLERANCE + 1) is False


def test_verify_unknown_id(db):
    assert captcha.verify_slider("nope", 100) is False


# ── login three factors ───────────────────────────────────────────────


def test_login_all_three_correct(alice):
    c = APIClient()
    cid, target = _solve(c)
    r = c.post(
        "/api/v1/auth/login/",
        {"username": "alice", "password": "pw-correct-1", "email": "alice@x.com",
         "captcha_id": cid, "captcha_x": target},
    )
    assert r.status_code == 200, r.json()
    assert r.json()["authenticated"] is True


def test_login_wrong_email_rejected(alice):
    c = APIClient()
    cid, target = _solve(c)
    r = c.post(
        "/api/v1/auth/login/",
        {"username": "alice", "password": "pw-correct-1", "email": "wrong@x.com",
         "captcha_id": cid, "captcha_x": target},
    )
    assert r.status_code == 401


def test_login_email_case_insensitive(alice):
    c = APIClient()
    cid, target = _solve(c)
    r = c.post(
        "/api/v1/auth/login/",
        {"username": "alice", "password": "pw-correct-1", "email": "  ALICE@X.com ",
         "captcha_id": cid, "captcha_x": target},
    )
    assert r.status_code == 200


def test_login_bad_captcha_blocked_before_password(alice):
    c = APIClient()
    cid, target = _solve(c)
    r = c.post(
        "/api/v1/auth/login/",
        {"username": "alice", "password": "pw-correct-1", "email": "alice@x.com",
         "captcha_id": cid, "captcha_x": target + 80},
    )
    assert r.status_code == 400
    assert r.json().get("captcha_failed") is True


def test_login_missing_email(alice):
    c = APIClient()
    cid, target = _solve(c)
    r = c.post(
        "/api/v1/auth/login/",
        {"username": "alice", "password": "pw-correct-1",
         "captcha_id": cid, "captcha_x": target},
    )
    assert r.status_code == 400


def test_login_wrong_password_consumes_captcha(alice):
    c = APIClient()
    cid, target = _solve(c)
    r = c.post(
        "/api/v1/auth/login/",
        {"username": "alice", "password": "WRONG", "email": "alice@x.com",
         "captcha_id": cid, "captcha_x": target},
    )
    assert r.status_code == 401
    # the puzzle is now spent — reusing it fails the captcha gate
    r = c.post(
        "/api/v1/auth/login/",
        {"username": "alice", "password": "pw-correct-1", "email": "alice@x.com",
         "captcha_id": cid, "captcha_x": target},
    )
    assert r.status_code == 400


def test_login_emailless_account_skips_email_check(db):
    User.objects.create_user(username="bob", password="pw-bob-12345")  # no email
    c = APIClient()
    cid, target = _solve(c)
    r = c.post(
        "/api/v1/auth/login/",
        {"username": "bob", "password": "pw-bob-12345", "email": "anything@x.com",
         "captcha_id": cid, "captcha_x": target},
    )
    assert r.status_code == 200
