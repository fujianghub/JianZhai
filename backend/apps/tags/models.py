from __future__ import annotations

from django.conf import settings
from django.db import models

from apps.knowledge.models import Document, KnowledgeBase


class Tag(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tags"
    )
    name = models.CharField(max_length=50)
    slug = models.SlugField(max_length=60, allow_unicode=True)
    color = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    documents = models.ManyToManyField(
        Document, through="DocumentTag", related_name="tags"
    )
    knowledge_bases = models.ManyToManyField(
        KnowledgeBase, through="KnowledgeBaseTag", related_name="tags"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["owner", "name"], name="unique_owner_tag_name"),
            models.UniqueConstraint(fields=["owner", "slug"], name="unique_owner_tag_slug"),
        ]
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class DocumentTag(models.Model):
    document = models.ForeignKey(Document, on_delete=models.CASCADE)
    tag = models.ForeignKey(Tag, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["document", "tag"], name="unique_doc_tag"),
        ]


class KnowledgeBaseTag(models.Model):
    knowledge_base = models.ForeignKey(KnowledgeBase, on_delete=models.CASCADE)
    tag = models.ForeignKey(Tag, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["knowledge_base", "tag"], name="unique_kb_tag"),
        ]
