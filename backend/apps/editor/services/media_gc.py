"""Delete a document's media files together with its rows.

Historically a permanent delete (回收站 purge / 清空回收站) was a bare ORM
``delete()``: ``SlideImage`` / ``DerivedFile`` rows cascaded but their JPEG /
PDF files stayed on disk, and ``Attachment`` (``on_delete=SET_NULL``) kept both
its row and its file — with the ``/media`` URL still serving it. This module
is the single place that knows which files belong to a document.

Decision (2026-09-08): attachments are deleted *with* the document. They were
uploaded for it, and an orphan row with a live URL is exactly the leak the
purge is meant to close.

Order matters: rows go first (inside the caller's transaction), files are
removed afterwards best-effort — a failed DB delete must never leave the DB
pointing at files that are gone.
"""

from __future__ import annotations

import logging

from django.db import transaction

from apps.editor.models import Attachment, DerivedFile, SlideImage
from apps.knowledge.models import Document, KnowledgeBase

log = logging.getLogger(__name__)


def collect_document_files(doc: Document) -> list:
    """Every storage file owned by ``doc`` (attachments, slide rasters and
    thumbnails, derived files), as FieldFile objects."""
    files = []
    for att in Attachment.objects.filter(document=doc):
        if att.file:
            files.append(att.file)
    for slide in SlideImage.objects.filter(document=doc):
        if slide.image:
            files.append(slide.image)
        if slide.thumbnail:
            files.append(slide.thumbnail)
    for derived in DerivedFile.objects.filter(document=doc):
        if derived.file:
            files.append(derived.file)
    return files


def delete_files(files) -> int:
    """Best-effort unlink; returns how many were removed."""
    n = 0
    for f in files:
        try:
            f.delete(save=False)
            n += 1
        except Exception:  # noqa: BLE001 — never let a stale file block a purge
            log.warning("media_gc: could not delete %s", getattr(f, "name", f))
    return n


def purge_document(doc: Document) -> int:
    """Hard-delete ``doc`` (rows + files). Returns the number of files removed."""
    files = collect_document_files(doc)
    with transaction.atomic():
        Attachment.objects.filter(document=doc).delete()  # cascades SlideImage.source too
        doc.delete()
    return delete_files(files)


def purge_knowledge_base(kb: KnowledgeBase) -> int:
    """Hard-delete a KB and every document in it (live or trashed), files included."""
    files = []
    for doc in Document.all_objects.filter(knowledge_base=kb):
        files.extend(collect_document_files(doc))
    doc_ids = list(Document.all_objects.filter(knowledge_base=kb).values_list("id", flat=True))
    with transaction.atomic():
        Attachment.objects.filter(document_id__in=doc_ids).delete()
        kb.delete()
    return delete_files(files)
