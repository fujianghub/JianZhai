"""Thin wrapper around Anthropic Claude / Alibaba DashScope (Qwen) for the
writing assistant.

v0.9.7 adds:
  - Anthropic prompt caching on the system prompt (5-min ephemeral)
  - Automatic fallback ladder (Opus → Sonnet → Haiku; Qwen Max → Plus → Turbo)
  - Optional extended thinking for Claude 4 models
  - Per-user daily budget enforcement (AISettings.daily_budget_usd_per_user)
  - Vision image input (both Claude and Qwen-VL)
  - Multi-turn chat path (build_messages_multiturn)
  - Document / KB attribution recorded on AIUsageLog

The module degrades gracefully when an SDK is not installed or the API
key is missing — endpoints will return a friendly error instead of 500-ing.
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterator

from .prompts import SYSTEM_PROMPT, build_messages

# Default model is Claude Opus 4.7. The client can override per-request via
# the `model` field, validated against AVAILABLE_MODELS so users can only pick
# from a known-good list. Admin can override the default via AISettings.
ENV_DEFAULT_MODEL = os.environ.get("CLAUDE_MODEL_DEFAULT", "claude-opus-4-7")
ENV_DEFAULT_MAX_TOKENS = int(os.environ.get("CLAUDE_MAX_TOKENS", "1024"))


def _settings():
    """Read AISettings singleton lazily (avoids ORM import at module load).

    Hot path: a single AI call queries enabled / default_model / max_tokens /
    budget / thinking, each via this helper. Serve a short-TTL cached copy so
    those collapse to one DB read (invalidated on AISettings.save()).
    """
    from .models import AISettings
    return AISettings.load(use_cache=True)


def get_default_model() -> str:
    try:
        return _settings().default_model or ENV_DEFAULT_MODEL
    except Exception:
        return ENV_DEFAULT_MODEL


def get_max_tokens() -> int:
    try:
        return int(_settings().max_tokens) or ENV_DEFAULT_MAX_TOKENS
    except Exception:
        return ENV_DEFAULT_MAX_TOKENS


def is_enabled() -> bool:
    try:
        return bool(_settings().enabled)
    except Exception:
        return True


def is_thinking_enabled() -> bool:
    try:
        return bool(_settings().enable_thinking)
    except Exception:
        return False


def is_fallback_enabled() -> bool:
    try:
        return bool(_settings().fallback_enabled)
    except Exception:
        return True


# Backwards-compat constant — used as a fallback in views.
DEFAULT_MODEL = ENV_DEFAULT_MODEL
DEFAULT_MAX_TOKENS = ENV_DEFAULT_MAX_TOKENS

# Order in this list determines display order in the model picker UI.
# Each entry: id / label / hint / provider / vision / thinking flags.
# Add new releases here as upstream providers ship them.
AVAILABLE_MODELS: list[dict] = [
    {"id": "claude-opus-4-7", "label": "Claude Opus 4.7", "hint": "默认 / 最强推理", "provider": "anthropic", "vision": True, "thinking": True},
    {"id": "claude-sonnet-4-6", "label": "Claude Sonnet 4.6", "hint": "平衡 / 速度更快", "provider": "anthropic", "vision": True, "thinking": True},
    {"id": "claude-haiku-4-5-20251001", "label": "Claude Haiku 4.5", "hint": "最快 / 适合短任务", "provider": "anthropic", "vision": True, "thinking": False},
    {"id": "qwen-max", "label": "通义千问 Max", "hint": "阿里 · 中文优势 / 最强", "provider": "qwen", "vision": False, "thinking": False},
    {"id": "qwen-plus", "label": "通义千问 Plus", "hint": "阿里 · 性价比平衡", "provider": "qwen", "vision": False, "thinking": False},
    {"id": "qwen-turbo", "label": "通义千问 Turbo", "hint": "阿里 · 速度优先", "provider": "qwen", "vision": False, "thinking": False},
    {"id": "qwen-vl-max", "label": "通义千问 VL Max", "hint": "阿里 · 视觉旗舰（图片输入）", "provider": "qwen", "vision": True, "thinking": False},
    {"id": "qwen-vl-plus", "label": "通义千问 VL Plus", "hint": "阿里 · 视觉平价", "provider": "qwen", "vision": True, "thinking": False},
]
ALLOWED_MODEL_IDS = {m["id"] for m in AVAILABLE_MODELS}

# Fallback ladder. When a call fails (rate limit, transient 5xx) we walk
# this chain until one succeeds or we exhaust it. Set via FALLBACK_CHAIN
# so it's data, not code paths.
FALLBACK_CHAIN: dict[str, list[str]] = {
    "claude-opus-4-7": ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
    "claude-opus-4-6": ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
    "claude-sonnet-4-6": ["claude-haiku-4-5-20251001"],
    "qwen-max": ["qwen-plus", "qwen-turbo"],
    "qwen-plus": ["qwen-turbo"],
    "qwen-vl-max": ["qwen-vl-plus"],
}


def _provider_for(model_id: str) -> str:
    """Return which provider serves a given model id. Defaults to anthropic
    so unknown ids fall through to Claude (matches legacy behavior)."""
    for m in AVAILABLE_MODELS:
        if m["id"] == model_id:
            return m["provider"]
    return "anthropic"


def _model_meta(model_id: str) -> dict:
    """Return the AVAILABLE_MODELS dict for a given id, or empty dict."""
    for m in AVAILABLE_MODELS:
        if m["id"] == model_id:
            return m
    return {}


def provider_configured(provider: str) -> bool:
    """Whether the env vars for a given provider are present."""
    if provider == "anthropic":
        return bool(os.environ.get("ANTHROPIC_API_KEY"))
    if provider == "qwen":
        return bool(os.environ.get("DASHSCOPE_API_KEY"))
    return False


def providers_configured() -> dict[str, bool]:
    """Per-provider readiness flags for the capabilities endpoint."""
    return {p: provider_configured(p) for p in ("anthropic", "qwen")}


def resolve_model(requested: str | None) -> str:
    """Pick the model: requested if it's in the allow-list, otherwise default."""
    if requested and requested in ALLOWED_MODEL_IDS:
        return requested
    return get_default_model()


