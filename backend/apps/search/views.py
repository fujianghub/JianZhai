from __future__ import annotations

from django.contrib.postgres.search import SearchQuery, SearchRank
from django.db.models import F
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.scoping import scope_queryset
from apps.knowledge.models import Document

from .services import segment

MAX_RESULTS = 50
SNIPPET_RADIUS = 60
# Hard cap on the query string before jieba segmentation — segmentation is
# synchronous CPU work per request, and no legitimate search needs more.
MAX_QUERY_CHARS = 256


def _document_snippet(doc: Document, tokens: list[str]) -> str:
    """Prefer a snippet from body; fall back to tag names or comments when matched."""
    sources = [
        doc.raw_content or "",
        " ".join(t.name for t in doc.tags.all()),
        " ".join(c.content for c in doc.comments.all()),
    ]
    for source in sources:
        if not source:
            continue
        lower = source.lower()
        if any(tok.lower() in lower for tok in tokens):
            return _snippet(source, tokens)
    return _snippet(doc.raw_content or "", tokens)


def _snippet(text: str, tokens: list[str]) -> str:
    """Return a short snippet around the first matching token (case-insensitive)."""
    if not text:
        return ""
    lower = text.lower()
    for tok in tokens:
        idx = lower.find(tok.lower())
        if idx >= 0:
            start = max(0, idx - SNIPPET_RADIUS)
            end = min(len(text), idx + len(tok) + SNIPPET_RADIUS)
            prefix = "…" if start > 0 else ""
            suffix = "…" if end < len(text) else ""
            return f"{prefix}{text[start:end].strip()}{suffix}"
    return text[:160].strip()


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def search(request):
    raw_q = (request.query_params.get("q") or "").strip()[:MAX_QUERY_CHARS]
    if not raw_q:
        return Response({"query": "", "results": []})

    segmented = segment(raw_q)
    if not segmented:
        return Response({"query": raw_q, "results": []})

    pg_query = SearchQuery(segmented, config="simple", search_type="plain")
    qs = (
        scope_queryset(Document.objects.all(), request.user)
        .filter(search_vector=pg_query)
        .annotate(rank=SearchRank(F("search_vector"), pg_query))
        .select_related("knowledge_base")
        .prefetch_related("tags", "comments")
    )

    # Optional filters
    kb = request.query_params.get("kb")
    if kb:
        qs = qs.filter(knowledge_base_id=kb)
    status_filter = request.query_params.get("status")
    if status_filter in {"draft", "published"}:
        qs = qs.filter(status=status_filter)
    date_from = request.query_params.get("from")
    if date_from:
        qs = qs.filter(updated_at__gte=date_from)
    date_to = request.query_params.get("to")
    if date_to:
        qs = qs.filter(updated_at__lte=date_to)

    qs = qs.order_by("-rank", "-updated_at")[:MAX_RESULTS]
    tokens = [t for t in segmented.split() if t]

    return Response(
        {
            "query": raw_q,
            "results": [
                {
                    "id": d.id,
                    "title": d.title,
                    "slug": d.slug,
                    "snippet": _document_snippet(d, tokens),
                    "status": d.status,
                    "visibility": d.visibility,
                    "knowledge_base": {"id": d.knowledge_base_id, "name": d.knowledge_base.name},
                    "updated_at": d.updated_at,
                    "rank": getattr(d, "rank", 0),
                }
                for d in qs
            ],
        }
    )
