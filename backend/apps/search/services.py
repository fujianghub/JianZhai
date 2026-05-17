"""jieba-based pre-tokenization so PostgreSQL tsvector can handle Chinese."""
from __future__ import annotations

from typing import Iterable

import jieba
from django.contrib.postgres.search import SearchVector
from django.db.models import Value

# Silence jieba's startup log spam
jieba.setLogLevel(60)


def segment(text: str) -> str:
    if not text:
        return ""
    tokens = (t.strip() for t in jieba.cut_for_search(text) if t and t.strip())
    return " ".join(_iter_unique(tokens))


def _iter_unique(items: Iterable[str]) -> Iterable[str]:
    seen: set[str] = set()
    for it in items:
        if it not in seen:
            seen.add(it)
            yield it


def update_search_vector(document) -> None:
    """Recompute and persist `document.search_vector`."""
    from apps.knowledge.models import Document  # local import to avoid cycle

    segmented_title = segment(document.title or "")
    segmented_body = segment(document.raw_content or "")
    blob = f"{segmented_title} {segmented_body}".strip()

    Document.all_objects.filter(pk=document.pk).update(
        search_vector=SearchVector(Value(blob), config="simple")
    )
