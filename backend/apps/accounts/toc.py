"""Site-wide 目录 (TOC) defaults — public read + admin manage.

Same shape as ``hero.py``: one singleton model, a cached anonymous-facing
read, and a staff-only GET/PATCH. The blob is ``{scope: prefs}`` for the
three TOC surfaces (``TOC_SCOPES``: 大类/知识库列表 ``kblist`` · 知识库文档树
``kb`` · 文档内容目录 ``article``), each prefs dict validated against
``TOC_PREF_CHOICES`` / ``TOC_PREF_BOOLS`` (see ``models.py``); readers merge
their own localStorage overrides on top of it client-side.
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.permissions import IsContentAuthor, PublicOrLoginGated

from .models import (
    DEFAULT_TOC_PREFS,
    TOC_PREF_BOOLS,
    TOC_PREF_CHOICES,
    TOC_SCOPES,
    TocSettings,
    default_toc_site,
)


def _serialize(obj: TocSettings) -> dict:
    return {
        "prefs": {scope: dict(prefs) for scope, prefs in obj.prefs.items()},
        "defaults": default_toc_site(),
        "scopes": list(TOC_SCOPES),
        "updated_at": obj.updated_at.isoformat() if obj.updated_at else None,
    }


def _validate_patch(data) -> tuple[dict, str | None]:
    """Strict validation for one scope's admin write: unknown keys are
    ignored, but a known key with an out-of-range value is a 400 (never
    silently repaired — the admin form should see its mistake)."""
    if not isinstance(data, dict):
        return {}, "须为对象"
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
    """Reader-facing: the effective site defaults per scope (already repaired)."""
    from django.core.cache import cache

    cached = cache.get(TocSettings.PUBLIC_CACHE_KEY)
    if cached is None:
        cached = {"prefs": {scope: dict(prefs) for scope, prefs in TocSettings.load().prefs.items()}}
        cache.set(TocSettings.PUBLIC_CACHE_KEY, cached, TocSettings.PUBLIC_CACHE_TTL)
    return Response(cached)


@api_view(["GET", "PATCH"])
@permission_classes([IsContentAuthor])
def toc_settings(request):
    """Authenticated read; staff-only write.

    PATCH body is ``{scope: {subset of prefs}}`` for any of ``TOC_SCOPES``
    (other scopes untouched), ``{"reset": true}`` to restore every scope's
    factory defaults, or ``{"reset": "<scope>"}`` for one scope."""
    obj = TocSettings.load()
    if request.method == "PATCH":
        if not request.user.is_staff:
            return Response({"detail": "仅管理员可改"}, status=status.HTTP_403_FORBIDDEN)
        data = request.data if isinstance(request.data, dict) else {}
        reset = data.get("reset")
        if reset is True:
            obj.prefs = default_toc_site()
            obj.save()
            return Response(_serialize(obj))
        if reset is not None:
            if reset not in TOC_SCOPES:
                return Response({"detail": "reset 取值无效"}, status=status.HTTP_400_BAD_REQUEST)
            obj.prefs = {**obj.prefs, reset: dict(DEFAULT_TOC_PREFS)}
            obj.save()
            return Response(_serialize(obj))
        patches: dict = {}
        for scope in TOC_SCOPES:
            if scope not in data:
                continue
            clean, err = _validate_patch(data[scope])
            if err:
                return Response({"detail": f"{scope}: {err}"}, status=status.HTTP_400_BAD_REQUEST)
            patches[scope] = clean
        if not patches:
            return Response({"detail": "请求体须包含 kblist / kb / article 之一"}, status=status.HTTP_400_BAD_REQUEST)
        obj.prefs = {scope: {**obj.prefs.get(scope, {}), **patches.get(scope, {})} for scope in TOC_SCOPES}
        obj.save()
    return Response(_serialize(obj))
