"""Per-model token pricing for the usage cost estimator.

The numbers are the public Anthropic / DashScope rates as of 2026-05.
They live here (not in settings) so the values are obvious at a glance to
anyone reading ``usage`` and trivially updatable in one commit when
Anthropic / Alibaba refresh their pricing pages — that's once or twice a
year, not the kind of churn that justifies a DB table.

Both columns are USD per *million* tokens. Qwen prices are quoted in CNY
on the official page; we convert at a hand-set USD rate (CNY_TO_USD) so
the dashboard reports one consistent currency. The rate is a deliberate
round-down for the user — under-quoting "estimated USD" is better than
over-quoting when the conversion drifts.

Per-model entries fall back to ``DEFAULT_PRICE`` for any model id not
explicitly listed (e.g. a future Sonnet variant the dashboard doesn't
know about yet). The default is intentionally tuned to Sonnet-class
pricing so the estimate is in the right order of magnitude even when
the cache is stale.
"""
from __future__ import annotations

# USD per million tokens (input / output). Keys are the **canonical** model
# ids the backend forwards to the provider — see services.AVAILABLE_MODELS.
ANTHROPIC_PRICES_USD = {
    # Opus 4.x line — premium tier.
    "claude-opus-4-7": (15.0, 75.0),
    "claude-opus-4-6": (15.0, 75.0),
    # Sonnet — balanced.
    "claude-sonnet-4-6": (3.0, 15.0),
    # Haiku — fast / cheap.
    "claude-haiku-4-5": (1.0, 5.0),
}

# Qwen prices are published in CNY. The conversion sits here so the
# pricing table reads cleanly; bump CNY_TO_USD if the rate drifts > 5%.
CNY_TO_USD = 0.14
QWEN_PRICES_CNY = {
    # Qwen3 generations — same per-tier shape as Anthropic, much cheaper.
    "qwen3-max": (10.0, 40.0),
    "qwen3-coder-plus": (4.0, 16.0),
    "qwen3-coder-flash": (1.0, 4.0),
}
QWEN_PRICES_USD = {
    model: (round(in_ * CNY_TO_USD, 4), round(out_ * CNY_TO_USD, 4))
    for model, (in_, out_) in QWEN_PRICES_CNY.items()
}

MODEL_PRICES_USD: dict[str, tuple[float, float]] = {
    **ANTHROPIC_PRICES_USD,
    **QWEN_PRICES_USD,
}

# Fallback when the dashboard sees an unknown model id. Pegged at Sonnet
# class so the estimate is "roughly right" rather than zero.
DEFAULT_PRICE_USD = (3.0, 15.0)


def estimate_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    """Estimate the USD cost of a single call (or aggregate of calls).

    Both numbers are token counts. The result is rounded to 4 decimal
    places — usage dashboards typically show 2–3 significant digits and
    rounding here keeps downstream serialisation from drifting.
    """
    in_rate, out_rate = MODEL_PRICES_USD.get(model, DEFAULT_PRICE_USD)
    cost = (input_tokens / 1_000_000.0) * in_rate + (output_tokens / 1_000_000.0) * out_rate
    return round(cost, 4)
