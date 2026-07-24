"""Enforcement of the per-user reading whitelist (``ReadGrant``).

The grant gate is ANDed with the content-side audience gate inside
``apps.knowledge.audience`` — every reader entry (blog, tree, comments,
favorites) flows through ``visible_*``, so these tests exercise both the
helper level and the public endpoints. ``test_audience.py`` stays untouched:
an empty grant set must reproduce exactly the legacy behaviour.
"""

from __future__ import annotations

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import ReadGrant
from apps.knowledge.audience import (
    visible_categories,
    visible_documents,
    visible_kbs,
)
from apps.knowledge.models import (
    Document,
    Folder,
    KnowledgeBase,
    KnowledgeBaseCategory,
)

User = pytest.importorskip("django.contrib.auth").get_user_model()


@pytest.fixture
def author():
    return User.objects.create_user("author1", "author1@e.com", "pass", is_staff=True)


@pytest.fixture
def reader():
    return User.objects.create_user("reader1", "reader1@e.com", "pass")


def _fresh(user):
    """Re-fetch to drop the per-instance ``_cached_read_grants`` memo."""
    return User.objects.get(pk=user.pk)


def _post(kb, slug, folder=None):
    return Document.objects.create(
        knowledge_base=kb,
        folder=folder,
        title=f"Post {slug}",
        slug=slug,
        raw_content="body",
        published_content="body",
        status="published",
        visibility="public",
        published_at=timezone.now(),
    )


@pytest.fixture
def world(author):
    """Two public KBs: kb_a (category cat_a, folder tree f1 > f2, sibling f3)
    and kb_b (no category). Documents at every level."""
    cat_a = KnowledgeBaseCategory.objects.create(owner=author, name="甲类", slug="cat-a")
    kb_a = KnowledgeBase.objects.create(
        owner=author, name="KB-A", slug="kb-a", visibility="public", category=cat_a
    )
    kb_b = KnowledgeBase.objects.create(
        owner=author, name="KB-B", slug="kb-b", visibility="public"
    )
    f1 = Folder.objects.create(knowledge_base=kb_a, name="F1")
    f2 = Folder.objects.create(knowledge_base=kb_a, name="F2", parent=f1)
    f3 = Folder.objects.create(knowledge_base=kb_a, name="F3")
    docs = {
        "a_root": _post(kb_a, "a-root"),
        "a_f1": _post(kb_a, "a-f1", folder=f1),
        "a_f2": _post(kb_a, "a-f2", folder=f2),
        "a_f3": _post(kb_a, "a-f3", folder=f3),
        "b_root": _post(kb_b, "b-root"),
    }
    return {
        "cat_a": cat_a, "kb_a": kb_a, "kb_b": kb_b,
        "f1": f1, "f2": f2, "f3": f3, "docs": docs,
    }


def _visible_slugs(user):
    return set(
        visible_documents(Document.objects.all(), user).values_list("slug", flat=True)
    )


# ── helper-level: four grant granularities ─────────────────────────────────

@pytest.mark.django_db
def test_no_grants_means_unrestricted(world, reader):
    assert _visible_slugs(reader) == {"a-root", "a-f1", "a-f2", "a-f3", "b-root"}


@pytest.mark.django_db
def test_kb_grant_limits_to_that_kb(world, reader):
    ReadGrant.objects.create(user=reader, knowledge_base=world["kb_b"])
    r = _fresh(reader)
    assert _visible_slugs(r) == {"b-root"}
    assert set(
        visible_kbs(KnowledgeBase.objects.all(), r).values_list("slug", flat=True)
    ) == {"kb-b"}
    assert visible_categories(KnowledgeBaseCategory.objects.all(), r).count() == 0


@pytest.mark.django_db
def test_category_grant_covers_its_kbs(world, reader):
    ReadGrant.objects.create(user=reader, category=world["cat_a"])
    r = _fresh(reader)
    assert _visible_slugs(r) == {"a-root", "a-f1", "a-f2", "a-f3"}
    assert set(
        visible_kbs(KnowledgeBase.objects.all(), r).values_list("slug", flat=True)
    ) == {"kb-a"}
    assert set(
        visible_categories(KnowledgeBaseCategory.objects.all(), r).values_list(
            "slug", flat=True
        )
    ) == {"cat-a"}


@pytest.mark.django_db
def test_folder_grant_covers_subtree_not_siblings(world, reader):
    ReadGrant.objects.create(user=reader, folder=world["f1"])
    r = _fresh(reader)
    # f1 and its child f2 are covered; sibling f3 and the KB root doc are not.
    assert _visible_slugs(r) == {"a-f1", "a-f2"}
    # Host KB (and its category) stay navigable so the grant is reachable.
    assert set(
        visible_kbs(KnowledgeBase.objects.all(), r).values_list("slug", flat=True)
    ) == {"kb-a"}
    assert set(
        visible_categories(KnowledgeBaseCategory.objects.all(), r).values_list(
            "slug", flat=True
        )
    ) == {"cat-a"}


