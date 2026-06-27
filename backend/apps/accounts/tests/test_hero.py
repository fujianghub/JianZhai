"""Tests for the hero quote settings (single-tenant blog homepage banner)."""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.hero import _parse_batch_lines, _split_attribution
from apps.accounts.models import DEFAULT_HERO_QUOTES, HeroSettings

User = get_user_model()


# ── Singleton model ────────────────────────────────────────────────────


@pytest.mark.django_db
def test_load_creates_singleton_with_seed_quote():
    obj = HeroSettings.load()
    assert obj.pk == 1
    # Seeded so a fresh install isn't blank.
    assert len(obj.quotes) >= 1
    assert obj.quotes[0]["text"] == DEFAULT_HERO_QUOTES[0]["text"]


@pytest.mark.django_db
def test_save_forces_pk_one():
    a = HeroSettings.load()
    a.rotation_seconds = 15
    a.save()
    b = HeroSettings.load()
    assert b.pk == 1
    assert b.rotation_seconds == 15
    assert HeroSettings.objects.count() == 1


@pytest.mark.django_db
def test_load_repairs_empty_quotes():
    """An admin who PATCHed quotes=[] should still see a banner — load
    backfills the seed so the homepage isn't blank."""
    obj = HeroSettings.load()
    obj.quotes = []
    obj.save()
    refreshed = HeroSettings.load()
    assert len(refreshed.quotes) >= 1


# ── Batch parser ───────────────────────────────────────────────────────


def parse(text):
    return list(_parse_batch_lines(text))


def test_batch_parses_em_dash_three_segments():
    out = parse("莫听穿林打叶声 — 苏轼 · 定风波")
    assert len(out) == 1
    # Strong dash splits text vs the rest; the rest is then split on its
    # first weak separator (·) into author + source. No dynasty bracket
    # present, so dynasty stays empty.
    assert out[0]["text"] == "莫听穿林打叶声"
    assert out[0]["dynasty"] == ""
    assert out[0]["author"] == "苏轼"
    assert out[0]["source"] == "定风波"


# ── Dynasty prefix parsing ──────────────────────────────────────────


def test_batch_parses_square_bracket_dynasty():
    out = parse("天行健 — [周]孔子 · 论语")
    assert out[0]["dynasty"] == "周"
    assert out[0]["author"] == "孔子"
    assert out[0]["source"] == "论语"


def test_batch_parses_chinese_corner_bracket_dynasty():
    out = parse("臣本布衣 — 〔三国〕诸葛亮 · 出师表")
    assert out[0]["dynasty"] == "三国"
    assert out[0]["author"] == "诸葛亮"
    assert out[0]["source"] == "出师表"


def test_batch_parses_chinese_lenticular_bracket_dynasty():
    out = parse("莫听穿林打叶声 — 【宋】苏轼 · 定风波")
    assert out[0]["dynasty"] == "宋"
    assert out[0]["author"] == "苏轼"
    assert out[0]["source"] == "定风波"


def test_batch_parses_parens_dynasty():
    # English parens accepted too.
    out = parse("be water — (modern)Bruce Lee")
    assert out[0]["dynasty"] == "modern"
    assert out[0]["author"] == "Bruce Lee"
    assert out[0]["source"] == ""


def test_batch_no_dynasty_when_no_brackets():
    out = parse("少壮不努力 — 汉乐府 · 长歌行")
    # No brackets → dynasty empty, author retains the whole leading
    # portion (the user can manually correct in the admin UI).
    assert out[0]["dynasty"] == ""
    assert out[0]["author"] == "汉乐府"
    assert out[0]["source"] == "长歌行"


def test_batch_ignores_brackets_in_source():
    """Brackets that appear INSIDE the source (after the · separator)
    must not be treated as a dynasty prefix — the regex anchors to the
    start of the dynasty-prefix candidate (i.e. after the strong split,
    before the weak split)."""
    out = parse("text — 苏轼 · 临江仙[甲辰]")
    assert out[0]["dynasty"] == ""
    assert out[0]["author"] == "苏轼"
    assert out[0]["source"] == "临江仙[甲辰]"


def test_batch_parses_ascii_dash_two_segments():
    out = parse("人生如逆旅 - 苏轼")
    assert out[0]["author"] == "苏轼"
    assert out[0]["source"] == ""


def test_batch_parses_by_keyword():
    out = parse("天行健 by 周易")
    assert out[0]["text"] == "天行健"
    assert out[0]["author"] == "周易"
    assert out[0]["source"] == ""


def test_batch_falls_back_to_middle_dot_when_no_dash():
    # No strong separator: weak split puts text vs rest, and ``rest`` has
    # no inner separator so it lands in ``author`` (admin can correct).
    out = parse("仰之弥高 · 论语")
    assert out[0]["text"] == "仰之弥高"
    assert out[0]["author"] == "论语"
    assert out[0]["source"] == ""