class AIUnavailable(Exception):
    """Raised when the SDK is missing or no API key is set."""


class AIBudgetExceeded(Exception):
    """Raised when a user has spent past their daily AI budget. Endpoints
    surface this as 429 (rate-limit), not 503 (service unavailable),
    because the user can recover by waiting or asking admin to bump the
    limit — the service itself is healthy."""


def _client():
    """Anthropic client (legacy entry point — kept so existing tests can patch
    `apps.ai.services._client`). Use `_client_for(provider)` for new code."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise AIUnavailable("未配置 ANTHROPIC_API_KEY，AI 助手已禁用")
    try:
        import anthropic  # type: ignore
    except ImportError as e:
        raise AIUnavailable("缺少 anthropic SDK — 运行 `pip install anthropic` 后启用 AI") from e
    return anthropic.Anthropic(api_key=api_key)


def _qwen_client():
    """OpenAI-compatible client pointed at Alibaba DashScope."""
    api_key = os.environ.get("DASHSCOPE_API_KEY")
    if not api_key:
        raise AIUnavailable("未配置 DASHSCOPE_API_KEY，无法调用通义千问")
    try:
        from openai import OpenAI  # type: ignore
    except ImportError as e:
        raise AIUnavailable("缺少 openai SDK — 运行 `pip install openai` 后启用 Qwen") from e
    return OpenAI(
        api_key=api_key,
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    )


def _client_for(provider: str):
    if provider == "anthropic":
        return _client()
    if provider == "qwen":
        return _qwen_client()
    raise AIUnavailable(f"未知供应商: {provider}")


# ── Budget enforcement ───────────────────────────────────────────────────


def check_daily_budget(user) -> None:
    """Raise AIBudgetExceeded if ``user`` has spent past today's quota.

    No-op when:
      - user is anonymous (no FK to bind),
      - daily_budget_usd_per_user is 0 (unlimited),
      - user is staff (admins bypass quota).
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return
    if getattr(user, "is_staff", False):
        return
    try:
        budget = float(_settings().daily_budget_usd_per_user or 0)
    except Exception:
        budget = 0.0
    if budget <= 0:
        return
    from datetime import timedelta
    from django.utils import timezone

    cutoff = timezone.now() - timedelta(hours=24)
    spent = _spent_usd_since(user, cutoff)
    if spent >= budget:
        raise AIBudgetExceeded(
            f"已超过近 24 小时预算（{spent:.2f} / {budget:.2f} USD），请稍后再用或联系管理员"
        )


