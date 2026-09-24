"""Editor-side reactions to Document writes."""

from __future__ import annotations

import logging

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.knowledge.models import Document

log = logging.getLogger(__name__)


@receiver(post_save, sender=Document, dispatch_uid="editor.drawio_gc")
def _prune_drawio_on_save(sender, instance: Document, created: bool, **kwargs):
    """Reclaim superseded drawio画板 files once the write has committed."""
    if created or kwargs.get("raw"):
        return
    update_fields = kwargs.get("update_fields")
    if update_fields is not None and not ({"raw_content", "published_content"} & set(update_fields)):
        return

    def run():
        from .services.drawio_gc import prune_drawio_attachments

        try:
            prune_drawio_attachments(instance)
        except Exception:  # noqa: BLE001 — cleanup must never break a save
            log.exception("drawio_gc failed for document %s", instance.pk)

    transaction.on_commit(run)