@pytest.mark.django_db
def test_document_grant_limits_to_single_doc(world, reader):
    ReadGrant.objects.create(user=reader, document=world["docs"]["a_f3"])
    r = _fresh(reader)
    assert _visible_slugs(r) == {"a-f3"}
    assert set(
        visible_kbs(KnowledgeBase.objects.all(), r).values_list("slug", flat=True)
    ) == {"kb-a"}


@pytest.mark.django_db
def test_grants_are_additive(world, reader):
    ReadGrant.objects.create(user=reader, knowledge_base=world["kb_b"])
    ReadGrant.objects.create(user=reader, folder=world["f3"])
    r = _fresh(reader)
    assert _visible_slugs(r) == {"b-root", "a-f3"}


# ── interaction with the content-side audience gate (AND) ──────────────────

@pytest.mark.django_db
def test_grant_does_not_override_audience_include(world, reader):
    """Both gates must pass: a granted KB whose audience whitelist excludes
    the reader stays hidden."""
    kb_b = world["kb_b"]
    kb_b.audience_mode = "include"  # nobody targeted
    kb_b.save(update_fields=["audience_mode"])
    ReadGrant.objects.create(user=reader, knowledge_base=kb_b)
    r = _fresh(reader)
    assert _visible_slugs(r) == set()


@pytest.mark.django_db
def test_author_bypasses_grants(world, author):
    ReadGrant.objects.create(user=author, knowledge_base=world["kb_b"])
    assert len(_visible_slugs(author)) == 5


@pytest.mark.django_db
def test_anonymous_unaffected_by_grants(world, reader):
    from django.contrib.auth.models import AnonymousUser

    ReadGrant.objects.create(user=reader, knowledge_base=world["kb_b"])
    assert len(_visible_slugs(AnonymousUser())) == 5


@pytest.mark.django_db
def test_soft_deleted_grant_target_fails_closed(world, reader):
    """The grant row survives a soft delete (user stays restricted) but the
    deleted content itself is invisible — no silent un-restriction."""
    ReadGrant.objects.create(user=reader, folder=world["f1"])
    world["f1"].soft_delete()
    r = _fresh(reader)
    assert _visible_slugs(r) == set()


# ── endpoint-level: no leakage through public entries ──────────────────────

@pytest.fixture
def api():
    return APIClient()


@pytest.mark.django_db
def test_public_kb_list_hides_ungranted_kb_names(api, world, reader):
    ReadGrant.objects.create(user=reader, knowledge_base=world["kb_b"])
    api.force_authenticate(user=_fresh(reader))
    resp = api.get(reverse("api_v1:public-kb-list"))
    slugs = [k["slug"] for k in resp.data["results"]]
    assert slugs == ["kb-b"]


@pytest.mark.django_db
def test_public_tree_prunes_ungranted_folders(api, world, reader):
    ReadGrant.objects.create(user=reader, folder=world["f1"])
    api.force_authenticate(user=_fresh(reader))
    resp = api.get(reverse("api_v1:public-kb-tree", args=[world["kb_a"].slug]))
    assert resp.status_code == 200
    body = str(resp.data)
    assert "F1" in body and "F2" in body
    assert "F3" not in body  # empty ungranted sibling is pruned
    slugs = {d["slug"] for d in resp.data["documents"]}
    assert slugs == {"a-f1", "a-f2"}


@pytest.mark.django_db
def test_public_kb_post_count_narrowed_to_grants(api, world, reader):
    """KB cards must not advertise how many documents the reader can't see."""
    ReadGrant.objects.create(user=reader, folder=world["f1"])
    api.force_authenticate(user=_fresh(reader))
    resp = api.get(reverse("api_v1:public-kb-list"))
    kb_a = next(k for k in resp.data["results"] if k["slug"] == "kb-a")
    assert kb_a["post_count"] == 2  # a-f1 + a-f2, not the KB's full 4


@pytest.mark.django_db
def test_direct_access_to_ungranted_doc_404s(api, world, reader):
    ReadGrant.objects.create(user=reader, document=world["docs"]["a_f3"])
    api.force_authenticate(user=_fresh(reader))
    granted = world["docs"]["a_f3"]
    denied = world["docs"]["a_root"]
    assert (
        api.get(reverse("api_v1:public-post-by-id", args=[granted.id])).status_code
        == 200
    )
    assert (
        api.get(reverse("api_v1:public-post-by-id", args=[denied.id])).status_code
        == 404
    )


@pytest.mark.django_db
def test_favorite_and_comments_respect_grants(api, world, reader):
    ReadGrant.objects.create(user=reader, knowledge_base=world["kb_b"])
    api.force_authenticate(user=_fresh(reader))
    denied = world["docs"]["a_root"]
    granted = world["docs"]["b_root"]
    assert (
        api.post(reverse("api_v1:document-favorite", args=[denied.id])).status_code
        == 404
    )
    assert (
        api.post(reverse("api_v1:document-favorite", args=[granted.id])).status_code
        == 200
    )
    assert (
        api.get(reverse("api_v1:document-comments", args=[denied.id])).status_code
        == 404
    )