def _spent_usd_since(user, cutoff) -> float:
    """Sum a user's estimated AI spend since ``cutoff`` via a single DB SUM.

    Replaces the previous pattern of pulling every usage row in the window and
    re-estimating its cost in Python on each budget check.
    """
    from django.db.models import Sum

    from .models import AIUsageLog

    agg = AIUsageLog.objects.filter(user=user, created_at__gte=cutoff).aggregate(
        total=Sum("estimated_usd")
    )
    return float(agg["total"] or 0.0)


# In-flight budget reservations live in Redis so concurrent requests see each
# other before any AIUsageLog row exists (the classic check-then-act window).
# TTL keeps a crashed worker from leaking a reservation forever.
_BUDGET_RESERVE_TTL = 600
_BUDGET_RESERVE_SCALE = 1_000_000  # store USD as integer micro-dollars (cache.incr needs ints)


def _budget_limit_for(user) -> float:
    """The active per-user daily budget, or 0 when quota doesn't apply."""
    if user is None or not getattr(user, "is_authenticated", False):
        return 0.0
    if getattr(user, "is_staff", False):
        return 0.0
    try:
        return float(_settings().daily_budget_usd_per_user or 0)
    except Exception:
        return 0.0


@contextmanager
def budget_reservation(user, model: str, prompt_chars: int, max_tokens: int):
    """Reserve the worst-case cost of one call while it is in flight.

    ``check_daily_budget`` alone is check-then-act: usage rows are written
    only after a call completes, so N concurrent requests all read the same
    "spent" and all pass. This context manager atomically adds a worst-case
    estimate (input from chars + full max_tokens output) to a per-user Redis
    counter BEFORE the provider call, and compares spent + other in-flight
    reservations against the budget. Our own reservation is excluded from the
    comparison so single-request behaviour is identical to before — only the
    concurrent flood gets blocked. The reservation is always released in
    ``finally``; the real spend lands in AIUsageLog instead.
    """
    budget = _budget_limit_for(user)
    if budget <= 0:
        yield
        return

    from django.core.cache import cache

    from .pricing import estimate_cost_usd, estimate_input_tokens_from_chars

    est_in = estimate_input_tokens_from_chars("x" * max(0, prompt_chars))
    est_cost = estimate_cost_usd(model, est_in, max_tokens)
    amount = max(1, int(est_cost * _BUDGET_RESERVE_SCALE))
    key = f"ai-budget-reserved:{user.pk}"

    try:
        cache.add(key, 0, _BUDGET_RESERVE_TTL)
        total_reserved = cache.incr(key, amount)
    except Exception:
        # Cache down — degrade to the plain (racy) check rather than
        # breaking the AI feature outright.
        yield
        return

    try:
        others_usd = max(0, total_reserved - amount) / _BUDGET_RESERVE_SCALE
        if others_usd > 0:
            from datetime import timedelta

            from django.utils import timezone

            cutoff = timezone.now() - timedelta(hours=24)
            spent = _spent_usd_since(user, cutoff)
            if spent + others_usd >= budget:
                raise AIBudgetExceeded(
                    f"并发请求已占满近 24 小时预算（{spent:.2f} + 进行中 {others_usd:.2f} "
                    f"/ {budget:.2f} USD），请稍后再试"
                )
        yield
    finally:
        try:
            cache.decr(key, amount)
        except Exception:
            pass


# ── Usage log helper ────────────────────────────────────────────────────


