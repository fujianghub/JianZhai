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

Since the per-user read grants (``apps.accounts.ReadGrant``) landed, this
module enforces **two gates ANDed together**:

1. content-side audience (the three-state modes above), and
2. user-side whitelist — a reader with one or more ``ReadGrant`` rows only
   sees content matched by at least one grant (whole KB / category /
   folder subtree / single document). No grants = unrestricted (legacy).

Both gates live here so every reader entry stays a single choke point; any
new reader-facing queryset must still route through ``visible_*``.

Implementation note: negation across a M2M (``~Q(audience_users=...)``) can
drop rows or duplicate them. We instead compute the set of *targeted* KB /
category ids as a subquery and use plain ``filter`` / ``exclude`` against it.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from django.db.models import Q

from .models import Document, Folder, KnowledgeBase, KnowledgeBaseCategory


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


@dataclass(frozen=True)
class _GrantSet:
    """Resolved per-user read grants, expanded to id sets for filtering.

    ``allowed_kb_ids`` / ``cats_of_allowed_kbs`` exist so a folder- or
    document-level grant keeps its *host* KB (and that KB's category) in the
    reader's navigation — otherwise the user would hold a grant with no way
    to reach it. Documents inside those hosts are still narrowed by the
    per-document OR-filter in ``visible_documents``.
    """

    kb_ids: frozenset[int] = field(default_factory=frozenset)
    category_ids: frozenset[int] = field(default_factory=frozenset)
    folder_subtree_ids: frozenset[int] = field(default_factory=frozenset)
    document_ids: frozenset[int] = field(default_factory=frozenset)
    allowed_kb_ids: frozenset[int] = field(default_factory=frozenset)
    cats_of_allowed_kbs: frozenset[int] = field(default_factory=frozenset)


def _expand_folder_subtrees(folder_ids: set[int], host_kb_ids: set[int]) -> set[int]:
    """Granted folder ids plus every alive descendant (BFS over parent links).

    One query pulls the full folder adjacency of the host KBs; the walk runs
    in Python. Soft-deleted folders are excluded by the default manager, so
    a pruned branch fails closed.
    """
    if not folder_ids:
        return set()
    children: dict[int | None, list[int]] = {}
    for fid, parent_id in Folder.objects.filter(
        knowledge_base_id__in=host_kb_ids
    ).values_list("id", "parent_id"):
        children.setdefault(parent_id, []).append(fid)
    result: set[int] = set()
    queue = [fid for fid in folder_ids]
    while queue:
        fid = queue.pop()
        if fid in result:
            continue
        result.add(fid)
        queue.extend(children.get(fid, []))
    return result


def _resolve_read_grants(user) -> _GrantSet | None:
    """The reader's resolved ``ReadGrant`` set, or ``None`` if unrestricted.

    Memoised on the request-scoped ``user`` instance (same rationale as
    ``_user_tag_ids``): an unrestricted reader costs exactly one empty
    query per request; a restricted one at most four.
    """
    if not getattr(user, "is_authenticated", False):
        return None  # anonymous users can never hold grants
    if hasattr(user, "_cached_read_grants"):
        return user._cached_read_grants
    from apps.accounts.models import ReadGrant  # local import: avoid app cycle

    rows = list(
        ReadGrant.objects.filter(user=user).values(
            "knowledge_base_id", "category_id", "folder_id", "document_id"
        )
    )
    if not rows:
        result: _GrantSet | None = None
    else:
        kb_ids = {r["knowledge_base_id"] for r in rows if r["knowledge_base_id"]}
        category_ids = {r["category_id"] for r in rows if r["category_id"]}
        folder_ids = {r["folder_id"] for r in rows if r["folder_id"]}
        document_ids = {r["document_id"] for r in rows if r["document_id"]}

        folder_host_kb_ids = set(
            Folder.objects.filter(id__in=folder_ids).values_list(
                "knowledge_base_id", flat=True
            )
        )
        doc_host_kb_ids = set(
            Document.objects.filter(id__in=document_ids).values_list(
                "knowledge_base_id", flat=True
            )
        )
        allowed_kb_ids = kb_ids | folder_host_kb_ids | doc_host_kb_ids
        folder_subtree_ids = _expand_folder_subtrees(folder_ids, folder_host_kb_ids)
        cats_of_allowed_kbs = set(
            KnowledgeBase.objects.filter(
                id__in=allowed_kb_ids, category__isnull=False
            ).values_list("category_id", flat=True)
        )
        result = _GrantSet(
            kb_ids=frozenset(kb_ids),
            category_ids=frozenset(category_ids),
            folder_subtree_ids=frozenset(folder_subtree_ids),
            document_ids=frozenset(document_ids),
            allowed_kb_ids=frozenset(allowed_kb_ids),
            cats_of_allowed_kbs=frozenset(cats_of_allowed_kbs),
        )
    try:
        user._cached_read_grants = result
    except (AttributeError, TypeError):
        pass
    return result


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


