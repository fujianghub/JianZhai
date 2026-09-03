"""Site-wide 目录 (TOC) defaults — public read + admin manage.

Same shape as ``hero.py``: one singleton model, a cached anonymous-facing
read, and a staff-only GET/PATCH. The blob is a flat dict validated against
``TOC_PREF_CHOICES`` / ``TOC_PREF_BOOLS`` (see ``models.py``); readers merge
their own localStorage overrides on top of it client-side.
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.permissions import IsContentAuthor, PublicOrLoginGated

from .models import DEFAULT_TOC_PREFS, TOC_PREF_BOOLS, TOC_PREF_CHOICES, TocSettings


def _serialize(obj: TocSettings) -> dict:
    return {
        "prefs": dict(obj.prefs),
        "defaults": dict(DEFAULT_TOC_PREFS),
        "updated_at": obj.updated_at.isoformat() if obj.updated_at else None,
    }


def _validate_patch(data) -> tuple[dict, str | None]:
    """Strict validation for admin writes: unknown keys are ignored, but a
    known key with an out-of-range value is a 400 (never silently repaired —
    the admin form should see its mistake)."""
    if not isinstance(data, dict):
        return {}, "请求体须为对象"
    clean: dict = {}
    for key, choices in TOC_PREF_CHOICES.items():
        if key not in data:
            continue
        v = data[key]
        if key == "depth":
            try:
                v = int(v)
            except (TypeError, ValueError):
                return {}, f"{key} 取值无效"
        if v not in choices:
            return {}, f"{key} 取值无效"
        clean[key] = v
    for key in TOC_PREF_BOOLS:
        if key not in data:
            continue
        if not isinstance(data[key], bool):
            return {}, f"{key} 须为布尔值"
        clean[key] = data[key]
    return clean, None


@api_view(["GET"])
@permission_classes([PublicOrLoginGated])
def toc_public(request):
    """Reader-facing: the effective site defaults (already repaired)."""
    from django.core.cache import cache

    cached = cache.get(TocSettings.PUBLIC_CACHE_KEY)
    if cached is None:
        cached = {"prefs": dict(TocSettings.load().prefs)}
        cache.set(TocSettings.PUBLIC_CACHE_KEY, cached, TocSettings.PUBLIC_CACHE_TTL)
    return Response(cached)


@api_view(["GET", "PATCH"])
@permission_classes([IsContentAuthor])
def toc_settings(request):
    """Authenticated read; staff-only write of any subset of the prefs keys.
    ``{"reset": true}`` restores the factory defaults."""
    obj = TocSettings.load()
    if request.method == "PATCH":
        if not request.user.is_staff:
            return Response({"detail": "仅管理员可改"}, status=status.HTTP_403_FORBIDDEN)
        data = request.data if isinstance(request.data, dict) else {}
        if data.get("reset") is True:
            obj.prefs = dict(DEFAULT_TOC_PREFS)
            obj.save()
            return Response(_serialize(obj))
        clean, err = _validate_patch(data)
        if err:
            return Response({"detail": err}, status=status.HTTP_400_BAD_REQUEST)
        obj.prefs = {**obj.prefs, **clean}
        obj.save()
    return Response(_serialize(obj))
