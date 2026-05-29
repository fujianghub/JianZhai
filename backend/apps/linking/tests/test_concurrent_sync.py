"""Concurrent sync_document_links integrity.

Reproduces the lock-held-across-bulk_create invariant that the original
implementation broke (acquiring select_for_update then immediately discarding
the return value) — two parallel sync calls now serialize cleanly instead
of racing.
"""
from __future__ import annotations

import threading

import pytest
from django.contrib.auth import get_user_model
from django.db import connection, connections

from apps.knowledge.models import Document, KnowledgeBase
from apps.linking.models import DocumentLink
from apps.linking.tasks import sync_document_links

User = get_user_model()


@pytest.fixture
def owner(db):
    return User.objects.create_user("linker", "linker@example.com", "pass")


@pytest.fixture
def kb(owner):
    return KnowledgeBase.objects.create(owner=owner, name="L", slug="l")


@pytest.fixture
def docs(kb):
    src = Document.objects.create(
        knowledge_base=kb, title="Src", slug="src", raw_content=""
    )
    tgt = Document.objects.create(
        knowledge_base=kb, title="Tgt", slug="tgt", raw_content="body"
    )
    return src, tgt


@pytest.mark.django_db(transaction=True)
def test_sync_document_links_no_duplicates_under_contention(docs):
    """Two parallel sync calls produce a consistent (non-duplicated) link set.

    The pre-fix code held no real lock — second runner could DELETE first
    runner's inserts before its own bulk_create finished, yielding either
    duplicate (target_id) rows or a partial set. With ``select_for_update``
    actually held, the two calls serialise.
    """
    src, tgt = docs
    src.raw_content = f"@[Tgt](doc:{tgt.id})"
    src.save(update_fields=["raw_content"])

    errors: list[BaseException] = []

    def run():
        try:
            sync_document_links(src.id)
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)
        finally:
            connections.close_all()

    threads = [threading.Thread(target=run) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=15)

    assert not errors, f"concurrent runners raised: {errors!r}"

    # The final state must be exactly one link from src → tgt, regardless of
    # how many runners interleaved.
    count = DocumentLink.objects.filter(source=src, target=tgt).count()
    assert count == 1, f"expected 1 link, got {count}"


@pytest.mark.django_db(transaction=True)
def test_sync_document_links_skips_after_hard_delete(docs):
    """If the source doc is hard-deleted between dispatch and execution, the
    task drops any orphan links and returns cleanly rather than 500-ing."""
    src, _tgt = docs
    src_id = src.id
    src.delete()
    # Should not raise.
    sync_document_links(src_id)
    assert DocumentLink.objects.filter(source_id=src_id).count() == 0
