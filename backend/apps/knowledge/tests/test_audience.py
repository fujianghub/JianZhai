"""KB / category audience visibility (WeChat-Moments style).

Covers the central ``apps.knowledge.audience`` helpers plus end-to-end
enforcement at the reader entry points (public list, by-id direct link,
favorites, comments). Three modes (all / include / exclude) × two targeting
units (user / tag) × anonymous + author bypass.
"""

from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import UserTag
from apps.knowledge.audience import _user_tag_ids, visible_documents, visible_kbs
from apps.knowledge.models import (
    Document,
    KnowledgeBase,
    KnowledgeBaseCategory,
)

User = pytest.importorskip("django.contrib.auth").get_user_model()


@pytest.fixture
def author():
    return User.objects.create_user("author1", "author1@e.com", "pass", is_staff=True)


@pytest.fixture
def reader_in():
    return User.objects.create_user("reader_in", "reader_in@e.com", "pass")


@pytest.fixture
def reader_out():
    return User.objects.create_user("reader_out", "reader_out@e.com", "pass")


@pytest.fixture
def tag():
    return UserTag.objects.create(name="同事", color="#1677ff")


def _make_public_post(kb, slug="p"):
    return Document.objects.create(
        knowledge_base=kb,
        title=f"Post {slug}",
        slug=slug,
        raw_content="body",
        published_content="body",
        status="published",
        visibility="public",
        published_at=timezone.now(),
    )


@pytest.fixture
def public_kb(author):
    return KnowledgeBase.objects.create(
        owner=author, name="KB", slug="kb", visibility="public"
    )


# ── helper-level unit tests ────────────────────────────────────────────────

@pytest.mark.django_db
def test_mode_all_visible_to_everyone(public_kb, reader_out):
    _make_public_post(public_kb)
    assert visible_documents(Document.objects.all(), reader_out).count() == 1


@pytest.mark.django_db
def test_include_by_user(public_kb, reader_in, reader_out):
    public_kb.audience_mode = "include"
    public_kb.save(update_fields=["audience_mode"])
    public_kb.audience_users.add(reader_in)
    _make_public_post(public_kb)
    assert visible_documents(Document.objects.all(), reader_in).count() == 1
    assert visible_documents(Document.objects.all(), reader_out).count() == 0


@pytest.mark.django_db
def test_include_by_tag(public_kb, reader_in, reader_out, tag):
    tag.users.add(reader_in)
    public_kb.audience_mode = "include"
    public_kb.save(update_fields=["audience_mode"])
    public_kb.audience_tags.add(tag)
    _make_public_post(public_kb)
    assert visible_documents(Document.objects.all(), reader_in).count() == 1
    assert visible_documents(Document.objects.all(), reader_out).count() == 0


@pytest.mark.django_db
def test_exclude_by_user(public_kb, reader_in, reader_out):
    public_kb.audience_mode = "exclude"
    public_kb.save(update_fields=["audience_mode"])
    public_kb.audience_users.add(reader_out)
    _make_public_post(public_kb)
    # reader_out is blacklisted; reader_in (not targeted) still sees it.
    assert visible_documents(Document.objects.all(), reader_out).count() == 0
    assert visible_documents(Document.objects.all(), reader_in).count() == 1


@pytest.mark.django_db
def test_exclude_by_tag(public_kb, reader_out, tag):
    tag.users.add(reader_out)
    public_kb.audience_mode = "exclude"
    public_kb.save(update_fields=["audience_mode"])
    public_kb.audience_tags.add(tag)
    _make_public_post(public_kb)
    assert visible_documents(Document.objects.all(), reader_out).count() == 0


@pytest.mark.django_db
def test_author_bypasses_all_filters(public_kb, author):
    public_kb.audience_mode = "include"  # nobody targeted
    public_kb.save(update_fields=["audience_mode"])
    _make_public_post(public_kb)
    assert visible_documents(Document.objects.all(), author).count() == 1


@pytest.mark.django_db
def test_anonymous_whitelist_hidden_blacklist_visible(public_kb):
    from django.contrib.auth.models import AnonymousUser

    anon = AnonymousUser()
    _make_public_post(public_kb)
    # include: anon can never be whitelisted → hidden.
    public_kb.audience_mode = "include"
    public_kb.save(update_fields=["audience_mode"])
    assert visible_documents(Document.objects.all(), anon).count() == 0
    # exclude: anon isn't in the blacklist → visible.
    public_kb.audience_mode = "exclude"
    public_kb.save(update_fields=["audience_mode"])
    assert visible_documents(Document.objects.all(), anon).count() == 1


