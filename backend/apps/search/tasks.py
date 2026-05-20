from __future__ import annotations

import logging

from celery import shared_task

log = logging.getLogger(__name__)


@shared_task(name="search.refresh_document_vector")
def refresh_document_vector(document_id: int) -> None:
    """Re-tokenize a document and persist its `search_vector`.

    Kept out of the request/response path so `PATCH /documents/{id}` doesn't
    block on jieba — a 10k-word document can spend hundreds of ms here.
    """
    from apps.knowledge.models import Document

    from .services import update_search_vector

    try:
        doc = Document.all_objects.get(pk=document_id)
    except Document.DoesNotExist:
        return
    if doc.is_deleted:
        return
    update_search_vector(doc)
