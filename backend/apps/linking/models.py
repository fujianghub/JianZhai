from __future__ import annotations

from django.db import models

from apps.knowledge.models import Document


class DocumentLink(models.Model):
    """An outgoing reference from one Document to another via @[title](doc:NN) syntax."""

    source = models.ForeignKey(
        Document, on_delete=models.CASCADE, related_name="outgoing_links"
    )
    target = models.ForeignKey(
        Document, on_delete=models.CASCADE, related_name="incoming_links"
    )
    context = models.TextField(blank=True)  # surrounding text snippet for backlink display
    position = models.IntegerField(default=0)  # char offset within source.raw_content
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["source", "target", "position"], name="unique_link_at_position"
            ),
        ]
        indexes = [
            models.Index(fields=["target"]),
            models.Index(fields=["source"]),
        ]
        ordering = ["position"]

    def __str__(self) -> str:
        return f"{self.source_id} → {self.target_id} @{self.position}"
