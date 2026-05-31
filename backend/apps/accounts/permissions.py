"""Permission classes for cross-cutting access policies.

v0.9.8 adds ``PublicOrLoginGated`` — the default "open to everyone unless
admin flipped SITE_REQUIRE_LOGIN" gate for the public blog endpoints. Lives
here (not in ``apps.blog``) because exporters / future API surfaces may
want the same gate.
"""
from __future__ import annotations

from django.conf import settings
from rest_framework.permissions import BasePermission


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
