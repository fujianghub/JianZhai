"""Reader-facing audience visibility for knowledge bases and categories.

WeChat-Moments-style three-state visibility (see ``AUDIENCE_MODES`` in
``apps.knowledge.models``):

- ``all``     — visible to every reader (default; preserves legacy behaviour).
- ``exclude`` — blacklist: hidden from the targeted users / tags only.
- ``include`` — whitelist: visible only to the targeted users / tags.

Targeting is by **user** and/or **user tag** (``apps.accounts.UserTag``); a
reader is "targeted" if they are in ``audience_users`` OR carry any tag in
``audience_tags``.

This module is the single enforcement point. Every reader-facing entry
(blog list/detail/tree/archive/rss/sitemap/related/adjacent/backlinks,
favorites, comments, search) routes its document/KB/category querysets through
``visible_documents`` / ``visible_kbs`` / ``visible_categories`` so a hidden KB
or category can never leak — not via direct slug, search, or feed.

Authors (``is_staff`` → admin + root) always bypass filtering: audience is a
reader concept, consistent with the role-based shared content pool
(``apps.accounts.scoping``).

Implementation note: negation across a M2M (``~Q(audience_users=...)``) can
drop rows or duplicate them. We instead compute the set of *targeted* KB /
category ids as a subquery and use plain ``filter`` / ``exclude`` against it.
"""

from __future__ import annotations

from django.db.models import Q

from .models import KnowledgeBase, KnowledgeBaseCategory


def _is_author(user) -> bool:
    return bool(getattr(user, "is_staff", False))


def _user_tag_ids(user) -> list[int]:
    """The reader's own ``UserTag`` ids, memoised on the user for the request.

    ``_apply_audience`` runs once per KB and once per category, and a single
    reader-facing request (e.g. the archive view) fans out to many
    ``visible_documents`` calls — each previously re-ran ``account_tags``. The
    id list is identical every time within a request, so cache it on the
    request-scoped ``user`` instance. ``request.user`` is rebuilt per request,
    so this never leaks across requests.
    """
    cached = getattr(user, "_cached_account_tag_ids", None)
    if cached is not None:
        return cached
    tag_ids = list(user.account_tags.values_list("id", flat=True))
    try:
        user._cached_account_tag_ids = tag_ids
    except (AttributeError, TypeError):
        # Some auth backends hand back objects that reject attribute writes;
        # fall back to recomputing rather than failing the request.
        pass
    return tag_ids


def _targeted_q(user) -> Q:
    """Q matching rows whose audience set contains ``user`` (by id or by tag)."""
    if not getattr(user, "is_authenticated", False):
        # Anonymous readers carry no identity and no tags — they can never be
        # targeted. ``pk__in=[]`` is a guaranteed-empty match.
        return Q(pk__in=[])
    tag_ids = _user_tag_ids(user)
    return Q(audience_users=user.id) | Q(audience_tags__in=tag_ids)


def _apply_audience(qs, model, user):
    """Filter ``qs`` (of ``model``) by each row's own audience settings."""
    if _is_author(user):
        return qs
    hit = model.objects.filter(_targeted_q(user)).values("id")
    # Keep: every ``all`` row, every ``exclude`` row (pruned next), and the
    # ``include`` rows the reader is targeted by. Then drop the ``exclude``
    # rows the reader IS targeted by (the blacklist). Order matters — the
    # ``exclude`` rows must survive the filter so ``.exclude`` can prune them.
    return (
        qs.filter(
            Q(audience_mode="all")
            | Q(audience_mode="exclude")
            | Q(audience_mode="include", id__in=hit)
        )
        .exclude(audience_mode="exclude", id__in=hit)
    )


def visible_kbs(qs, user):
    """Restrict a ``KnowledgeBase`` queryset to those visible to ``user``."""
    return _apply_audience(qs, KnowledgeBase, user)


def visible_categories(qs, user):
    """Restrict a ``KnowledgeBaseCategory`` queryset to those visible to ``user``."""
    return _apply_audience(qs, KnowledgeBaseCategory, user)


def visible_documents(qs, user):
    """Restrict a ``Document`` queryset to docs whose KB *and* category are visible.

    A document is visible iff its knowledge base is audience-visible AND
    (it has no category OR that category is audience-visible).
    """
    if _is_author(user):
        return qs
    kb_ids = visible_kbs(KnowledgeBase.objects.all(), user).values("id")
    cat_ids = visible_categories(
        KnowledgeBaseCategory.objects.all(), user
    ).values("id")
    return qs.filter(knowledge_base__in=kb_ids).filter(
        Q(knowledge_base__category__isnull=True)
        | Q(knowledge_base__category__in=cat_ids)
    )
