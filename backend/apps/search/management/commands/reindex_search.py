"""Recompute search_vector for every (non-deleted) document. Run after enabling search."""
from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.knowledge.models import Document
from apps.search.services import update_search_vector


class Command(BaseCommand):
    help = "Recompute jieba-segmented PostgreSQL search vectors for all live documents."

    def add_arguments(self, parser):
        parser.add_argument("--kb", type=str, help="Only documents in this KB slug.")
        parser.add_argument("--ids", nargs="+", type=int, help="Only these document ids.")

    def handle(self, *args, **options):
        docs = Document.objects.select_related("extract").prefetch_related("tags", "comments", "slides")
        if options.get("kb"):
            docs = docs.filter(knowledge_base__slug=options["kb"])
        if options.get("ids"):
            docs = docs.filter(id__in=options["ids"])
        total = docs.count()
        for i, doc in enumerate(docs.iterator(chunk_size=200), start=1):
            update_search_vector(doc)
            if i % 50 == 0 or i == total:
                self.stdout.write(f"  reindexed {i}/{total}")
        self.stdout.write(self.style.SUCCESS(f"Reindexed {total} documents."))
