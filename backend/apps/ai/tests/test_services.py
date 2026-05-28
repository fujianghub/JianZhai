from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from apps.ai.models import AISettings
from apps.ai.services import (
    AVAILABLE_MODELS,
    _provider_for,
    get_max_tokens,
    provider_configured,
    providers_configured,
    run_once,
)


@pytest.mark.django_db
def test_run_once_uses_ai_settings_max_tokens():
    settings = AISettings.load()
    settings.max_tokens = 512
    settings.save()

    mock_client = MagicMock()
    mock_msg = MagicMock()
    mock_msg.content = [MagicMock(text="ok")]
    mock_msg.usage = MagicMock(input_tokens=1, output_tokens=2)
    mock_client.messages.create.return_value = mock_msg

    with patch("apps.ai.services._client", return_value=mock_client):
        result = run_once("polish", "hello", user=None)

    assert result == "ok"
    assert mock_client.messages.create.call_args.kwargs["max_tokens"] == 512
    assert get_max_tokens() == 512


def test_provider_for_claude_models():
    assert _provider_for("claude-opus-4-7") == "anthropic"
    assert _provider_for("claude-sonnet-4-6") == "anthropic"


def test_provider_for_qwen_models():
    assert _provider_for("qwen-max") == "qwen"
    assert _provider_for("qwen-plus") == "qwen"
    assert _provider_for("qwen-turbo") == "qwen"


def test_provider_for_unknown_falls_back_to_anthropic():
    # Legacy / unrecognized ids stay on Claude so old data doesn't 500.
    assert _provider_for("some-unknown-future-model") == "anthropic"


def test_available_models_carry_provider_field():
    for m in AVAILABLE_MODELS:
        assert "provider" in m, f"model {m['id']} is missing 'provider'"
        assert m["provider"] in ("anthropic", "qwen")


def test_providers_configured_reflects_env(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)
    assert providers_configured() == {"anthropic": False, "qwen": False}
    assert provider_configured("anthropic") is False
    assert provider_configured("qwen") is False

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-x")
    assert provider_configured("anthropic") is True
    assert provider_configured("qwen") is False

    monkeypatch.setenv("DASHSCOPE_API_KEY", "sk-x")
    assert providers_configured() == {"anthropic": True, "qwen": True}


@pytest.mark.django_db
def test_run_once_dispatches_to_qwen_for_qwen_models(monkeypatch):
    """run_once routes to the Qwen path when model id is a Qwen one — uses the
    OpenAI-compatible client and normalizes prompt_tokens/completion_tokens
    into our log schema."""
    monkeypatch.setenv("DASHSCOPE_API_KEY", "sk-test")

    mock_qwen = MagicMock()
    mock_resp = MagicMock()
    mock_resp.choices = [MagicMock(message=MagicMock(content="千问回复"))]
    mock_resp.usage = MagicMock(prompt_tokens=10, completion_tokens=20)
    mock_qwen.chat.completions.create.return_value = mock_resp

    with patch("apps.ai.services._qwen_client", return_value=mock_qwen):
        result = run_once("polish", "你好", model="qwen-max", user=None)

    assert result == "千问回复"
    call_kwargs = mock_qwen.chat.completions.create.call_args.kwargs
    assert call_kwargs["model"] == "qwen-max"
    # System prompt should ride at messages[0] for OpenAI-compat, not as a
    # top-level `system=` param (that's Anthropic's shape).
    assert call_kwargs["messages"][0]["role"] == "system"
    assert "system" not in call_kwargs
