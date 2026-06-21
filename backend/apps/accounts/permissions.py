"""Permission classes for cross-cutting access policies.

v0.9.8 adds ``PublicOrLoginGated`` — the default "open to everyone unless
admin flipped SITE_REQUIRE_LOGIN" gate for the public blog endpoints. Lives
here (not in ``apps.blog``) because exporters / future API surfaces may
want the same gate.

v0.9.9 adds the ``is_root_admin()`` helper used by the user-management
viewset to decide who can disable / reset-password / demote whom.
"""
from __future__ import annotations

from django.conf import settings
from rest_framework.permissions import BasePermission


def is_root_admin(user) -> bool:
    """True when ``user`` is the configured root administrator.

    The root admin is the single account that can touch other
    superusers (including the default ``admin``). Determined by the
    ``ROOT_ADMIN_USERNAME`` setting (default ``"fengfujiang"``).

    Requires both ``is_superuser`` AND username match — promoting a
    different account named fengfujiang to root without superuser
    status would be a quiet privilege escalation, so we require both.
    """
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if not getattr(user, "is_superuser", False):
        return False
    target = getattr(settings, "ROOT_ADMIN_USERNAME", "")
    return bool(target) and user.username == target


def get_role(user) -> str:
    """Resolve the single canonical role string for ``user``.

    The whole permission model derives from this — one source of truth so
    backend checks and the frontend (via the ``role`` field on ``me``) never
    drift. Order matters: root is also ``is_staff``/``is_superuser`` so it
    must be tested before the generic admin branch.

    Returns one of ``"anon" | "user" | "admin" | "root"``.

      - ``root``  → the configured root admin (see :func:`is_root_admin`).
      - ``admin`` → ``is_staff`` (the "author" tier: full shared content pool).
      - ``user``  → authenticated reader (no authoring rights).
      - ``anon``  → not authenticated.
    """
    if not user or not getattr(user, "is_authenticated", False):
        return "anon"
    if is_root_admin(user):
        return "root"
    if getattr(user, "is_staff", False):
        return "admin"
    return "user"


def can_manage_user(actor, target) -> tuple[bool, str]:
    """Whether ``actor`` is allowed to disable / reset / demote ``target``.

    Returns ``(allowed, reason_if_not)`` so the caller can surface a
    helpful error to the UI.

    Rules:
      - Nobody can touch themselves through these endpoints (use the
        "change password" self-service flow instead).
      - The root admin can touch anyone but themselves.
      - A non-root admin can manage ONLY plain normal users — not other
        admins, not (other) superusers, not the root. Admins are peers and
        must not be able to disable / demote one another.
    """
    if not actor or not getattr(actor, "is_authenticated", False):
        return False, "需要登录"
    if not getattr(actor, "is_staff", False):
        return False, "需要管理员权限"
    if target.pk == actor.pk:
        return False, "不能对自己执行此操作"
    if is_root_admin(actor):
        # Root can touch anyone but themselves (caught above).
        return True, ""
    # Non-root admin: target must be a plain normal user.
    if target.is_staff or target.is_superuser:
        return False, "只能管理普通用户"
    return True, ""


class IsContentAuthor(BasePermission):
    """Author tier — admin + root. Gates the shared content pool and every
    authoring surface (KB/doc CRUD, uploads, AI, exports, trash …).

    Equivalent to ``is_staff`` because root is also staff. Normal users
    (readers) are rejected.
    """

    message = "需要作者权限"

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.is_staff)


class IsRoot(BasePermission):
    """Root-only — irreversible / structural destruction (delete KB, delete
    category, purge trash, empty trash) and the system-overview page."""

    message = "仅根管理员可执行此操作"

    def has_permission(self, request, view):
        return is_root_admin(request.user)


class PublicOrLoginGated(BasePermission):
    """Anonymous traffic OK unless ``SITE_REQUIRE_LOGIN=true`` flips the
    deployment into "friends-only" mode.

    Use exactly like ``AllowAny`` — drop in for the existing public
    endpoints. The check reads ``settings.SITE_REQUIRE_LOGIN`` so a single
    env var flip in ``backend/.env`` private-locks the entire blog without
    needing a code deploy.

    Why a custom class instead of conditionally swapping AllowAny /
    IsAuthenticated at view-load time: settings can be re-loaded in
    runtime (test override, signal-driven reload, etc), and DRF caches
    permission_classes per-view at import time. A class that checks the
    flag *per request* always picks up the current value.
    """

    message = "需要登录才能访问"

    def has_permission(self, request, view):
        if not getattr(settings, "SITE_REQUIRE_LOGIN", False):
            return True
        return bool(request.user and request.user.is_authenticated)
