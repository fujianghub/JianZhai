"""Thin wrapper around the Anthropic Claude API for the writing assistant.

Why a wrapper instead of calling the SDK directly from views: keeps API key
loading + model selection in one place, makes it trivial to swap providers,
and gives us a single integration point for prompt caching once we add it.

The module degrades gracefully when the SDK is not installed or the API key
is missing — endpoints will return a friendly error instead of 500-ing.
"""
from __future__ import annotations

import os
from typing import Iterator

from .prompts import SYSTEM_PROMPT, build_messages

# Default model is Claude Opus 4.7. The client can override per-request via
# the `model` field, validated against AVAILABLE_MODELS so users can only pick
# from a known-good list. Admin can override the default via AISettings.
ENV_DEFAULT_MODEL = os.environ.get("CLAUDE_MODEL_DEFAULT", "claude-opus-4-7")
ENV_DEFAULT_MAX_TOKENS = int(os.environ.get("CLAUDE_MAX_TOKENS", "1024"))


def _settings():
    """Read AISettings singleton lazily (avoids ORM import at module load)."""
    from .models import AISettings
    return AISettings.load()


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


# Backwards-compat constant — used as a fallback in views.
DEFAULT_MODEL = ENV_DEFAULT_MODEL
DEFAULT_MAX_TOKENS = ENV_DEFAULT_MAX_TOKENS

# Order in this list determines display order in the model picker UI.
# Each entry: (id, label, hint). Add new releases here as Anthropic ships them.
AVAILABLE_MODELS: list[dict[str, str]] = [
    {"id": "claude-opus-4-7", "label": "Claude Opus 4.7", "hint": "默认 / 最强推理"},
    {"id": "claude-sonnet-4-6", "label": "Claude Sonnet 4.6", "hint": "平衡 / 速度更快"},
    {"id": "claude-haiku-4-5-20251001", "label": "Claude Haiku 4.5", "hint": "最快 / 适合短任务"},
]
ALLOWED_MODEL_IDS = {m["id"] for m in AVAILABLE_MODELS}


def resolve_model(requested: str | None) -> str:
    """Pick the model: requested if it's in the allow-list, otherwise default."""
    if requested and requested in ALLOWED_MODEL_IDS:
        return requested
    return get_default_model()


class AIUnavailable(Exception):
    """Raised when the SDK is missing or no API key is set."""


def _client():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise AIUnavailable("未配置 ANTHROPIC_API_KEY，AI 助手已禁用")
    try:
        import anthropic  # type: ignore
    except ImportError as e:
        raise AIUnavailable("缺少 anthropic SDK — 运行 `pip install anthropic` 后启用 AI") from e
    return anthropic.Anthropic(api_key=api_key)


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
) -> None:
    """Record a single AI call. Lazy-imported so service module stays lean."""
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
        )
    except Exception:
        # Never let logging break the response — just swallow.
        pass


def run_once(
    operation: str,
    content: str,
    extra: str = "",
    model: str | None = None,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    *,
    user=None,
) -> str:
    """Non-streaming call. Returns the full assistant message text."""
    import time
    client = _client()
    resolved = resolve_model(model)
    started = time.monotonic()
    try:
        msg = client.messages.create(
            model=resolved,
            max_tokens=max_tokens,
            system=SYSTEM_PROMPT,
            messages=build_messages(operation, content, extra),
        )
    except Exception as e:
        _log_usage(
            user=user, operation=operation, model=resolved, streaming=False,
            duration_ms=int((time.monotonic() - started) * 1000),
            succeeded=False, error=str(e),
        )
        raise
    parts: list[str] = []
    for block in getattr(msg, "content", []) or []:
        text = getattr(block, "text", None)
        if text:
            parts.append(text)
    usage = getattr(msg, "usage", None)
    _log_usage(
        user=user, operation=operation, model=resolved, streaming=False,
        input_tokens=int(getattr(usage, "input_tokens", 0) or 0),
        output_tokens=int(getattr(usage, "output_tokens", 0) or 0),
        duration_ms=int((time.monotonic() - started) * 1000),
        succeeded=True,
    )
    return "".join(parts).strip()


def run_stream(
    operation: str,
    content: str,
    extra: str = "",
    model: str | None = None,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    *,
    user=None,
) -> Iterator[str]:
    """Yield text deltas as they arrive. Caller is responsible for SSE framing."""
    import time
    client = _client()
    resolved = resolve_model(model)
    started = time.monotonic()
    final_usage = {"in": 0, "out": 0}
    err = ""
    try:
        with client.messages.stream(
            model=resolved,
            max_tokens=max_tokens,
            system=SYSTEM_PROMPT,
            messages=build_messages(operation, content, extra),
        ) as stream:
            for text in stream.text_stream:
                if text:
                    yield text
            # After the iterator exhausts, get_final_message has usage info.
            final = stream.get_final_message()
            usage = getattr(final, "usage", None)
            final_usage["in"] = int(getattr(usage, "input_tokens", 0) or 0)
            final_usage["out"] = int(getattr(usage, "output_tokens", 0) or 0)
    except Exception as e:
        err = str(e)
        raise
    finally:
        _log_usage(
            user=user, operation=operation, model=resolved, streaming=True,
            input_tokens=final_usage["in"],
            output_tokens=final_usage["out"],
            duration_ms=int((time.monotonic() - started) * 1000),
            succeeded=not err,
            error=err,
        )
