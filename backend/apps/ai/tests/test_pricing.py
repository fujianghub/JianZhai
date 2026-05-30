"""Smoke tests for the AI usage pricing estimator.

The pricing table is hand-maintained; these tests catch typos and
unit-confusion (per-token vs per-Mtok) before they reach the dashboard.
"""
from __future__ import annotations

import pytest

from apps.ai.pricing import (
    DEFAULT_PRICE_USD,
    MODEL_PRICES_USD,
    estimate_cost_usd,
)


def test_table_has_anthropic_and_qwen():
    # Sanity: at least one model from each provider must be present so the
    # /admin/ai usage Tab can colour-code both. If this fires after a price
    # refresh the table has likely been pruned incorrectly.
    assert "claude-opus-4-7" in MODEL_PRICES_USD
    assert "claude-haiku-4-5" in MODEL_PRICES_USD
    assert any(m.startswith("qwen") for m in MODEL_PRICES_USD)


def test_prices_cover_every_production_model():
    """The pricing table MUST contain every model id that services
    actually serves — a mismatch silently falls back to DEFAULT_PRICE_USD
    (Sonnet-tier) and corrupts the admin usage cost estimate.

    Before v0.9.7 this contract was broken (services used ``qwen-max`` etc
    while pricing had ``qwen3-max``), so ALL Qwen calls were priced as
    Sonnet — a 30%+ over-estimate. This test pins the fix.
    """
    from apps.ai.services import ALLOWED_MODEL_IDS

    missing = ALLOWED_MODEL_IDS - set(MODEL_PRICES_USD.keys())
    assert not missing, (
        f"models registered in services but missing from pricing table: {missing}. "
        "Each model id served via /api/v1/ai/run/ must have an exact-match "
        "price entry in apps/ai/pricing.py — partial matches don't help."
    )


def test_estimate_zero_tokens_is_zero():
    assert estimate_cost_usd("claude-opus-4-7", 0, 0) == 0.0


@pytest.mark.parametrize(
    "model,in_tok,out_tok,expected",
    [
        # Opus 4.7 at $15/$75 per MTok → 1M in = $15, 1M out = $75
        ("claude-opus-4-7", 1_000_000, 0, 15.0),
        ("claude-opus-4-7", 0, 1_000_000, 75.0),
        ("claude-opus-4-7", 1_000_000, 1_000_000, 90.0),
        # Haiku 4.5 at $1/$5 — verifies the table doesn't mix up rates
        ("claude-haiku-4-5", 1_000_000, 1_000_000, 6.0),
        # Sonnet 4.6 at $3/$15
        ("claude-sonnet-4-6", 1_000_000, 1_000_000, 18.0),
    ],
)
def test_estimate_known_models(model, in_tok, out_tok, expected):
    assert estimate_cost_usd(model, in_tok, out_tok) == pytest.approx(expected, abs=0.001)


def test_unknown_model_falls_back_to_default():
    # A model id the dashboard hasn't seen before should land on the
    # Sonnet-class default so the estimate stays in the right OOM rather
    # than reporting 0.
    in_rate, out_rate = DEFAULT_PRICE_USD
    expected = (1_000_000 / 1_000_000) * in_rate + (500_000 / 1_000_000) * out_rate
    assert estimate_cost_usd("future-model-7", 1_000_000, 500_000) == pytest.approx(
        round(expected, 4)
    )


def test_estimate_rounds_to_four_places():
    # Random small call — the result must be rounded to 4 decimal places so
    # downstream JSON serialisation doesn't carry floating-point noise.
    cost = estimate_cost_usd("claude-haiku-4-5", 1234, 5678)
    # Check the value has at most 4 decimals.
    assert cost == round(cost, 4)
