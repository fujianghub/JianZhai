from __future__ import annotations

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.knowledge.models import Document

from .services import update_search_vector


@receiver(post_save, sender=Document)
def refresh_search_vector(sender, instance: Document, **kwargs) -> None:
    if instance.is_deleted:
        return
    update_search_vector(instance)
