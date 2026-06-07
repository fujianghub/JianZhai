"""Phase D 回归：AISettings 单例缓存失效 + AIUsageLog.estimated_usd 内禀计算。"""
from __future__ import annotations

import pytest
from django.core.cache import cache

from apps.ai.models import AISettings, AIUsageLog

pytestmark = pytest.mark.django_db


def test_settings_cache_invalidated_on_save():
    cache.delete(AISettings.CACHE_KEY)
    s = AISettings.load()
    s.default_model = "claude-opus-4-7"
    s.save()

    # Warm the cache via the hot-path read.
    first = AISettings.load(use_cache=True)
    assert first.default_model == "claude-opus-4-7"
    assert cache.get(AISettings.CACHE_KEY) is not None

    # A save must drop the cache so the next cached read reflects the change.
    s.default_model = "qwen-max"
    s.save()
    assert cache.get(AISettings.CACHE_KEY) is None
    assert AISettings.load(use_cache=True).default_model == "qwen-max"


def test_estimated_usd_computed_on_create():
    """Any creation path (not just _log_usage) gets a cost via save()."""
    row = AIUsageLog.objects.create(
        operation="polish",
        model="claude-opus-4-7",
        input_tokens=10000,
        output_tokens=2000,
    )
    assert row.estimated_usd > 0


def test_budget_spend_uses_db_sum():
    from datetime import timedelta

    from django.contrib.auth import get_user_model
    from django.utils import timezone

    from apps.ai.services import _spent_usd_since

    user = get_user_model().objects.create_user("budgetuser", password="x")
    AIUsageLog.objects.create(
        user=user, operation="polish", model="claude-opus-4-7",
        input_tokens=10000, output_tokens=2000,
    )
    cutoff = timezone.now() - timedelta(hours=24)
    spent = _spent_usd_since(user, cutoff)
    assert spent > 0