def _log_usage(
    *,
    user,
    operation: str,
    model: str,
    streaming: bool,
    input_tokens: int = 0,
    output_tokens: int = 0,
    duration_ms: int = 0,
    succeeded: bool = True,
    error: str = "",
    document_id=None,
    knowledge_base_id=None,
    fallback_from: str = "",
    prompt_chars: int = 0,
) -> None:
    """Record a single AI call. Lazy-imported so service module stays lean.

    ``estimated_usd`` is computed intrinsically in ``AIUsageLog.save()`` so it
    is populated regardless of creation path.
    """
    try:
        from .models import AIUsageLog
        AIUsageLog.objects.create(
            user=user if (user is not None and getattr(user, "is_authenticated", False)) else None,
            operation=operation,
            model=model,
            streaming=streaming,
            input_tokens=max(0, input_tokens),
            output_tokens=max(0, output_tokens),
            duration_ms=max(0, duration_ms),
            succeeded=succeeded,
            error=(error or "")[:200],
            document_id=document_id,
            knowledge_base_id=knowledge_base_id,
            fallback_from=fallback_from[:80] if fallback_from else "",
            prompt_chars=max(0, prompt_chars),
        )
    except Exception:
        # Never let logging break the response — just swallow.
        pass


def _resolved_max_tokens(max_tokens: int | None) -> int:
    if max_tokens is not None:
        return max_tokens
    return get_max_tokens()


# ── System prompt with caching ──────────────────────────────────────────


def _system_blocks_anthropic() -> list[dict]:
    """Anthropic system prompt as a content-block list with prompt caching
    enabled. The ``ephemeral`` cache lives 5 minutes — for a busy editor
    that's effectively per-session, cutting input tokens for the system
    prompt to ~5% of uncached cost."""
    return [
        {
            "type": "text",
            "text": SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }
    ]


# ── Single call (non-streaming) ─────────────────────────────────────────


def run_once(
    operation: str,
    content: str,
    extra: str = "",
    model: str | None = None,
    max_tokens: int | None = None,
    *,
    user=None,
    document_id=None,
    knowledge_base_id=None,
    images: list[str] | None = None,
    thinking: bool | None = None,
) -> str:
    """Non-streaming call. Returns the full assistant message text.

    On failure, walks ``FALLBACK_CHAIN`` (when enabled in AISettings) and
    retries on the next model. Each attempt's outcome is logged separately
    in AIUsageLog so admins can see fallback frequency.
    """
    import time

    check_daily_budget(user)
    resolved = resolve_model(model)
    chain = [resolved] + ([] if not is_fallback_enabled() else FALLBACK_CHAIN.get(resolved, []))
    prompt_chars = len(content or "") + len(extra or "")
    last_exc: Exception | None = None

    with budget_reservation(user, resolved, prompt_chars, _resolved_max_tokens(max_tokens)):
        for attempt_model in chain:
            provider = _provider_for(attempt_model)
            token_limit = _resolved_max_tokens(max_tokens)
            started = time.monotonic()
            fallback_from = "" if attempt_model == resolved else resolved
            try:
                if provider == "anthropic":
                    text, in_tok, out_tok = _run_once_anthropic(
                        operation, content, extra, attempt_model, token_limit,
                        images=images,
                        thinking=(thinking if thinking is not None else is_thinking_enabled()),
                    )
                else:
                    text, in_tok, out_tok = _run_once_qwen(
                        operation, content, extra, attempt_model, token_limit,
                        images=images,
                    )
            except Exception as e:
                last_exc = e
                _log_usage(
                    user=user, operation=operation, model=attempt_model, streaming=False,
                    duration_ms=int((time.monotonic() - started) * 1000),
                    succeeded=False, error=str(e),
                    document_id=document_id, knowledge_base_id=knowledge_base_id,
                    fallback_from=fallback_from, prompt_chars=prompt_chars,
                )
                # Don't fall back from AIUnavailable (config error) — that's
                # not transient, the next model has the same key gap.
                if isinstance(e, AIUnavailable):
                    raise
                continue
            _log_usage(
                user=user, operation=operation, model=attempt_model, streaming=False,
                input_tokens=in_tok, output_tokens=out_tok,
                duration_ms=int((time.monotonic() - started) * 1000),
                succeeded=True,
                document_id=document_id, knowledge_base_id=knowledge_base_id,
                fallback_from=fallback_from, prompt_chars=prompt_chars,
            )
            return text

    # Exhausted the chain.
    raise last_exc if last_exc else AIUnavailable("AI 调用失败且无备用模型")


