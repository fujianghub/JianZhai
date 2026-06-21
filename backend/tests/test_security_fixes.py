"""Regression tests for the 2026-06-07 security-audit fix batch.

Covers:
  1. friend-gate on /feed.xml + /sitemap.xml (SITE_REQUIRE_LOGIN bypass)
  2. public HTML posts never fall back to raw_content
  3. folder parent cycle rejection (PATCH + reorder_tree)
  4. self-service rename to ROOT_ADMIN_USERNAME blocked
  5. AI attribution ids must belong to the caller
"""

from __future__ import annotations

import pytest
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.knowledge.models import Document, Folder, KnowledgeBase

User = pytest.importorskip("django.contrib.auth").get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def owner():
    # Author tier (is_staff): folder edits/reorder + AI attribution are
    # author-only authoring surfaces under v1.0 RBAC.
    return User.objects.create_user(
        "secowner", "secowner@example.com", "pass12345", is_staff=True
    )


@pytest.fixture
def reader():
    # Plain reader — no authoring rights, owns no content pool.
    return User.objects.create_user("secother", "secother@example.com", "pass12345")


@pytest.fixture
def public_kb(owner):
    return KnowledgeBase.objects.create(
        owner=owner, name="Sec KB", slug="sec-kb", visibility="public"
    )


@pytest.fixture
def public_post(public_kb):
    return Document.objects.create(
        knowledge_base=public_kb,
        title="Sec Post",
        slug="sec-post",
        raw_content="PRIVATE-DRAFT-MARKER",
        published_content="published body",
        status="published",
        visibility="public",
        published_at=timezone.now(),
    )


# ── 1. friend gate on feed/sitemap ──────────────────────────────────────


@pytest.mark.django_db
def test_feed_and_sitemap_open_by_default(api_client, public_post):
    assert api_client.get("/feed.xml").status_code == 200
    assert api_client.get("/sitemap.xml").status_code == 200


@override_settings(SITE_REQUIRE_LOGIN=True)
@pytest.mark.django_db
def test_feed_and_sitemap_gated_when_friends_only(api_client, owner, public_post):
    assert api_client.get("/feed.xml").status_code == 403
    assert api_client.get("/sitemap.xml").status_code == 403

    # feed/sitemap are plain Django views — force_authenticate only affects
    # DRF; a real session login is required for request.user to be set.
    api_client.force_login(owner)
    assert api_client.get("/feed.xml").status_code == 200
    assert api_client.get("/sitemap.xml").status_code == 200


# ── 2. public端不得回退到 raw_content ───────────────────────────────────


@pytest.mark.django_db
def test_public_html_post_never_serves_raw_content(api_client, public_kb):
    """An HTML-format published doc whose published_content is empty must NOT
    leak the private raw_content working copy through the public reader."""
    doc = Document.objects.create(
        knowledge_base=public_kb,
        title="HTML Post",
        slug="html-post",
        raw_content="<!doctype html><html><body>SECRET-RAW-DRAFT</body></html>",
        published_content="",
        status="published",
        visibility="public",
        published_at=timezone.now(),
    )
    url = reverse("api_v1:public-post-by-id", kwargs={"pk": doc.pk}) if _has_route(
        "api_v1:public-post-by-id"
    ) else f"/api/v1/public/posts/by-id/{doc.pk}/"
    resp = api_client.get(url)
    # The post is visible, but the private draft body must not appear anywhere.
    assert resp.status_code == 200
    assert "SECRET-RAW-DRAFT" not in str(resp.content.decode("utf-8"))


def _has_route(name: str) -> bool:
    from django.urls import NoReverseMatch

    try:
        reverse(name, kwargs={"pk": 1})
        return True
    except NoReverseMatch:
        return False


# ── 3. folder cycle protection ──────────────────────────────────────────


@pytest.mark.django_db
def test_folder_patch_rejects_self_and_descendant_parent(api_client, owner, public_kb):
    api_client.force_authenticate(owner)
    a = Folder.objects.create(knowledge_base=public_kb, name="A")
    b = Folder.objects.create(knowledge_base=public_kb, name="B", parent=a)

    # A -> parent B (B is a descendant of A): cycle.
    resp = api_client.patch(f"/api/v1/folders/{a.pk}/", {"parent": b.pk}, format="json")
    assert resp.status_code == 400

    # A -> parent A: self-cycle.
    resp = api_client.patch(f"/api/v1/folders/{a.pk}/", {"parent": a.pk}, format="json")
    assert resp.status_code == 400

    # Sanity: a legal move still works (B out to root).
    resp = api_client.patch(f"/api/v1/folders/{b.pk}/", {"parent": None}, format="json")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_reorder_tree_rejects_cycle(api_client, owner, public_kb):
    api_client.force_authenticate(owner)
    a = Folder.objects.create(knowledge_base=public_kb, name="A")
    b = Folder.objects.create(knowledge_base=public_kb, name="B", parent=a)

    resp = api_client.post(
        "/api/v1/tree/reorder/",
        {
            "knowledge_base": public_kb.pk,
            "items": [
                {"type": "folder", "id": a.pk, "order": 0, "parent_folder_id": b.pk},
            ],
        },
        format="json",
    )
    assert resp.status_code == 400
    a.refresh_from_db()
    assert a.parent_id is None  # nothing applied


# ── 4. rename-to-root blocked ───────────────────────────────────────────


@override_settings(ROOT_ADMIN_USERNAME="rootboss")
@pytest.mark.django_db
def test_change_username_to_root_admin_blocked(api_client):
    su = User.objects.create_superuser("justasuper", "su@example.com", "pass12345")
    api_client.force_authenticate(su)
    resp = api_client.post(
        "/api/v1/auth/me/change-username/",
        {"new_username": "rootboss", "password": "pass12345"},
        format="json",
    )
    assert resp.status_code == 400
    su.refresh_from_db()
    assert su.username == "justasuper"


# ── 5. AI attribution ownership ─────────────────────────────────────────


@pytest.mark.django_db
def test_ai_attribution_kept_for_authors_dropped_for_readers(
    owner, reader, public_kb, public_post
):
    """v1.0 RBAC: AI attribution follows the shared content pool.

    Authors (is_staff) see the whole pool, so any real doc/KB id is a valid
    attribution target and is kept. A reader (non-staff) owns no content pool,
    so every attribution id resolves to nothing and is dropped — readers can't
    pollute admin usage stats. Garbage/empty ids always drop.
    """
    from apps.ai.views import _owned_fk_id

    # Author: shared-pool ids are kept.
    assert _owned_fk_id(Document, owner, public_post.pk) == public_post.pk
    assert (
        _owned_fk_id(KnowledgeBase, owner, public_kb.pk, owner_field="owner")
        == public_kb.pk
    )

    # Reader: no content pool → everything drops.
    assert _owned_fk_id(Document, reader, public_post.pk) is None
    assert (
        _owned_fk_id(KnowledgeBase, reader, public_kb.pk, owner_field="owner") is None
    )

    # Garbage / empty always drop.
    assert _owned_fk_id(Document, owner, "garbage") is None
    assert _owned_fk_id(Document, owner, None) is None
