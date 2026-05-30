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

⚠ Keys MUST match ``services.AVAILABLE_MODELS[i]["id"]`` exactly. A
mismatched id silently falls through to ``DEFAULT_PRICE_USD``, which
silently corrupts the cost estimate on the admin usage heatmap. The
``test_prices_cover_every_model`` test pins this contract.
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
    # Haiku — fast / cheap. Note: services registers Haiku 4.5 with the full
    # date suffix (``claude-haiku-4-5-20251001``) because the Anthropic API
    # demands the dated id. We keep BOTH the dated and bare aliases so the
    # estimator hits the right tier regardless of which id flows through.
    "claude-haiku-4-5-20251001": (1.0, 5.0),
    "claude-haiku-4-5": (1.0, 5.0),
}

# Qwen prices are published in CNY. The conversion sits here so the
# pricing table reads cleanly; bump CNY_TO_USD if the rate drifts > 5%.
CNY_TO_USD = 0.14

# Per-MTok CNY rates. Updated 2026-05 from DashScope公开计费页. Keys MUST
# match services.AVAILABLE_MODELS — text models use the stable production
# aliases (qwen-max / plus / turbo), vision models are qwen-vl-*.
QWEN_PRICES_CNY = {
    "qwen-max":      (20.0, 60.0),     # 顶配文本
    "qwen-plus":     (4.0, 12.0),      # 平衡
    "qwen-turbo":    (1.5, 6.0),       # 速度优先
    "qwen-vl-max":   (20.0, 60.0),     # 视觉旗舰（v0.9.7 新增）
    "qwen-vl-plus":  (8.0, 24.0),      # 视觉平价
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
# class so the estimate is "roughly right" rather than zero. Tests assert
# that NO production model id silently falls through to this.
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


def estimate_input_tokens_from_chars(text: str) -> int:
    """Rough heuristic for "how many input tokens will this prompt cost".

    Used by the frontend to show a token / cost preview on AI buttons
    BEFORE the call is made. We don't run a real tokenizer here — that
    would require a 50 MB+ dependency and per-model logic — instead we
    use a calibrated character-to-token ratio:

      - CJK characters: roughly 1.5 chars per token (Claude / Qwen both)
      - Latin words:    roughly 4 chars per token

    Returns a conservative (slightly high) estimate so the preview never
    under-quotes. Real input tokens will usually be within 20%.
    """
    if not text:
        return 0
    # Count CJK chars vs latin chars separately, then combine.
    cjk = sum(1 for c in text if '㐀' <= c <= '鿿' or '＀' <= c <= '￯')
    other = len(text) - cjk
    # Round up so we never under-estimate.
    return max(1, int(cjk / 1.5 + other / 4 + 0.999))