def _run_once_anthropic(
    operation, content, extra, model, max_tokens,
    *,
    images: list[str] | None = None,
    thinking: bool = False,
) -> tuple[str, int, int]:
    client = _client()
    kwargs: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "system": _system_blocks_anthropic(),
        "messages": build_messages(operation, content, extra, images=images),
    }
    if thinking and _model_meta(model).get("thinking"):
        # Extended thinking: Claude 4 models accept a `thinking` param with
        # a budget. We give it half the max_tokens — plenty for short ops.
        kwargs["thinking"] = {
            "type": "enabled",
            "budget_tokens": max(1024, max_tokens // 2),
        }
    msg = client.messages.create(**kwargs)
    parts: list[str] = []
    for block in getattr(msg, "content", []) or []:
        # Skip thinking blocks — they're internal CoT, not user-facing.
        if getattr(block, "type", None) == "thinking":
            continue
        text = getattr(block, "text", None)
        if text:
            parts.append(text)
    usage = getattr(msg, "usage", None)
    return (
        "".join(parts).strip(),
        int(getattr(usage, "input_tokens", 0) or 0),
        int(getattr(usage, "output_tokens", 0) or 0),
    )


def _qwen_messages(operation, content, extra, *, images: list[str] | None = None):
    """Convert to OpenAI-style messages. For vision models, images become
    image_url blocks (data URLs are accepted by DashScope).
    """
    user_msgs = build_messages(operation, content, extra, images=images)
    if images:
        # ``build_messages`` already wrapped content into Anthropic-shape
        # blocks. Translate ``image`` blocks to OpenAI ``image_url`` shape.
        new_user_msgs = []
        for m in user_msgs:
            if isinstance(m.get("content"), list):
                ocontent = []
                for b in m["content"]:
                    if b.get("type") == "image":
                        src = b.get("source", {})
                        data_url = f"data:{src.get('media_type', 'image/png')};base64,{src.get('data', '')}"
                        ocontent.append({"type": "image_url", "image_url": {"url": data_url}})
                    elif b.get("type") == "text":
                        ocontent.append({"type": "text", "text": b.get("text", "")})
                new_user_msgs.append({"role": "user", "content": ocontent})
            else:
                new_user_msgs.append(m)
        user_msgs = new_user_msgs
    return [{"role": "system", "content": SYSTEM_PROMPT}, *user_msgs]


def _run_once_qwen(
    operation, content, extra, model, max_tokens,
    *,
    images: list[str] | None = None,
) -> tuple[str, int, int]:
    client = _qwen_client()
    resp = client.chat.completions.create(
        model=model,
        max_tokens=max_tokens,
        messages=_qwen_messages(operation, content, extra, images=images),
    )
    text = (resp.choices[0].message.content or "").strip() if resp.choices else ""
    usage = getattr(resp, "usage", None)
    return (
        text,
        int(getattr(usage, "prompt_tokens", 0) or 0),
        int(getattr(usage, "completion_tokens", 0) or 0),
    )


# ── Streaming call ──────────────────────────────────────────────────────


def run_stream(
    operation: str,
    content: str,
    extra: str = "",
    model: str | None = None,
    max_tokens: int | None = None,
    *,
    user=None,
    document_id=None,
    knowledge_base_id=None,
    images: list[str] | None = None,
    thinking: bool | None = None,
) -> Iterator[str]:
    """Yield text deltas as they arrive. Caller is responsible for SSE framing.

    Fallback chain applies for streaming too — but we only fall back BEFORE
    the first delta has been delivered. Once the client has started
    receiving tokens, switching models mid-stream would break the partial
    output, so we let the original failure propagate.
    """
    import time

    check_daily_budget(user)
    resolved = resolve_model(model)
    chain = [resolved] + ([] if not is_fallback_enabled() else FALLBACK_CHAIN.get(resolved, []))
    prompt_chars = len(content or "") + len(extra or "")
    last_exc: Exception | None = None

    with budget_reservation(user, resolved, prompt_chars, _resolved_max_tokens(max_tokens)):
        for attempt_model in chain:
            provider = _provider_for(attempt_model)
            token_limit = _resolved_max_tokens(max_tokens)
            started = time.monotonic()
            final_usage = {"in": 0, "out": 0}
            err = ""
            fallback_from = "" if attempt_model == resolved else resolved
            delivered_any = False
            try:
                iter_ = (
                    _run_stream_anthropic(
                        operation, content, extra, attempt_model, token_limit, final_usage,
                        images=images,
                        thinking=(thinking if thinking is not None else is_thinking_enabled()),
                    )
                    if provider == "anthropic"
                    else _run_stream_qwen(
                        operation, content, extra, attempt_model, token_limit, final_usage,
                        images=images,
                    )
                )
                for chunk in iter_:
                    delivered_any = True
                    yield chunk
            except GeneratorExit:
                # Client disconnected mid-stream. Tokens were already consumed
                # upstream — record them so budget/audit don't silently leak.
                _log_usage(
                    user=user, operation=operation, model=attempt_model, streaming=True,
                    input_tokens=final_usage["in"], output_tokens=final_usage["out"],
                    duration_ms=int((time.monotonic() - started) * 1000),
                    succeeded=False, error="client disconnected",
                    document_id=document_id, knowledge_base_id=knowledge_base_id,
                    fallback_from=fallback_from, prompt_chars=prompt_chars,
                )
                raise
            except Exception as e:
                err = str(e)
                last_exc = e
                if delivered_any:
                    # Already streaming — can't switch models without confusing
                    # the client. Surface this failure.
                    _log_usage(
                        user=user, operation=operation, model=attempt_model, streaming=True,
                        input_tokens=final_usage["in"], output_tokens=final_usage["out"],
                        duration_ms=int((time.monotonic() - started) * 1000),
                        succeeded=False, error=err,
                        document_id=document_id, knowledge_base_id=knowledge_base_id,
                        fallback_from=fallback_from, prompt_chars=prompt_chars,
                    )
                    raise
                # First-byte failure: log it and walk to the next model.
                _log_usage(
                    user=user, operation=operation, model=attempt_model, streaming=True,
                    duration_ms=int((time.monotonic() - started) * 1000),
                    succeeded=False, error=err,
                    document_id=document_id, knowledge_base_id=knowledge_base_id,
                    fallback_from=fallback_from, prompt_chars=prompt_chars,
                )
                if isinstance(e, AIUnavailable):
                    raise
                continue
            # Success — log usage and return.
            _log_usage(
                user=user, operation=operation, model=attempt_model, streaming=True,
                input_tokens=final_usage["in"], output_tokens=final_usage["out"],
                duration_ms=int((time.monotonic() - started) * 1000),
                succeeded=True,
                document_id=document_id, knowledge_base_id=knowledge_base_id,
                fallback_from=fallback_from, prompt_chars=prompt_chars,
            )
            return

    raise last_exc if last_exc else AIUnavailable("AI 流式调用失败")


def _run_stream_anthropic(
    operation, content, extra, model, max_tokens, final_usage,
    *,
    images: list[str] | None = None,
    thinking: bool = False,
) -> Iterator[str]:
    client = _client()
    kwargs: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "system": _system_blocks_anthropic(),
        "messages": build_messages(operation, content, extra, images=images),
    }
    if thinking and _model_meta(model).get("thinking"):
        kwargs["thinking"] = {
            "type": "enabled",
            "budget_tokens": max(1024, max_tokens // 2),
        }
    with client.messages.stream(**kwargs) as stream:
        for text in stream.text_stream:
            if text:
                yield text
        final = stream.get_final_message()
        usage = getattr(final, "usage", None)
        final_usage["in"] = int(getattr(usage, "input_tokens", 0) or 0)
        final_usage["out"] = int(getattr(usage, "output_tokens", 0) or 0)


def _run_stream_qwen(
    operation, content, extra, model, max_tokens, final_usage,
    *,
    images: list[str] | None = None,
) -> Iterator[str]:
    client = _qwen_client()
    stream = client.chat.completions.create(
        model=model,
        max_tokens=max_tokens,
        messages=_qwen_messages(operation, content, extra, images=images),
        stream=True,
        stream_options={"include_usage": True},
    )
    yield from _iter_qwen_stream(stream, final_usage)


def _iter_qwen_stream(stream, final_usage) -> Iterator[str]:
    """Drain a Qwen (OpenAI-compatible) stream, always releasing the HTTP
    connection — the SDK stream doesn't close itself promptly on GC, so an
    early consumer exit (client disconnect / fallback) would leak it."""
    try:
        for chunk in stream:
            usage = getattr(chunk, "usage", None)
            if usage is not None:
                final_usage["in"] = int(getattr(usage, "prompt_tokens", 0) or 0)
                final_usage["out"] = int(getattr(usage, "completion_tokens", 0) or 0)
            choices = getattr(chunk, "choices", None) or []
            if not choices:
                continue
            delta = getattr(choices[0], "delta", None)
            text = getattr(delta, "content", None) if delta else None
            if text:
                yield text
    finally:
        try:
            stream.close()
        except Exception:
            pass


# ── Multi-turn chat ─────────────────────────────────────────────────────


def run_chat_stream(
    history: list[dict],
    user_message: str,
    model: str | None = None,
    max_tokens: int | None = None,
    *,
    user=None,
    document_id=None,
    knowledge_base_id=None,
) -> Iterator[str]:
    """Streaming multi-turn chat. ``history`` is the prior conversation as
    a list of ``{role, content}``; ``user_message`` is the new turn.

    Used by /api/v1/ai/chat/ endpoint (v0.9.7+). Saves token attribution
    to AIUsageLog under operation='chat'.
    """
    import time
    from .prompts import build_messages_multiturn

    check_daily_budget(user)
    resolved = resolve_model(model)
    provider = _provider_for(resolved)
    token_limit = _resolved_max_tokens(max_tokens)
    started = time.monotonic()
    final_usage = {"in": 0, "out": 0}
    err = ""
    prompt_chars = sum(len(m.get("content", "")) for m in history) + len(user_message or "")

    with budget_reservation(user, resolved, prompt_chars, token_limit):
        try:
            messages = build_messages_multiturn(history, instruction=user_message)
            if provider == "anthropic":
                client = _client()
                with client.messages.stream(
                    model=resolved,
                    max_tokens=token_limit,
                    system=_system_blocks_anthropic(),
                    messages=messages,
                ) as stream:
                    for text in stream.text_stream:
                        if text:
                            yield text
                    final = stream.get_final_message()
                    usage = getattr(final, "usage", None)
                    final_usage["in"] = int(getattr(usage, "input_tokens", 0) or 0)
                    final_usage["out"] = int(getattr(usage, "output_tokens", 0) or 0)
            else:
                client = _qwen_client()
                stream = client.chat.completions.create(
                    model=resolved,
                    max_tokens=token_limit,
                    messages=[{"role": "system", "content": SYSTEM_PROMPT}, *messages],
                    stream=True,
                    stream_options={"include_usage": True},
                )
                yield from _iter_qwen_stream(stream, final_usage)
        except Exception as e:
            err = str(e)
            raise
        finally:
            _log_usage(
                user=user, operation="chat", model=resolved, streaming=True,
                input_tokens=final_usage["in"], output_tokens=final_usage["out"],
                duration_ms=int((time.monotonic() - started) * 1000),
                succeeded=not err, error=err,
                document_id=document_id, knowledge_base_id=knowledge_base_id,
                prompt_chars=prompt_chars,
            )
