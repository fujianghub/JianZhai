"""AI assistant endpoints.

Two paths:
  POST /api/v1/ai/run/         non-streaming JSON
  POST /api/v1/ai/stream/      SSE stream of text deltas

Auth: requires login (single-user / staff use case). We add IsAuthenticated
explicitly so anonymous traffic doesn't burn API quota.

Rate-limiting piggybacks on DRF's default throttle scope.
"""
from __future__ import annotations

import json

from django.http import StreamingHttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from datetime import timedelta

from django.db.models import Count, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from .models import AISettings, AIUsageLog
from .prompts import OPERATION_INSTRUCTIONS
from .services import (
    AIUnavailable,
    AVAILABLE_MODELS,
    ALLOWED_MODEL_IDS,
    DEFAULT_MODEL,
    get_default_model,
    is_enabled,
    run_once,
    run_stream,
)


SUPPORTED_OPS = sorted(OPERATION_INSTRUCTIONS.keys())


class AIWriteThrottle(UserRateThrottle):
    scope = "ai_write"


def _parse_payload(request) -> tuple[str, str, str, str | None] | Response:
    op = (request.data.get("operation") or "").strip()
    content = (request.data.get("content") or "").strip()
    extra = (request.data.get("extra") or "").strip()
    model = (request.data.get("model") or "").strip() or None
    if op not in OPERATION_INSTRUCTIONS:
        return Response(
            {"detail": f"未知操作 {op!r}", "supported": SUPPORTED_OPS},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not content:
        return Response({"detail": "content 不能为空"}, status=status.HTTP_400_BAD_REQUEST)
    if len(content) > 30_000:
        return Response(
            {"detail": "内容超过 30000 字符上限"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return op, content, extra, model


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([AIWriteThrottle])
def run(request):
    if not is_enabled():
        return Response({"detail": "AI 功能已被管理员关闭", "code": "ai_disabled"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    parsed = _parse_payload(request)
    if isinstance(parsed, Response):
        return parsed
    op, content, extra, model = parsed
    try:
        text = run_once(op, content, extra, model=model, user=request.user)
    except AIUnavailable as e:
        return Response({"detail": str(e), "code": "ai_unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except Exception as e:  # noqa: BLE001 — surface API errors verbatim
        return Response({"detail": str(e), "code": "ai_error"}, status=status.HTTP_502_BAD_GATEWAY)
    return Response({"operation": op, "model": model or DEFAULT_MODEL, "result": text})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([AIWriteThrottle])
def stream(request):
    if not is_enabled():
        return Response({"detail": "AI 功能已被管理员关闭", "code": "ai_disabled"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    parsed = _parse_payload(request)
    if isinstance(parsed, Response):
        return parsed
    op, content, extra, model = parsed

    user = request.user

    def event_stream():
        try:
            for delta in run_stream(op, content, extra, model=model, user=user):
                yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
            yield "event: done\ndata: {}\n\n"
        except AIUnavailable as e:
            yield f"event: error\ndata: {json.dumps({'detail': str(e), 'code': 'ai_unavailable'}, ensure_ascii=False)}\n\n"
        except Exception as e:  # noqa: BLE001
            yield f"event: error\ndata: {json.dumps({'detail': str(e), 'code': 'ai_error'}, ensure_ascii=False)}\n\n"

    resp = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
    resp["Cache-Control"] = "no-cache"
    resp["X-Accel-Buffering"] = "no"  # disable nginx buffering if proxied
    return resp


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def capabilities(request):
    """Tell the frontend which operations + models are available."""
    import os
    return Response(
        {
            "configured": bool(os.environ.get("ANTHROPIC_API_KEY")),
            "enabled": is_enabled(),
            "operations": SUPPORTED_OPS,
            "models": AVAILABLE_MODELS,
            "default_model": get_default_model(),
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def usage(request):
    """Aggregated usage stats. Admin sees everyone; others see only their own.

    Query params:
      ?days=30            window length (default 30, max 365)
      ?model=...          filter to one model
    """
    try:
        days = max(1, min(365, int(request.query_params.get("days", 30))))
    except (TypeError, ValueError):
        days = 30
    cutoff = timezone.now() - timedelta(days=days)
    qs = AIUsageLog.objects.filter(created_at__gte=cutoff)
    if not request.user.is_staff:
        qs = qs.filter(user=request.user)
    model = request.query_params.get("model")
    if model:
        qs = qs.filter(model=model)

    totals = qs.aggregate(
        calls=Count("id"),
        input_tokens=Sum("input_tokens"),
        output_tokens=Sum("output_tokens"),
    )
    failed = qs.filter(succeeded=False).count()

    # Per-model breakdown
    by_model = list(
        qs.values("model")
        .annotate(
            calls=Count("id"),
            input_tokens=Sum("input_tokens"),
            output_tokens=Sum("output_tokens"),
        )
        .order_by("-calls")
    )

    # Per-day series for the chart
    by_day_qs = (
        qs.annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(
            calls=Count("id"),
            input_tokens=Sum("input_tokens"),
            output_tokens=Sum("output_tokens"),
        )
        .order_by("day")
    )
    by_day = [
        {
            "day": row["day"].isoformat() if row["day"] else None,
            "calls": row["calls"] or 0,
            "input_tokens": row["input_tokens"] or 0,
            "output_tokens": row["output_tokens"] or 0,
        }
        for row in by_day_qs
    ]

    # Per-operation breakdown
    by_op = list(
        qs.values("operation")
        .annotate(calls=Count("id"))
        .order_by("-calls")
    )

    # Recent calls (most recent 20)
    recent = [
        {
            "id": r.id,
            "user": r.user.username if r.user_id else None,
            "operation": r.operation,
            "model": r.model,
            "streaming": r.streaming,
            "input_tokens": r.input_tokens,
            "output_tokens": r.output_tokens,
            "duration_ms": r.duration_ms,
            "succeeded": r.succeeded,
            "error": r.error,
            "created_at": r.created_at.isoformat(),
        }
        for r in qs.select_related("user")[:20]
    ]

    return Response({
        "window_days": days,
        "totals": {
            "calls": totals["calls"] or 0,
            "input_tokens": totals["input_tokens"] or 0,
            "output_tokens": totals["output_tokens"] or 0,
            "failed": failed,
        },
        "by_model": by_model,
        "by_day": by_day,
        "by_operation": by_op,
        "recent": recent,
    })


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def settings_view(request):
    """Admin-only read/write of the singleton AI settings.

    PATCH body: { default_model?, enabled?, max_tokens? }
    """
    if not request.user.is_staff:
        return Response({"detail": "需要管理员权限"}, status=status.HTTP_403_FORBIDDEN)
    obj = AISettings.load()
    if request.method == "PATCH":
        data = request.data if isinstance(request.data, dict) else {}
        if "default_model" in data:
            requested = str(data["default_model"]).strip()
            if requested and requested not in ALLOWED_MODEL_IDS:
                return Response(
                    {"detail": f"未知模型 {requested!r}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            obj.default_model = requested or obj.default_model
        if "enabled" in data:
            obj.enabled = bool(data["enabled"])
        if "max_tokens" in data:
            try:
                n = int(data["max_tokens"])
            except (TypeError, ValueError):
                return Response({"detail": "max_tokens 必须是整数"}, status=400)
            if n < 64 or n > 8192:
                return Response({"detail": "max_tokens 范围 64–8192"}, status=400)
            obj.max_tokens = n
        obj.save()
    return Response(
        {
            "default_model": obj.default_model,
            "enabled": obj.enabled,
            "max_tokens": obj.max_tokens,
            "updated_at": obj.updated_at.isoformat() if obj.updated_at else None,
            "models": AVAILABLE_MODELS,
        }
    )
