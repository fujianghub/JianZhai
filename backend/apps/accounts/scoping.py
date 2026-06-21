"""Content-scoping helper shared across all author-owned querysets.

v1.0 RBAC: the authoring side is a **single shared content pool**. All
authors (``is_staff`` — admin + root) see and edit the whole pool; normal
users (readers) own no creative content and get an empty queryset here.
Anonymous likewise.

Note the ``field`` argument is now only kept for call-site compatibility —
scoping is role-based, not owner-based, so the lookup path is no longer used
to filter. Reader-facing surfaces that must stay accessible to normal users
(comments on / favorites of public docs) deliberately do NOT route through
this helper; they resolve documents by blog visibility instead.
"""
from __future__ import annotations


def scope_queryset(qs, user, field: str = "knowledge_base__owner"):
    """Restrict ``qs`` to the shared authoring content pool for ``user``.

    - Author (``is_staff`` → admin + root) → unchanged queryset (full pool).
    - Normal user / anonymous → empty queryset.

    ``field`` is accepted for backwards-compatible call sites but no longer
    affects the result (scoping is role-based, not owner-based).
    """
    if not getattr(user, "is_authenticated", False):
        return qs.none()
    if getattr(user, "is_staff", False):
        return qs
    return qs.none()
