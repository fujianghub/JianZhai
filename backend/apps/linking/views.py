from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.scoping import scope_queryset
from apps.knowledge.models import Document

from .models import DocumentLink
from .serializers import BacklinkSerializer


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def backlinks(request, doc_id: int):
    """List documents that link TO the given document."""
    doc = get_object_or_404(
        scope_queryset(Document.objects.all(), request.user), pk=doc_id
    )
    qs = (
        DocumentLink.objects.filter(target=doc)
        .select_related("source", "source__knowledge_base")
        .order_by("-created_at")
    )
    return Response(BacklinkSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def graph(request):
    """Knowledge-graph endpoint: returns the full doc/link graph in one shot.

    Shape suits react-force-graph-2d / D3-force: ``nodes`` carry the metadata
    needed to render labels + group color, ``edges`` carry source/target ids.
    Self-loops and duplicate edges (multiple mentions of the same doc from the
    same source) are collapsed.

    For superusers this returns the whole graph; staff/regular users see only
    docs owned by them via the standard ``scope_queryset`` filter.
    """
    docs_qs = (
        scope_queryset(Document.objects.all(), request.user)
        .select_related("knowledge_base")
        .only("id", "title", "slug", "knowledge_base__id", "knowledge_base__name", "status", "visibility")
    )
    doc_ids = set(docs_qs.values_list("id", flat=True))

    nodes = [
        {
            "id": d.id,
            "title": d.title,
            "slug": d.slug,
            "status": d.status,
            "visibility": d.visibility,
            "kb_id": d.knowledge_base_id,
            "kb_name": d.knowledge_base.name,
        }
        for d in docs_qs
    ]

    # Collapse multiple mentions of the same target from the same source.
    edge_pairs: set[tuple[int, int]] = set()
    edges: list[dict] = []
    link_qs = DocumentLink.objects.filter(
        source_id__in=doc_ids, target_id__in=doc_ids
    ).values_list("source_id", "target_id")
    for source_id, target_id in link_qs:
        if source_id == target_id:
            continue
        key = (source_id, target_id)
        if key in edge_pairs:
            continue
        edge_pairs.add(key)
        edges.append({"source": source_id, "target": target_id})

    # Quick "orphan" hint for the UI: nodes with no in/out edges.
    connected: set[int] = set()
    for e in edges:
        connected.add(e["source"])
        connected.add(e["target"])
    orphan_count = sum(1 for n in nodes if n["id"] not in connected)

    return Response(
        {
            "nodes": nodes,
            "edges": edges,
            "stats": {
                "node_count": len(nodes),
                "edge_count": len(edges),
                "orphan_count": orphan_count,
            },
        }
    )
