"""Tests for the site-wide 目录 (TOC) defaults singleton + endpoints."""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.models import DEFAULT_TOC_PREFS, TocSettings, repair_toc_prefs

User = get_user_model()


@pytest.fixture
def staff_client(db):
    user = User.objects.create_user(username="staff", password="x", is_staff=True)
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def member_client(db):
    user = User.objects.create_user(username="member", password="x")
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.mark.django_db
def test_load_creates_singleton_with_defaults():
    obj = TocSettings.load()
    assert obj.pk == 1
    assert obj.prefs == DEFAULT_TOC_PREFS
    obj.prefs = {"density": "loose"}
    obj.save()
    again = TocSettings.load()
    assert again.pk == 1 and TocSettings.objects.count() == 1
    # save() repairs partial blobs to the full shape.
    assert again.prefs["density"] == "loose"
    assert again.prefs["size"] == "m"


def test_repair_drops_invalid_and_coerces_depth():
    out = repair_toc_prefs({"density": "huge", "font": "brush", "depth": "3", "wrap": "yes", "numbers": False})
    assert out["density"] == "normal"
    assert out["font"] == "brush"
    assert out["depth"] == 3
    assert out["wrap"] is False
    assert out["numbers"] is False
    assert repair_toc_prefs(None) == DEFAULT_TOC_PREFS


@pytest.mark.django_db
@override_settings(SITE_REQUIRE_LOGIN=False)
def test_public_endpoint_returns_prefs_and_invalidates_cache(staff_client):
    anon = APIClient()
    r = anon.get("/api/v1/public/toc-settings/")
    assert r.status_code == 200
    assert r.json()["prefs"] == DEFAULT_TOC_PREFS
    staff_client.patch("/api/v1/auth/toc/", {"font": "serif", "wrap": True}, format="json")
    r2 = anon.get("/api/v1/public/toc-settings/")
    assert r2.json()["prefs"]["font"] == "serif"
    assert r2.json()["prefs"]["wrap"] is True


@pytest.mark.django_db
@override_settings(SITE_REQUIRE_LOGIN=True)
def test_public_endpoint_gated_for_anonymous():
    assert APIClient().get("/api/v1/public/toc-settings/").status_code == 403


@pytest.mark.django_db
def test_member_cannot_read_or_write(member_client):
    assert member_client.get("/api/v1/auth/toc/").status_code == 403
    assert member_client.patch("/api/v1/auth/toc/", {"font": "kai"}, format="json").status_code == 403


@pytest.mark.django_db
def test_staff_patch_validates_and_reset(staff_client):
    r = staff_client.get("/api/v1/auth/toc/")
    assert r.status_code == 200
    assert r.json()["defaults"] == DEFAULT_TOC_PREFS
    bad = staff_client.patch("/api/v1/auth/toc/", {"depth": 9}, format="json")
    assert bad.status_code == 400
    bad2 = staff_client.patch("/api/v1/auth/toc/", {"wrap": "on"}, format="json")
    assert bad2.status_code == 400
    ok = staff_client.patch("/api/v1/auth/toc/", {"depth": "3", "color": "layered", "unknown": 1}, format="json")
    assert ok.status_code == 200
    assert ok.json()["prefs"]["depth"] == 3
    assert ok.json()["prefs"]["color"] == "layered"
    assert "unknown" not in ok.json()["prefs"]
    reset = staff_client.patch("/api/v1/auth/toc/", {"reset": True}, format="json")
    assert reset.json()["prefs"] == DEFAULT_TOC_PREFS