def grant_documents_q(user, doc_prefix: str = "documents__") -> Q | None:
    """Optional ``Q`` narrowing a document relation to the reader's grants.

    For aggregates that count documents through a relation (e.g. the public
    KB list's per-KB post count) — ``visible_documents`` can't be applied
    inside an annotation, so this exposes the same grant OR-filter with a
    relation prefix. Returns ``None`` for authors and unrestricted readers
    (caller skips the extra filter entirely).
    """
    if _is_author(user):
        return None
    g = _resolve_read_grants(user)
    if g is None:
        return None
    return (
        Q(**{f"{doc_prefix}knowledge_base_id__in": g.kb_ids})
        | Q(**{f"{doc_prefix}knowledge_base__category_id__in": g.category_ids})
        | Q(**{f"{doc_prefix}folder_id__in": g.folder_subtree_ids})
        | Q(**{f"{doc_prefix}id__in": g.document_ids})
    )


def visible_kbs(qs, user):
    """Restrict a ``KnowledgeBase`` queryset to those visible to ``user``."""
    if _is_author(user):
        return qs
    qs = _apply_audience(qs, KnowledgeBase, user)
    g = _resolve_read_grants(user)
    if g is not None:
        # Host KBs of folder/document grants stay navigable; their documents
        # are narrowed in ``visible_documents``.
        qs = qs.filter(Q(id__in=g.allowed_kb_ids) | Q(category_id__in=g.category_ids))
    return qs


def visible_categories(qs, user):
    """Restrict a ``KnowledgeBaseCategory`` queryset to those visible to ``user``."""
    if _is_author(user):
        return qs
    qs = _apply_audience(qs, KnowledgeBaseCategory, user)
    g = _resolve_read_grants(user)
    if g is not None:
        qs = qs.filter(Q(id__in=g.category_ids) | Q(id__in=g.cats_of_allowed_kbs))
    return qs


def visible_documents(qs, user):
    """Restrict a ``Document`` queryset to docs whose KB *and* category are visible.

    A document is visible iff its knowledge base is visible AND (it has no
    category OR that category is visible) AND — for a grant-restricted
    reader — it is matched by at least one of their grants (whole KB,
    category, folder subtree, or the document itself).
    """
    if _is_author(user):
        return qs
    kb_ids = visible_kbs(KnowledgeBase.objects.all(), user).values("id")
    cat_ids = visible_categories(
        KnowledgeBaseCategory.objects.all(), user
    ).values("id")
    qs = qs.filter(knowledge_base__in=kb_ids).filter(
        Q(knowledge_base__category__isnull=True)
        | Q(knowledge_base__category__in=cat_ids)
    )
    g = _resolve_read_grants(user)
    if g is not None:
        # Plain forward-FK joins — no M2M, no row duplication, no distinct().
        qs = qs.filter(
            Q(knowledge_base_id__in=g.kb_ids)
            | Q(knowledge_base__category_id__in=g.category_ids)
            | Q(folder_id__in=g.folder_subtree_ids)
            | Q(id__in=g.document_ids)
        )
    return qs
