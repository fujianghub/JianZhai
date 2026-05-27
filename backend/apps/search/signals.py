from __future__ import annotations

from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.comments.models import Comment
from apps.knowledge.models import Document
from apps.tags.models import DocumentTag

from .tasks import refresh_document_vector


def _schedule_document_reindex(document_id: int) -> None:
    transaction.on_commit(lambda: refresh_document_vector.delay(document_id))


@receiver(post_save, sender=Document)
def refresh_search_vector(sender, instance: Document, **kwargs) -> None:
    if instance.is_deleted:
        return
    _schedule_document_reindex(instance.pk)


@receiver(post_save, sender=DocumentTag)
def refresh_search_vector_on_tag_save(sender, instance: DocumentTag, **kwargs) -> None:
    _schedule_document_reindex(instance.document_id)


@receiver(post_delete, sender=DocumentTag)
def refresh_search_vector_on_tag_delete(sender, instance: DocumentTag, **kwargs) -> None:
    _schedule_document_reindex(instance.document_id)


@receiver(post_save, sender=Comment)
def refresh_search_vector_on_comment_save(sender, instance: Comment, **kwargs) -> None:
    _schedule_document_reindex(instance.document_id)


@receiver(post_delete, sender=Comment)
def refresh_search_vector_on_comment_delete(sender, instance: Comment, **kwargs) -> None:
    _schedule_document_reindex(instance.document_id)
