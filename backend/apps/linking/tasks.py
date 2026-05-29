from __future__ import annotations

import logging

from celery import shared_task
from django.db import transaction

log = logging.getLogger(__name__)


@shared_task(name="linking.sync_document_links")
def sync_document_links(document_id: int) -> None:
    """Re-derive DocumentLink rows for a document from its raw_content.

    Async to keep autosave responses fast — parsing + DELETE/bulk_create runs
    after the HTTP response, so users don't wait for it.
    """
    from apps.knowledge.models import Document

    from .models import DocumentLink
    from .parser import parse_mentions

    try:
        doc = Document.all_objects.select_related("knowledge_base").get(pk=document_id)
    except Document.DoesNotExist:
        DocumentLink.objects.filter(source_id=document_id).delete()
        return

    if doc.is_deleted:
        DocumentLink.objects.filter(source=doc).delete()
        return

    parsed = parse_mentions(doc.raw_content or "")
    if not parsed:
        DocumentLink.objects.filter(source=doc).delete()
        return

    target_ids = {p.target_id for p in parsed if p.target_id != doc.id}
    owner_id = doc.knowledge_base.owner_id
    valid_target_ids = set(
        Document.objects.filter(
            id__in=target_ids,
            knowledge_base__owner_id=owner_id,
            is_deleted=False,
        ).values_list("id", flat=True)
    )

    with transaction.atomic():
        # Serialize concurrent syncs for the same source document. The lock is
        # held for the duration of the `with` block — assigning the result to a
        # local prevents Django from issuing a second query that drops it (and,
        # more subtly, makes the intent unambiguous to readers). If the doc was
        # hard-deleted between fetch and lock, treat it as a no-op.
        locked = Document.all_objects.select_for_update().filter(pk=document_id).first()
        if locked is None:
            DocumentLink.objects.filter(source_id=document_id).delete()
            return
        DocumentLink.objects.filter(source=doc).delete()
        DocumentLink.objects.bulk_create(
            [
                DocumentLink(
                    source=doc,
                    target_id=p.target_id,
                    position=p.position,
                    context=p.context,
                )
                for p in parsed
                if p.target_id in valid_target_ids
            ]
        )
