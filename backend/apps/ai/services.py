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
# Each entry: (id, label, hint, provider). `provider` picks which SDK + API key
# the backend uses. Add new releases here as upstream providers ship them.
#
# Qwen uses Alibaba DashScope's OpenAI-compatible endpoint, so it only needs
# the `openai` SDK (no DashScope-specific lib). Update model ids as Alibaba
# publishes them — `qwen-max` is the current stable production alias and
# tracks the latest Qwen-Max release.
AVAILABLE_MODELS: list[dict[str, str]] = [
    {"id": "claude-opus-4-7", "label": "Claude Opus 4.7", "hint": "默认 / 最强推理", "provider": "anthropic"},
    {"id": "claude-sonnet-4-6", "label": "Claude Sonnet 4.6", "hint": "平衡 / 速度更快", "provider": "anthropic"},
    {"id": "claude-haiku-4-5-20251001", "label": "Claude Haiku 4.5", "hint": "最快 / 适合短任务", "provider": "anthropic"},
    {"id": "qwen-max", "label": "通义千问 Max", "hint": "阿里 · 中文优势 / 最强", "provider": "qwen"},
    {"id": "qwen-plus", "label": "通义千问 Plus", "hint": "阿里 · 性价比平衡", "provider": "qwen"},
    {"id": "qwen-turbo", "label": "通义千问 Turbo", "hint": "阿里 · 速度优先", "provider": "qwen"},
]
ALLOWED_MODEL_IDS = {m["id"] for m in AVAILABLE_MODELS}


def _provider_for(model_id: str) -> str:
    """Return which provider serves a given model id. Defaults to anthropic
    so unknown ids fall through to Claude (matches legacy behavior)."""
    for m in AVAILABLE_MODELS:
        if m["id"] == model_id:
            return m["provider"]
    return "anthropic"


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
    """OpenAI-compatible client pointed at Alibaba DashScope. The DashScope
    "compatible-mode" endpoint accepts standard OpenAI chat-completion calls,
    so we don't need the Alibaba-specific `dashscope` library."""
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


def _resolved_max_tokens(max_tokens: int | None) -> int:
    if max_tokens is not None:
        return max_tokens
    return get_max_tokens()


def run_once(
    operation: str,
    content: str,
    extra: str = "",
    model: str | None = None,
    max_tokens: int | None = None,
    *,
    user=None,
) -> str:
    """Non-streaming call. Returns the full assistant message text."""
    import time
    resolved = resolve_model(model)
    provider = _provider_for(resolved)
    token_limit = _resolved_max_tokens(max_tokens)
    started = time.monotonic()
    try:
        if provider == "anthropic":
            text, in_tok, out_tok = _run_once_anthropic(operation, content, extra, resolved, token_limit)
        else:  # qwen
            text, in_tok, out_tok = _run_once_qwen(operation, content, extra, resolved, token_limit)
    except Exception as e:
        _log_usage(
            user=user, operation=operation, model=resolved, streaming=False,
            duration_ms=int((time.monotonic() - started) * 1000),
            succeeded=False, error=str(e),
        )
        raise
    _log_usage(
        user=user, operation=operation, model=resolved, streaming=False,
        input_tokens=in_tok, output_tokens=out_tok,
        duration_ms=int((time.monotonic() - started) * 1000),
        succeeded=True,
    )
    return text


def _run_once_anthropic(operation, content, extra, model, max_tokens) -> tuple[str, int, int]:
    client = _client()
    msg = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=SYSTEM_PROMPT,
        messages=build_messages(operation, content, extra),
    )
    parts: list[str] = []
    for block in getattr(msg, "content", []) or []:
        text = getattr(block, "text", None)
        if text:
            parts.append(text)
    usage = getattr(msg, "usage", None)
    return (
        "".join(parts).strip(),
        int(getattr(usage, "input_tokens", 0) or 0),
        int(getattr(usage, "output_tokens", 0) or 0),
    )


def _qwen_messages(operation, content, extra):
    """Convert Anthropic-style messages to OpenAI-compatible — same role/content
    shape, but the system prompt rides as a leading message instead of a top-
    level param."""
    return [{"role": "system", "content": SYSTEM_PROMPT}, *build_messages(operation, content, extra)]


def _run_once_qwen(operation, content, extra, model, max_tokens) -> tuple[str, int, int]:
    client = _qwen_client()
    resp = client.chat.completions.create(
        model=model,
        max_tokens=max_tokens,
        messages=_qwen_messages(operation, content, extra),
    )
    text = (resp.choices[0].message.content or "").strip() if resp.choices else ""
    usage = getattr(resp, "usage", None)
    # OpenAI naming: prompt_tokens / completion_tokens — normalize to our log
    # schema (input_tokens / output_tokens).
    return (
        text,
        int(getattr(usage, "prompt_tokens", 0) or 0),
        int(getattr(usage, "completion_tokens", 0) or 0),
    )


def run_stream(
    operation: str,
    content: str,
    extra: str = "",
    model: str | None = None,
    max_tokens: int | None = None,
    *,
    user=None,
) -> Iterator[str]:
    """Yield text deltas as they arrive. Caller is responsible for SSE framing."""
    import time
    resolved = resolve_model(model)
    provider = _provider_for(resolved)
    token_limit = _resolved_max_tokens(max_tokens)
    started = time.monotonic()
    final_usage = {"in": 0, "out": 0}
    err = ""
    try:
        if provider == "anthropic":
            yield from _run_stream_anthropic(operation, content, extra, resolved, token_limit, final_usage)
        else:  # qwen
            yield from _run_stream_qwen(operation, content, extra, resolved, token_limit, final_usage)
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


def _run_stream_anthropic(operation, content, extra, model, max_tokens, final_usage) -> Iterator[str]:
    client = _client()
    with client.messages.stream(
        model=model,
        max_tokens=max_tokens,
        system=SYSTEM_PROMPT,
        messages=build_messages(operation, content, extra),
    ) as stream:
        for text in stream.text_stream:
            if text:
                yield text
        final = stream.get_final_message()
        usage = getattr(final, "usage", None)
        final_usage["in"] = int(getattr(usage, "input_tokens", 0) or 0)
        final_usage["out"] = int(getattr(usage, "output_tokens", 0) or 0)


def _run_stream_qwen(operation, content, extra, model, max_tokens, final_usage) -> Iterator[str]:
    client = _qwen_client()
    # `stream_options.include_usage` makes the final chunk carry token counts —
    # without it, OpenAI-compat streams have empty .usage at the end.
    stream = client.chat.completions.create(
        model=model,
        max_tokens=max_tokens,
        messages=_qwen_messages(operation, content, extra),
        stream=True,
        stream_options={"include_usage": True},
    )
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
