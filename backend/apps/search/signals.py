from __future__ import annotations

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.knowledge.models import Document

from .tasks import refresh_document_vector


@receiver(post_save, sender=Document)
def refresh_search_vector(sender, instance: Document, **kwargs) -> None:
    if instance.is_deleted:
        return
    document_id = instance.pk
    transaction.on_commit(lambda: refresh_document_vector.delay(document_id))
