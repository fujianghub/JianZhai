"""AI assistant endpoints — v0.9.7 expanded surface.

Endpoint map:
  POST /api/v1/ai/run/              non-streaming single-shot
  POST /api/v1/ai/stream/           SSE stream of text deltas
  POST /api/v1/ai/chat/             SSE multi-turn chat
  GET  /api/v1/ai/capabilities/     models + operations + templates
  GET  /api/v1/ai/usage/            aggregated usage stats
  GET  /api/v1/ai/usage/csv/        usage data as CSV export
  GET, PATCH /api/v1/ai/settings/   admin settings (default_model, budget, ...)
  GET, POST                    /api/v1/ai/templates/       list/create user prompts
  GET, PATCH, DELETE           /api/v1/ai/templates/<id>/  edit/remove user prompt
  GET, DELETE                  /api/v1/ai/conversations/   list/clear chats
  GET, DELETE                  /api/v1/ai/conversations/<id>/

Auth: all routes require login. Mutations on settings + budget endpoints
also require is_staff.

Rate-limiting via AIWriteThrottle (scope=ai_write, 30/min/user). The
per-user daily budget is enforced inside services.check_daily_budget so
even bypassed throttles can't blow the spending cap.
"""
from __future__ import annotations

import csv
import json
import logging
from datetime import timedelta
from io import StringIO

from django.conf import settings
from django.db.models import Count, Sum
from django.db.models.functions import TruncDate
from django.http import HttpResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from apps.accounts.scoping import scope_queryset
from apps.knowledge.models import Document, KnowledgeBase

from .models import AIConversation, AIPromptTemplate, AISettings, AIUsageLog
from .pricing import MODEL_PRICES_USD, estimate_cost_usd, estimate_input_tokens_from_chars
from .prompts import OPERATION_INSTRUCTIONS
from .services import (
    AIBudgetExceeded,
    AIUnavailable,
    AVAILABLE_MODELS,
    ALLOWED_MODEL_IDS,
    FALLBACK_CHAIN,
    get_default_model,
    is_enabled,
    is_thinking_enabled,
    resolve_model,
    run_chat_stream,
    run_once,
    run_stream,
)

log = logging.getLogger(__name__)

# Built-in op set. Custom user templates are merged into this list via the
# capabilities endpoint, but for run/ + stream/ we still validate operation
# is either built-in OR a user-owned template id (prefixed ``tpl_``).
SUPPORTED_OPS = sorted(OPERATION_INSTRUCTIONS.keys())


def _ai_error_detail(exc: Exception) -> str:
    if settings.DEBUG:
        return str(exc)
    log.exception("AI request failed")
    return "AI 服务暂时不可用，请稍后重试"


class AIWriteThrottle(UserRateThrottle):
    scope = "ai_write"


class AIReadThrottle(UserRateThrottle):
    """Read/management AI endpoints. The global default throttle only covers
    anonymous users, so without this an authenticated user could hammer the
    usage aggregations / CSV export / estimate endpoint without limit."""

    scope = "ai_read"


def _owned_fk_id(model, user, raw, *, owner_field: str = "knowledge_base__owner"):
    """Validate an attribution FK id from the request body.

    Returns the int pk only when the object exists AND is visible to ``user``
    under tenant scoping; otherwise ``None`` (attribution is optional
    metadata, so unowned/garbage ids are silently dropped rather than 4xx-ing
    the whole AI call). Prevents cross-tenant usage-attribution pollution.
    """
    if not raw:
        return None
    try:
        pk = int(raw)
    except (TypeError, ValueError):
        return None
    qs = scope_queryset(model.objects.all(), user, field=owner_field)
    return pk if qs.filter(pk=pk).exists() else None


# data:image/<subtype>;base64 — only raster formats the providers accept.
ALLOWED_IMAGE_DATA_PREFIXES = tuple(
    f"data:image/{sub};base64," for sub in ("png", "jpeg", "jpg", "webp", "gif")
)
# ~7.5MB binary per image once base64-decoded; well within provider limits
# and keeps an 8-image payload under the global 50MB body cap.
MAX_IMAGE_DATA_CHARS = 10_000_000


