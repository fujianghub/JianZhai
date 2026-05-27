"""Recompute search_vector for every (non-deleted) document. Run after enabling search."""
from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.knowledge.models import Document
from apps.search.services import update_search_vector


class Command(BaseCommand):
    help = "Recompute jieba-segmented PostgreSQL search vectors for all live documents."

    def handle(self, *args, **options):
        docs = Document.objects.prefetch_related("tags", "comments")
        total = docs.count()
        for i, doc in enumerate(docs.iterator(chunk_size=200), start=1):
            update_search_vector(doc)
            if i % 50 == 0 or i == total:
                self.stdout.write(f"  reindexed {i}/{total}")
        self.stdout.write(self.style.SUCCESS(f"Reindexed {total} documents."))