def test_batch_skips_comments_and_blank_lines():
    out = parse("# comment\n\nquote 1\n\n# another\nquote 2")
    assert [q["text"] for q in out] == ["quote 1", "quote 2"]
    for q in out:
        assert q["author"] == ""
        assert q["source"] == ""


def test_batch_handles_text_only_lines():
    out = parse("just plain text")
    assert out[0]["text"] == "just plain text"
    assert out[0]["author"] == ""
    assert out[0]["source"] == ""


def test_batch_handles_empty_input():
    assert parse("") == []
    assert parse("\n\n\n") == []
    assert parse("# only comments") == []


def test_batch_dashes_inside_text_use_last_separator():
    """A quote containing a dash inside still picks up the trailing
    "— author" because the parser splits on the LAST strong separator."""
    out = parse("a - b - real text - Author")
    assert out[0]["text"] == "a - b - real text"
    assert out[0]["author"] == "Author"


# ── Legacy attribution split helper ────────────────────────────────────


def test_split_attribution_dash():
    assert _split_attribution("作者 — 篇名") == ("作者", "篇名")


def test_split_attribution_middle_dot():
    assert _split_attribution("作者 · 篇名") == ("作者", "篇名")


def test_split_attribution_no_separator():
    assert _split_attribution("just author") == ("just author", "")


def test_split_attribution_empty():
    assert _split_attribution("") == ("", "")
    assert _split_attribution("   ") == ("", "")


# ── API endpoints ──────────────────────────────────────────────────────


@pytest.fixture
def staff_client(db):
    user = User.objects.create_user(
        username="staff", password="x", is_staff=True
    )
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def member_client(db):
    user = User.objects.create_user(username="member", password="x")
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def anon_client():
    return APIClient()


@override_settings(SITE_REQUIRE_LOGIN=False)
def test_public_hero_unauthenticated_ok(anon_client, db):
    r = anon_client.get("/api/v1/public/hero/")
    assert r.status_code == 200
    body = r.json()
    assert "quotes" in body
    assert "rotation_seconds" in body
    assert "animation" in body
    # The internal ``animations`` enum is admin-only — public should not
    # leak the full list (it's not sensitive, just unnecessary).
    assert "animations" not in body
    # Each public quote carries split author / source plus a derived
    # attribution string for back-compat with the v0.9.3 client.
    q = body["quotes"][0]
    assert {"id", "text", "author", "source", "attribution"} <= set(q.keys())


def test_admin_get_returns_full_shape(staff_client):
    r = staff_client.get("/api/v1/auth/hero/")
    assert r.status_code == 200
    body = r.json()
    assert "animations" in body
    assert isinstance(body["animations"], list)
    assert "fade" in body["animations"]


def test_admin_patch_updates(staff_client):
    r = staff_client.patch(
        "/api/v1/auth/hero/",
        {"rotation_seconds": 12, "animation": "typewriter"},
        format="json",
    )
    assert r.status_code == 200
    assert r.json()["rotation_seconds"] == 12
    assert r.json()["animation"] == "typewriter"


def test_admin_patch_rejects_unknown_animation(staff_client):
    r = staff_client.patch(
        "/api/v1/auth/hero/", {"animation": "bogus"}, format="json"
    )
    assert r.status_code == 400


def test_admin_patch_rejects_legacy_zoom_animation(staff_client):
    """v0.9.4 replaced ``zoom`` with ``ink-wash``. Old clients sending
    ``zoom`` should fail validation rather than silently pass through —
    keeps the renderer / API in lock-step."""
    r = staff_client.patch(
        "/api/v1/auth/hero/", {"animation": "zoom"}, format="json"
    )
    assert r.status_code == 400


def test_admin_patch_accepts_ink_wash(staff_client):
    r = staff_client.patch(
        "/api/v1/auth/hero/", {"animation": "ink-wash"}, format="json"
    )
    assert r.status_code == 200
    assert r.json()["animation"] == "ink-wash"


def test_admin_patch_quotes_with_split_fields(staff_client):
    r = staff_client.patch(
        "/api/v1/auth/hero/",
        {"quotes": [
            {"text": "天行健 君子以自强不息", "dynasty": "先秦", "author": "周易", "source": ""},
            {"text": "知者不惑", "dynasty": "春秋", "author": "孔子", "source": "论语 · 子罕"},
        ]},
        format="json",
    )
    assert r.status_code == 200
    out = r.json()["quotes"]
    assert out[0]["dynasty"] == "先秦"
    assert out[0]["author"] == "周易"
    assert out[1]["source"] == "论语 · 子罕"
    # Derived ``attribution`` weaves dynasty into the head: 〔朝代〕作者 · 篇名.
    assert "〔春秋〕" in out[1]["attribution"]
    assert "孔子" in out[1]["attribution"]


