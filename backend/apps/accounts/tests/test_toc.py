"""Tests for the site-wide 目录 (TOC) defaults singleton + endpoints
(three scopes: kblist / kb / article)."""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.models import (
    DEFAULT_TOC_PREFS,
    TOC_SCOPES,
    TocSettings,
    default_toc_site,
    is_legacy_flat_toc,
    repair_toc_prefs,
    repair_toc_site,
)

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


def test_factory_defaults_are_compact_medium_light_serif_muted():
    assert DEFAULT_TOC_PREFS["density"] == "compact"
    assert DEFAULT_TOC_PREFS["size"] == "m"
    assert DEFAULT_TOC_PREFS["weight"] == "light"
    assert DEFAULT_TOC_PREFS["font"] == "serif"
    assert DEFAULT_TOC_PREFS["color"] == "muted"
    assert TOC_SCOPES == ("kblist", "kb", "article")
    assert default_toc_site() == {s: DEFAULT_TOC_PREFS for s in TOC_SCOPES}


@pytest.mark.django_db
def test_load_creates_singleton_with_scoped_defaults():
    obj = TocSettings.load()
    assert obj.pk == 1
    assert obj.prefs == default_toc_site()
    obj.prefs = {"kb": {"density": "loose"}}
    obj.save()
    again = TocSettings.load()
    assert again.pk == 1 and TocSettings.objects.count() == 1
    # save() repairs partial blobs to the full shape, scope by scope.
    assert again.prefs["kb"]["density"] == "loose"
    assert again.prefs["kb"]["size"] == "m"
    assert again.prefs["article"] == DEFAULT_TOC_PREFS
    assert again.prefs["kblist"] == DEFAULT_TOC_PREFS


def test_repair_drops_invalid_and_coerces_depth():
    out = repair_toc_prefs({"density": "huge", "font": "brush", "depth": "3", "wrap": "yes", "numbers": False, "grouped": False})
    assert out["density"] == "compact"
    assert out["font"] == "brush"
    assert out["depth"] == 3
    assert out["wrap"] is False
    assert out["numbers"] is False
    assert out["grouped"] is False
    assert repair_toc_prefs(None) == DEFAULT_TOC_PREFS


def test_repair_site_spreads_legacy_flat_blob():
    legacy = {"density": "loose", "font": "sans", "size": "l"}
    assert is_legacy_flat_toc(legacy)
    assert not is_legacy_flat_toc({"kb": {}})
    assert not is_legacy_flat_toc({})
    site = repair_toc_site(legacy)
    assert set(site) == set(TOC_SCOPES)
    for s in TOC_SCOPES:
        assert site[s]["density"] == "loose" and site[s]["font"] == "sans" and site[s]["size"] == "l"
        assert site[s]["grouped"] is True
    assert repair_toc_site(None) == default_toc_site()
    assert repair_toc_site({"article": {"depth": 2}, "junk": 1})["article"]["depth"] == 2


@pytest.mark.django_db
def test_legacy_flat_row_is_repaired_on_save():
    obj = TocSettings.load()
    obj.prefs = {"density": "loose", "color": "muted"}
    obj.save()
    again = TocSettings.load()
    assert again.prefs["kblist"]["density"] == "loose"
    assert again.prefs["article"]["color"] == "muted"


@pytest.mark.django_db
@override_settings(SITE_REQUIRE_LOGIN=False)
def test_public_endpoint_returns_scoped_prefs_and_invalidates_cache(staff_client):
    anon = APIClient()
    r = anon.get("/api/v1/public/toc-settings/")
    assert r.status_code == 200
    assert r.json()["prefs"] == default_toc_site()
    staff_client.patch("/api/v1/auth/toc/", {"article": {"font": "kai", "wrap": True}}, format="json")
    r2 = anon.get("/api/v1/public/toc-settings/")
    assert r2.json()["prefs"]["article"]["font"] == "kai"
    assert r2.json()["prefs"]["article"]["wrap"] is True
    # other scopes untouched
    assert r2.json()["prefs"]["kb"] == DEFAULT_TOC_PREFS
    assert r2.json()["prefs"]["kblist"] == DEFAULT_TOC_PREFS


@pytest.mark.django_db
@override_settings(SITE_REQUIRE_LOGIN=True)
def test_public_endpoint_gated_for_anonymous():
    assert APIClient().get("/api/v1/public/toc-settings/").status_code == 403


@pytest.mark.django_db
def test_member_cannot_read_or_write(member_client):
    assert member_client.get("/api/v1/auth/toc/").status_code == 403
    assert member_client.patch("/api/v1/auth/toc/", {"kb": {"font": "kai"}}, format="json").status_code == 403


@pytest.mark.django_db
def test_staff_patch_validates_per_scope_and_reset(staff_client):
    r = staff_client.get("/api/v1/auth/toc/")
    assert r.status_code == 200
    assert r.json()["defaults"] == default_toc_site()
    assert r.json()["scopes"] == list(TOC_SCOPES)
    bad = staff_client.patch("/api/v1/auth/toc/", {"article": {"depth": 9}}, format="json")
    assert bad.status_code == 400 and bad.json()["detail"].startswith("article:")
    bad2 = staff_client.patch("/api/v1/auth/toc/", {"kb": {"wrap": "on"}}, format="json")
    assert bad2.status_code == 400
    # flat (legacy-shaped) bodies and unknown scopes are rejected, not silently applied
    flat = staff_client.patch("/api/v1/auth/toc/", {"font": "kai"}, format="json")
    assert flat.status_code == 400
    bad_reset = staff_client.patch("/api/v1/auth/toc/", {"reset": "epub"}, format="json")
    assert bad_reset.status_code == 400
    ok = staff_client.patch(
        "/api/v1/auth/toc/",
        {"article": {"depth": "3", "color": "layered", "unknown": 1}, "kblist": {"grouped": False, "density": "loose"}},
        format="json",
    )
    assert ok.status_code == 200
    body = ok.json()["prefs"]
    assert body["article"]["depth"] == 3 and body["article"]["color"] == "layered"
    assert "unknown" not in body["article"]
    assert body["kblist"]["grouped"] is False and body["kblist"]["density"] == "loose"
    assert body["kb"] == DEFAULT_TOC_PREFS
    # reset one scope leaves the others alone
    one = staff_client.patch("/api/v1/auth/toc/", {"reset": "kblist"}, format="json")
    assert one.status_code == 200
    assert one.json()["prefs"]["kblist"] == DEFAULT_TOC_PREFS
    assert one.json()["prefs"]["article"]["depth"] == 3
    reset = staff_client.patch("/api/v1/auth/toc/", {"reset": True}, format="json")
    assert reset.json()["prefs"] == default_toc_site()
