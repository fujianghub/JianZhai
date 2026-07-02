"""Perf regression: short-query jieba tokenization is memoised.

Search queries are short and often repeated; jieba is CPU-heavy. ``segment``
caches short inputs and bypasses the cache for long document bodies (unique per
doc, large → near-zero hit rate). Caching must never change the output.
"""
from __future__ import annotations

from apps.search.services import _segment, _segment_cached, segment


def test_short_query_hits_cache_and_matches_uncached():
    _segment_cached.cache_clear()
    q = "翡翠知识库 全文搜索"

    first = segment(q)
    assert _segment_cached.cache_info().hits == 0  # cold miss populated it
    second = segment(q)
    assert _segment_cached.cache_info().hits >= 1  # served from cache

    # Cached result must be byte-identical to computing it directly.
    assert first == second == _segment(q)


def test_long_body_bypasses_cache():
    _segment_cached.cache_clear()
    body = "翡翠" * 300  # > 256 chars → indexing path, not a query
    out = segment(body)
    assert out == _segment(body)
    # Long inputs must not populate the query cache.
    assert _segment_cached.cache_info().currsize == 0


def test_empty_is_empty():
    assert segment("") == ""
