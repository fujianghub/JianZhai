from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from apps.ai.models import AISettings
from apps.ai.services import get_max_tokens, run_once


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
