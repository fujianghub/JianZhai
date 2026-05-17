from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.knowledge.models import Document

from .models import DocumentLink
from .serializers import BacklinkSerializer


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def backlinks(request, doc_id: int):
    """List documents that link TO the given document."""
    doc = get_object_or_404(
        Document.objects.filter(knowledge_base__owner=request.user), pk=doc_id
    )
    qs = (
        DocumentLink.objects.filter(target=doc)
        .select_related("source", "source__knowledge_base")
        .order_by("-created_at")
    )
    return Response(BacklinkSerializer(qs, many=True).data)