def test_admin_patch_rejects_overlong_dynasty(staff_client):
    r = staff_client.patch(
        "/api/v1/auth/hero/",
        {"quotes": [{"text": "x", "dynasty": "x" * 50}]},
        format="json",
    )
    assert r.status_code == 400


def test_admin_patch_quotes_accepts_legacy_attribution(staff_client):
    """An older client PATCHing the v0.9.3 shape should still work — the
    validator falls back to splitting ``attribution`` into author + source."""
    r = staff_client.patch(
        "/api/v1/auth/hero/",
        {"quotes": [
            {"text": "legacy quote", "attribution": "苏轼 · 定风波"},
        ]},
        format="json",
    )
    assert r.status_code == 200
    q = r.json()["quotes"][0]
    assert q["author"] == "苏轼"
    assert q["source"] == "定风波"


def test_admin_patch_rejects_out_of_range_rotation(staff_client):
    r = staff_client.patch(
        "/api/v1/auth/hero/", {"rotation_seconds": 0}, format="json"
    )
    assert r.status_code == 400
    r = staff_client.patch(
        "/api/v1/auth/hero/", {"rotation_seconds": 99999}, format="json"
    )
    assert r.status_code == 400


def test_non_staff_cannot_patch(member_client):
    r = member_client.patch(
        "/api/v1/auth/hero/", {"enabled": False}, format="json"
    )
    assert r.status_code == 403


def test_anon_cannot_get_admin_endpoint(anon_client, db):
    r = anon_client.get("/api/v1/auth/hero/")
    assert r.status_code == 401 or r.status_code == 403


def test_quotes_validation_caps_text_length(staff_client):
    r = staff_client.patch(
        "/api/v1/auth/hero/",
        {"quotes": [{"text": "x" * 5000}]},
        format="json",
    )
    assert r.status_code == 400


def test_batch_endpoint_append_mode(staff_client):
    r = staff_client.post(
        "/api/v1/auth/hero/batch/",
        {"mode": "append", "text": "新题记 — 新作者"},
        format="json",
    )
    assert r.status_code == 200
    body = r.json()
    # Seed quote + the new one
    assert any(q["text"] == "新题记" for q in body["quotes"])
    assert len(body["quotes"]) >= 2


def test_batch_endpoint_replace_mode(staff_client):
    # First add some
    staff_client.post(
        "/api/v1/auth/hero/batch/",
        {"mode": "append", "text": "extra"},
        format="json",
    )
    # Then replace
    r = staff_client.post(
        "/api/v1/auth/hero/batch/",
        {"mode": "replace", "text": "only — survivor"},
        format="json",
    )
    assert r.status_code == 200
    assert len(r.json()["quotes"]) == 1
    assert r.json()["quotes"][0]["text"] == "only"


def test_batch_endpoint_rejects_empty(staff_client):
    r = staff_client.post(
        "/api/v1/auth/hero/batch/", {"mode": "replace", "text": "# nothing"},
        format="json",
    )
    assert r.status_code == 400


def test_batch_endpoint_member_forbidden(member_client):
    r = member_client.post(
        "/api/v1/auth/hero/batch/", {"text": "x"}, format="json"
    )
    assert r.status_code == 403


# ── Play order (v0.9.10) ───────────────────────────────────────────────


@pytest.mark.django_db
def test_play_order_defaults_to_random():
    assert HeroSettings.load().play_order == "random"


@override_settings(SITE_REQUIRE_LOGIN=False)
def test_public_hero_includes_play_order(anon_client, db):
    body = anon_client.get("/api/v1/public/hero/").json()
    assert body["play_order"] == "random"
    # The enum list stays admin-only, same policy as ``animations``.
    assert "play_orders" not in body


def test_admin_get_includes_play_orders_enum(staff_client):
    body = staff_client.get("/api/v1/auth/hero/").json()
    assert body["play_order"] == "random"
    assert body["play_orders"] == ["random", "sequential"]


def test_admin_patch_play_order_sequential(staff_client):
    r = staff_client.patch(
        "/api/v1/auth/hero/", {"play_order": "sequential"}, format="json"
    )
    assert r.status_code == 200
    assert r.json()["play_order"] == "sequential"
    assert HeroSettings.load().play_order == "sequential"


def test_admin_patch_rejects_unknown_play_order(staff_client):
    r = staff_client.patch(
        "/api/v1/auth/hero/", {"play_order": "shuffle-forever"}, format="json"
    )
    assert r.status_code == 400
    assert r.json()["supported"] == ["random", "sequential"]
    assert HeroSettings.load().play_order == "random"


def test_member_cannot_patch_play_order(member_client):
    r = member_client.patch(
        "/api/v1/auth/hero/", {"play_order": "sequential"}, format="json"
    )
    assert r.status_code == 403
