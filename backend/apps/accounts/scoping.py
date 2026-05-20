"""Ownership-scoping helper shared across all owner-aware querysets.

The app's data model uses ``knowledge_base__owner`` (or direct ``owner`` on
Tag etc.) for tenant isolation. Originally every viewset filtered by the
current user, but that locks superusers out of admin-created data when there
are multiple staff accounts. Superusers bypass the filter; everyone else is
scoped to their own data.
"""
from __future__ import annotations


def scope_queryset(qs, user, field: str = "knowledge_base__owner"):
    """Restrict ``qs`` to objects owned (directly or transitively) by ``user``.

    - Anonymous → empty queryset.
    - Superuser → unchanged queryset (cross-tenant view).
    - Anyone else → ``qs.filter(<field>=user)``.

    ``field`` is the ORM lookup that resolves to a User; default is the
    Document/Folder pattern via ``knowledge_base__owner``.
    """
    if not getattr(user, "is_authenticated", False):
        return qs.none()
    if user.is_superuser:
        return qs
    return qs.filter(**{field: user})