@pytest.mark.django_db
def test_hidden_category_hides_its_kb_docs(author, reader_out):
    cat = KnowledgeBaseCategory.objects.create(
        owner=author, name="密", slug="mi", audience_mode="include"
    )
    kb = KnowledgeBase.objects.create(
        owner=author, name="KB", slug="kb2", visibility="public", category=cat
    )
    _make_public_post(kb)
    # KB itself is mode=all, but its category is include-with-nobody → its
    # docs are hidden (doc visibility = KB visible AND category visible).
    assert visible_documents(Document.objects.all(), reader_out).count() == 0
    # The KB row itself is mode=all, so it remains visible as a KB; only the
    # category grouping (and thus the docs under it) is gated.
    assert visible_kbs(KnowledgeBase.objects.all(), reader_out).count() == 1


# ── endpoint-level enforcement ─────────────────────────────────────────────

@pytest.fixture
def api():
    return APIClient()


@pytest.mark.django_db
def test_public_list_and_byid_enforce_include(api, public_kb, reader_in, reader_out):
    public_kb.audience_mode = "include"
    public_kb.save(update_fields=["audience_mode"])
    public_kb.audience_users.add(reader_in)
    post = _make_public_post(public_kb)
    list_url = reverse("api_v1:public-post-list")
    byid_url = reverse("api_v1:public-post-by-id", args=[post.id])

    api.force_authenticate(user=reader_out)
    assert post.id not in [p["id"] for p in api.get(list_url).data["results"]]
    assert api.get(byid_url).status_code == 404

    api.force_authenticate(user=reader_in)
    assert post.id in [p["id"] for p in api.get(list_url).data["results"]]
    assert api.get(byid_url).status_code == 200


@pytest.mark.django_db
def test_favorite_blocked_for_hidden_kb(api, public_kb, reader_out):
    public_kb.audience_mode = "include"
    public_kb.save(update_fields=["audience_mode"])
    post = _make_public_post(public_kb)
    api.force_authenticate(user=reader_out)
    resp = api.post(reverse("api_v1:document-favorite", args=[post.id]))
    assert resp.status_code == 404


@pytest.mark.django_db
def test_cannot_add_author_to_kb_audience(api, public_kb, author, reader_out):
    """Guard against the foot-gun: targeting an author is a no-op (they bypass),
    so the API must reject it rather than silently accept a meaningless rule."""
    api.force_authenticate(user=author)
    resp = api.patch(
        reverse("api_v1:kb-detail", args=[public_kb.id]),
        {"audience_mode": "exclude", "audience_user_ids": [author.id]},
        format="json",
    )
    assert resp.status_code == 400
    # A pure-reader audience still saves fine.
    ok = api.patch(
        reverse("api_v1:kb-detail", args=[public_kb.id]),
        {"audience_mode": "exclude", "audience_user_ids": [reader_out.id]},
        format="json",
    )
    assert ok.status_code == 200


@pytest.mark.django_db
def test_comments_blocked_for_hidden_kb(api, public_kb, reader_out):
    public_kb.audience_mode = "exclude"
    public_kb.save(update_fields=["audience_mode"])
    public_kb.audience_users.add(reader_out)
    post = _make_public_post(public_kb)
    api.force_authenticate(user=reader_out)
    resp = api.get(reverse("api_v1:document-comments", args=[post.id]))
    assert resp.status_code == 404


# ── perf regression: reader tag ids are memoised per request ────────────────

@pytest.mark.django_db
def test_user_tag_ids_cached_per_user_instance(reader_in, tag):
    """``_user_tag_ids`` hits the DB once per user instance, then caches.

    The archive view fans out to many ``visible_documents`` calls per request,
    each of which re-derived the reader's tag ids. Caching on the request-scoped
    user instance collapses those to a single query.
    """
    tag.users.add(reader_in)
    with CaptureQueriesContext(connection) as ctx:
        first = _user_tag_ids(reader_in)
        second = _user_tag_ids(reader_in)
    assert first == second == [tag.id]
    # Second lookup must be served from the per-instance cache, not the DB.
    assert len(ctx.captured_queries) == 1
