from __future__ import annotations

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.knowledge.models import Document

from .models import DocumentLink
from .tasks import sync_document_links


@receiver(post_save, sender=Document)
def queue_document_link_sync(sender, instance: Document, created: bool, **kwargs) -> None:
    """Queue link re-derivation; keeps the request/response path off the parser+DB churn."""
    if instance.is_deleted:
        # Cheap single DELETE — safe to run inline so a freshly soft-deleted
        # doc never lingers as a link source if the worker is down.
        DocumentLink.objects.filter(source=instance).delete()
        return
    document_id = instance.pk
    transaction.on_commit(lambda: sync_document_links.delay(document_id))