# ── Payload parsing ─────────────────────────────────────────────────────


def _parse_payload(request) -> tuple | Response:
    """Parse the common /run/ + /stream/ payload shape.

    Returns a tuple ``(op, content, extra, model, images, thinking, document_id,
    knowledge_base_id, template_instruction)`` on success, or a 4xx Response.

    ``op`` may be a built-in operation key OR a user-template id like
    ``tpl_<id>``. When it's a template, ``template_instruction`` is its
    saved instruction text — we'll inject it via the ``extra`` channel and
    coerce ``op`` to the closest built-in (``polish`` by default) so the
    downstream code path stays simple.
    """
    op = (request.data.get("operation") or "").strip()
    content = (request.data.get("content") or "").strip()
    extra = (request.data.get("extra") or "").strip()
    model = (request.data.get("model") or "").strip() or None
    images = request.data.get("images") or []
    thinking_raw = request.data.get("thinking", None)
    thinking = None if thinking_raw is None else bool(thinking_raw)
    # Attribution ids must belong to the caller — otherwise any user could
    # pollute admin usage stats by billing calls to someone else's doc/KB.
    document_id = _owned_fk_id(Document, request.user, request.data.get("document_id"))
    knowledge_base_id = _owned_fk_id(
        KnowledgeBase, request.user, request.data.get("knowledge_base_id"),
        owner_field="owner",
    )
    template_instruction = ""

    # Operation can be built-in OR ``tpl_<id>`` for user templates.
    if op.startswith("tpl_"):
        try:
            tpl_id = int(op[4:])
        except ValueError:
            return Response({"detail": f"非法模板 ID {op!r}"}, status=400)
        try:
            tpl = AIPromptTemplate.objects.get(pk=tpl_id, owner=request.user)
        except AIPromptTemplate.DoesNotExist:
            return Response({"detail": "模板不存在或无权访问"}, status=404)
        template_instruction = tpl.instruction.strip()
        # Use ``polish`` as the wire-level op so existing routing works;
        # the actual instruction rides via extra-prepended text.
        op = "polish"
        if template_instruction and extra:
            extra = f"{template_instruction}\n\n{extra}"
        elif template_instruction:
            extra = template_instruction

    if op not in OPERATION_INSTRUCTIONS:
        return Response(
            {"detail": f"未知操作 {op!r}", "supported": SUPPORTED_OPS},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not content and not images:
        return Response({"detail": "content 不能为空"}, status=status.HTTP_400_BAD_REQUEST)
    if len(content) > 30_000:
        return Response(
            {"detail": "内容超过 30000 字符上限"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not isinstance(images, list) or len(images) > 8:
        return Response(
            {"detail": "images 必须是数组且最多 8 张"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    # Validate each image is a data: URL of an accepted raster type and size.
    for img in images:
        if not (isinstance(img, str) and img.startswith(ALLOWED_IMAGE_DATA_PREFIXES)):
            return Response(
                {"detail": "images 元素必须是 data:image/(png|jpeg|webp|gif);base64 URL"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(img) > MAX_IMAGE_DATA_CHARS:
            return Response(
                {"detail": "单张图片超过大小上限（约 7MB）"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    return op, content, extra, model, images, thinking, document_id, knowledge_base_id


# ── /run/ and /stream/ ─────────────────────────────────────────────────


def _budget_response(exc: AIBudgetExceeded) -> Response:
    return Response(
        {"detail": str(exc), "code": "ai_budget_exceeded"},
        status=429,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([AIWriteThrottle])
def run(request):
    if not is_enabled():
        return Response({"detail": "AI 功能已被管理员关闭", "code": "ai_disabled"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    parsed = _parse_payload(request)
    if isinstance(parsed, Response):
        return parsed
    op, content, extra, model, images, thinking, document_id, knowledge_base_id = parsed
    try:
        text = run_once(
            op, content, extra, model=model, user=request.user,
            document_id=document_id, knowledge_base_id=knowledge_base_id,
            images=images, thinking=thinking,
        )
    except AIBudgetExceeded as e:
        return _budget_response(e)
    except AIUnavailable as e:
        return Response({"detail": str(e), "code": "ai_unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except Exception as e:  # noqa: BLE001
        return Response(
            {"detail": _ai_error_detail(e), "code": "ai_error"},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    return Response({"operation": op, "model": resolve_model(model), "result": text})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([AIWriteThrottle])
def stream(request):
    if not is_enabled():
        return Response({"detail": "AI 功能已被管理员关闭", "code": "ai_disabled"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    parsed = _parse_payload(request)
    if isinstance(parsed, Response):
        return parsed
    op, content, extra, model, images, thinking, document_id, knowledge_base_id = parsed

    user = request.user

    def event_stream():
        try:
            for delta in run_stream(
                op, content, extra, model=model, user=user,
                document_id=document_id, knowledge_base_id=knowledge_base_id,
                images=images, thinking=thinking,
            ):
                yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
            yield "event: done\ndata: {}\n\n"
        except AIBudgetExceeded as e:
            yield f"event: error\ndata: {json.dumps({'detail': str(e), 'code': 'ai_budget_exceeded'}, ensure_ascii=False)}\n\n"
        except AIUnavailable as e:
            yield f"event: error\ndata: {json.dumps({'detail': str(e), 'code': 'ai_unavailable'}, ensure_ascii=False)}\n\n"
        except Exception as e:  # noqa: BLE001
            yield f"event: error\ndata: {json.dumps({'detail': _ai_error_detail(e), 'code': 'ai_error'}, ensure_ascii=False)}\n\n"

    resp = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
    resp["Cache-Control"] = "no-cache"
    resp["X-Accel-Buffering"] = "no"
    return resp


# ── /chat/ (multi-turn) ────────────────────────────────────────────────


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([AIWriteThrottle])
def chat(request):
    """Streaming multi-turn chat.

    Body: { history: [{role, content}], message: str, model?: str,
            conversation_id?: int (save into this convo) }
    """
    if not is_enabled():
        return Response({"detail": "AI 功能已被管理员关闭", "code": "ai_disabled"}, status=503)
    data = request.data if isinstance(request.data, dict) else {}
    history = data.get("history") or []
    user_message = (data.get("message") or "").strip()
    model = (data.get("model") or "").strip() or None
    conversation_id = data.get("conversation_id")

    if not user_message:
        return Response({"detail": "message 不能为空"}, status=400)
    if not isinstance(history, list) or len(history) > 50:
        return Response({"detail": "history 必须是数组且最多 50 条"}, status=400)

    user = request.user

    def event_stream():
        full_reply: list[str] = []
        try:
            for delta in run_chat_stream(history, user_message, model=model, user=user):
                full_reply.append(delta)
                yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
            # Persist into AIConversation when caller passed an id (or
            # create new). Skipped silently on any DB error.
            try:
                reply_text = "".join(full_reply).strip()
                _save_chat_turn(user, conversation_id, user_message, reply_text, resolve_model(model))
            except Exception:
                pass
            yield "event: done\ndata: {}\n\n"
        except AIBudgetExceeded as e:
            yield f"event: error\ndata: {json.dumps({'detail': str(e), 'code': 'ai_budget_exceeded'}, ensure_ascii=False)}\n\n"
        except AIUnavailable as e:
            yield f"event: error\ndata: {json.dumps({'detail': str(e), 'code': 'ai_unavailable'}, ensure_ascii=False)}\n\n"
        except Exception as e:  # noqa: BLE001
            yield f"event: error\ndata: {json.dumps({'detail': _ai_error_detail(e), 'code': 'ai_error'}, ensure_ascii=False)}\n\n"

    resp = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
    resp["Cache-Control"] = "no-cache"
    resp["X-Accel-Buffering"] = "no"
    return resp


def _save_chat_turn(user, conversation_id, user_message: str, reply: str, model: str):
    """Append a user/assistant pair to an existing or new AIConversation."""
    now = timezone.now().isoformat()
    new_msgs = [
        {"role": "user", "content": user_message, "ts": now},
        {"role": "assistant", "content": reply, "ts": now},
    ]
    if conversation_id:
        conv = AIConversation.objects.filter(user=user, pk=conversation_id).first()
        if conv:
            conv.messages = (conv.messages or []) + new_msgs
            # Cap to last 50 turns to keep prompts bounded.
            if len(conv.messages) > 100:
                conv.messages = conv.messages[-100:]
            conv.model = model
            conv.save()
            return
    # New conversation.
    AIConversation.objects.create(
        user=user,
        title=user_message[:60],
        messages=new_msgs,
        model=model,
    )


# ── /capabilities/ ─────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@throttle_classes([AIReadThrottle])
def capabilities(request):
    """Tell the frontend which operations + models + user templates are available."""
    from .services import providers_configured
    provs = providers_configured()
    # User's own prompt templates (sorted by AIPromptTemplate.Meta.ordering).
    templates = list(
        AIPromptTemplate.objects.filter(owner=request.user).values(
            "id", "name", "icon", "instruction", "requires_selection",
            "replace_mode", "order",
        )
    )
    return Response(
        {
            "configured": any(provs.values()),
            "providers_configured": provs,
            "enabled": is_enabled(),
            "operations": SUPPORTED_OPS,
            "models": AVAILABLE_MODELS,
            "default_model": get_default_model(),
            "thinking_enabled": is_thinking_enabled(),
            "templates": templates,
            "fallback_chain": FALLBACK_CHAIN,
        }
    )


# ── /usage/ ────────────────────────────────────────────────────────────


def _usage_qs(request, days_param: str | None = None, model_param: str | None = None):
    days_raw = days_param or request.query_params.get("days", 30)
    try:
        days = max(1, min(365, int(days_raw)))
    except (TypeError, ValueError):
        days = 30
    cutoff = timezone.now() - timedelta(days=days)
    qs = AIUsageLog.objects.filter(created_at__gte=cutoff)
    if not request.user.is_staff:
        qs = qs.filter(user=request.user)
    model = model_param or request.query_params.get("model")
    if model:
        qs = qs.filter(model=model)
    return qs, days


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@throttle_classes([AIReadThrottle])
def usage(request):
    """Aggregated usage stats. Admin sees everyone; others only their own."""
    qs, days = _usage_qs(request)

    totals = qs.aggregate(
        calls=Count("id"),
        input_tokens=Sum("input_tokens"),
        output_tokens=Sum("output_tokens"),
    )
    failed = qs.filter(succeeded=False).count()

    by_model_raw = list(
        qs.values("model")
        .annotate(calls=Count("id"), input_tokens=Sum("input_tokens"), output_tokens=Sum("output_tokens"))
        .order_by("-calls")
    )
    by_model = [
        {
            **row,
            "input_tokens": row["input_tokens"] or 0,
            "output_tokens": row["output_tokens"] or 0,
            "estimated_usd": estimate_cost_usd(row["model"], row["input_tokens"] or 0, row["output_tokens"] or 0),
        }
        for row in by_model_raw
    ]

    # Per-day series — split by model so the cost rolls up correctly.
    by_day_qs = (
        qs.annotate(day=TruncDate("created_at"))
        .values("day", "model")
        .annotate(calls=Count("id"), input_tokens=Sum("input_tokens"), output_tokens=Sum("output_tokens"))
        .order_by("day")
    )
    daily: dict[str, dict] = {}
    for row in by_day_qs:
        if not row["day"]:
            continue
        key = row["day"].isoformat()
        bucket = daily.setdefault(
            key,
            {"day": key, "calls": 0, "input_tokens": 0, "output_tokens": 0, "estimated_usd": 0.0},
        )
        bucket["calls"] += row["calls"] or 0
        bucket["input_tokens"] += row["input_tokens"] or 0
        bucket["output_tokens"] += row["output_tokens"] or 0
        bucket["estimated_usd"] = round(
            bucket["estimated_usd"]
            + estimate_cost_usd(row["model"], row["input_tokens"] or 0, row["output_tokens"] or 0),
            4,
        )
    by_day = sorted(daily.values(), key=lambda r: r["day"])

    by_op = list(qs.values("operation").annotate(calls=Count("id")).order_by("-calls"))

    # v0.9.7: per-KB + per-document breakdown.
    by_kb_raw = list(
        qs.exclude(knowledge_base_id=None)
        .values("knowledge_base_id", "knowledge_base__name", "model")
        .annotate(calls=Count("id"), input_tokens=Sum("input_tokens"), output_tokens=Sum("output_tokens"))
    )
    kb_buckets: dict[int, dict] = {}
    for row in by_kb_raw:
        kid = row["knowledge_base_id"]
        bucket = kb_buckets.setdefault(
            kid, {"id": kid, "name": row["knowledge_base__name"], "calls": 0, "estimated_usd": 0.0}
        )
        bucket["calls"] += row["calls"] or 0
        bucket["estimated_usd"] = round(
            bucket["estimated_usd"]
            + estimate_cost_usd(row["model"], row["input_tokens"] or 0, row["output_tokens"] or 0),
            4,
        )
    by_kb = sorted(kb_buckets.values(), key=lambda r: r["estimated_usd"], reverse=True)

    by_doc_raw = list(
        qs.exclude(document_id=None)
        .values("document_id", "document__title", "model")
        .annotate(calls=Count("id"), input_tokens=Sum("input_tokens"), output_tokens=Sum("output_tokens"))
    )
    doc_buckets: dict[int, dict] = {}
    for row in by_doc_raw:
        did = row["document_id"]
        bucket = doc_buckets.setdefault(
            did, {"id": did, "title": row["document__title"], "calls": 0, "estimated_usd": 0.0}
        )
        bucket["calls"] += row["calls"] or 0
        bucket["estimated_usd"] = round(
            bucket["estimated_usd"]
            + estimate_cost_usd(row["model"], row["input_tokens"] or 0, row["output_tokens"] or 0),
            4,
        )
    by_document = sorted(doc_buckets.values(), key=lambda r: r["estimated_usd"], reverse=True)[:20]

    # Recent 20 — include fallback_from + doc/kb context.
    recent = [
        {
            "id": r.id,
            "user": r.user.username if r.user_id else None,
            "operation": r.operation,
            "model": r.model,
            "fallback_from": r.fallback_from,
            "streaming": r.streaming,
            "input_tokens": r.input_tokens,
            "output_tokens": r.output_tokens,
            "duration_ms": r.duration_ms,
            "succeeded": r.succeeded,
            "error": r.error,
            "document_id": r.document_id,
            "knowledge_base_id": r.knowledge_base_id,
            "created_at": r.created_at.isoformat(),
        }
        for r in qs.select_related("user")[:20]
    ]

    total_usd = round(sum(r["estimated_usd"] for r in by_model), 4)

    return Response({
        "window_days": days,
        "totals": {
            "calls": totals["calls"] or 0,
            "input_tokens": totals["input_tokens"] or 0,
            "output_tokens": totals["output_tokens"] or 0,
            "failed": failed,
            "estimated_usd": total_usd,
        },
        "by_model": by_model,
        "by_day": by_day,
        "by_operation": by_op,
        "by_kb": by_kb,
        "by_document": by_document,
        "recent": recent,
        "pricing": {
            model: {"input_per_mtok_usd": rate_in, "output_per_mtok_usd": rate_out}
            for model, (rate_in, rate_out) in MODEL_PRICES_USD.items()
        },
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@throttle_classes([AIReadThrottle])
def usage_csv(request):
    """CSV export of usage rows (admin gets all, users get own)."""
    qs, _days = _usage_qs(request)
    out = StringIO()
    writer = csv.writer(out)
    writer.writerow([
        "id", "created_at", "user", "operation", "model", "fallback_from",
        "streaming", "input_tokens", "output_tokens", "estimated_usd",
        "duration_ms", "succeeded", "error", "document_id", "knowledge_base_id",
    ])
    for r in qs.select_related("user").iterator(chunk_size=500):
        writer.writerow([
            r.id,
            r.created_at.isoformat(),
            (r.user.username if r.user_id else ""),
            r.operation,
            r.model,
            r.fallback_from or "",
            int(r.streaming),
            r.input_tokens,
            r.output_tokens,
            estimate_cost_usd(r.model, r.input_tokens, r.output_tokens),
            r.duration_ms,
            int(r.succeeded),
            (r.error or "").replace("\n", " ").replace("\r", " "),
            r.document_id or "",
            r.knowledge_base_id or "",
        ])
    resp = HttpResponse(out.getvalue(), content_type="text/csv; charset=utf-8")
    resp["Content-Disposition"] = 'attachment; filename="ai-usage.csv"'
    return resp


# ── /settings/ ─────────────────────────────────────────────────────────


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
@throttle_classes([AIReadThrottle])
def settings_view(request):
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
        if "enable_thinking" in data:
            obj.enable_thinking = bool(data["enable_thinking"])
        if "fallback_enabled" in data:
            obj.fallback_enabled = bool(data["fallback_enabled"])
        if "daily_budget_usd_per_user" in data:
            try:
                b = float(data["daily_budget_usd_per_user"])
            except (TypeError, ValueError):
                return Response({"detail": "预算必须是数字"}, status=400)
            if b < 0:
                return Response({"detail": "预算不能为负"}, status=400)
            obj.daily_budget_usd_per_user = b
        obj.save()
    return Response({
        "default_model": obj.default_model,
        "enabled": obj.enabled,
        "max_tokens": obj.max_tokens,
        "enable_thinking": obj.enable_thinking,
        "fallback_enabled": obj.fallback_enabled,
        "daily_budget_usd_per_user": obj.daily_budget_usd_per_user,
        "updated_at": obj.updated_at.isoformat() if obj.updated_at else None,
        "models": AVAILABLE_MODELS,
    })


# ── Prompt templates CRUD ──────────────────────────────────────────────


def _template_serialize(t: AIPromptTemplate) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "icon": t.icon,
        "instruction": t.instruction,
        "requires_selection": t.requires_selection,
        "replace_mode": t.replace_mode,
        "order": t.order,
        "updated_at": t.updated_at.isoformat(),
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([AIReadThrottle])
def templates_list(request):
    if request.method == "GET":
        items = AIPromptTemplate.objects.filter(owner=request.user)
        return Response([_template_serialize(t) for t in items])
    # POST: create
    data = request.data if isinstance(request.data, dict) else {}
    name = (data.get("name") or "").strip()
    instruction = (data.get("instruction") or "").strip()
    if not name or not instruction:
        return Response({"detail": "name 和 instruction 不能为空"}, status=400)
    if len(name) > 60:
        return Response({"detail": "name 不能超过 60 字"}, status=400)
    if len(instruction) > 4000:
        return Response({"detail": "instruction 不能超过 4000 字"}, status=400)
    replace_mode = data.get("replace_mode") or "none"
    if replace_mode not in {"none", "replace", "before", "after"}:
        return Response({"detail": "replace_mode 非法"}, status=400)
    t = AIPromptTemplate.objects.create(
        owner=request.user,
        name=name,
        icon=(data.get("icon") or "✨")[:10],
        instruction=instruction,
        requires_selection=bool(data.get("requires_selection", True)),
        replace_mode=replace_mode,
        order=int(data.get("order") or 0),
    )
    return Response(_template_serialize(t), status=201)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
@throttle_classes([AIReadThrottle])
def template_detail(request, pk):
    t = get_object_or_404(AIPromptTemplate, pk=pk, owner=request.user)
    if request.method == "GET":
        return Response(_template_serialize(t))
    if request.method == "DELETE":
        t.delete()
        return Response(status=204)
    data = request.data if isinstance(request.data, dict) else {}
    if "name" in data:
        n = str(data["name"]).strip()
        if not n or len(n) > 60:
            return Response({"detail": "name 长度 1-60"}, status=400)
        t.name = n
    if "icon" in data:
        t.icon = str(data["icon"])[:10]
    if "instruction" in data:
        i = str(data["instruction"]).strip()
        if not i or len(i) > 4000:
            return Response({"detail": "instruction 长度 1-4000"}, status=400)
        t.instruction = i
    if "requires_selection" in data:
        t.requires_selection = bool(data["requires_selection"])
    if "replace_mode" in data:
        if data["replace_mode"] not in {"none", "replace", "before", "after"}:
            return Response({"detail": "replace_mode 非法"}, status=400)
        t.replace_mode = data["replace_mode"]
    if "order" in data:
        try:
            t.order = max(0, int(data["order"]))
        except (TypeError, ValueError):
            return Response({"detail": "order 必须是非负整数"}, status=400)
    t.save()
    return Response(_template_serialize(t))


# ── Conversations CRUD ─────────────────────────────────────────────────


def _conv_serialize(c: AIConversation, *, with_messages: bool = False) -> dict:
    out = {
        "id": c.id,
        "title": c.title,
        "model": c.model,
        "document_id": c.document_id,
        "message_count": len(c.messages or []),
        "created_at": c.created_at.isoformat(),
        "updated_at": c.updated_at.isoformat(),
    }
    if with_messages:
        out["messages"] = c.messages or []
    return out


@api_view(["GET", "DELETE"])
@permission_classes([IsAuthenticated])
@throttle_classes([AIReadThrottle])
def conversations_list(request):
    if request.method == "DELETE":
        # Clear all conversations for this user.
        AIConversation.objects.filter(user=request.user).delete()
        return Response(status=204)
    items = AIConversation.objects.filter(user=request.user)[:50]
    return Response([_conv_serialize(c) for c in items])


@api_view(["GET", "DELETE"])
@permission_classes([IsAuthenticated])
@throttle_classes([AIReadThrottle])
def conversation_detail(request, pk):
    c = get_object_or_404(AIConversation, pk=pk, user=request.user)
    if request.method == "DELETE":
        c.delete()
        return Response(status=204)
    return Response(_conv_serialize(c, with_messages=True))


# ── Token preview (lightweight, no AI call) ────────────────────────────


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([AIReadThrottle])
def estimate(request):
    """Pre-call token + cost preview. Body: { content, extra?, model? }.

    Returns estimated input tokens and a per-tier USD range based on the
    output budget (max_tokens). Used by frontend tooltips on AI buttons
    so users can see "this will cost ≈ $0.02" before clicking.
    """
    data = request.data if isinstance(request.data, dict) else {}
    content = data.get("content") or ""
    extra = data.get("extra") or ""
    # Same hard cap as run/stream — the estimator is O(n) per char and this
    # endpoint must not become a CPU amplification vector for huge bodies.
    if len(content) + len(extra) > 60_000:
        return Response({"detail": "内容超过估算长度上限"}, status=400)
    model = (data.get("model") or "").strip() or get_default_model()
    in_tok = estimate_input_tokens_from_chars(content + extra)
    out_tok = AISettings.load().max_tokens
    return Response({
        "model": model,
        "estimated_input_tokens": in_tok,
        "estimated_output_tokens_cap": out_tok,
        "estimated_cost_usd": estimate_cost_usd(model, in_tok, out_tok),
    })
