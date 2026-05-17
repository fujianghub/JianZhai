from __future__ import annotations

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.knowledge.models import Document

from .models import DocumentLink
from .parser import parse_mentions


@receiver(post_save, sender=Document)
def sync_document_links(sender, instance: Document, created: bool, **kwargs) -> None:
    """Re-derive DocumentLink rows for `instance` from its raw_content."""
    if instance.is_deleted:
        DocumentLink.objects.filter(source=instance).delete()
        return

    parsed = parse_mentions(instance.raw_content or "")
    valid_target_ids = set(
        Document.objects.filter(id__in={p.target_id for p in parsed}).values_list(
            "id", flat=True
        )
    )

    with transaction.atomic():
        DocumentLink.objects.filter(source=instance).delete()
        DocumentLink.objects.bulk_create(
            [
                DocumentLink(
                    source=instance,
                    target_id=p.target_id,
                    position=p.position,
                    context=p.context,
                )
                for p in parsed
                if p.target_id in valid_target_ids and p.target_id != instance.id
            ]
        )
