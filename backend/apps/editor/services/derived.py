"""Lookup helpers for :class:`apps.editor.models.DerivedFile`.

Lives in ``editor`` (not ``knowledge``) to keep the app dependency one-way:
knowledge → editor imports would be circular. Serializers in ``blog`` /
``knowledge`` call these with a Document that may carry ``prefetched_derived``
(``Prefetch("derived_files", to_attr="prefetched_derived")``) so detail
endpoints stay query-free.
"""

from __future__ import annotations

from django.db.models import Prefetch

from apps.editor.models import DerivedFile


def derived_prefetch() -> Prefetch:
    return Prefetch("derived_files", queryset=DerivedFile.objects.all(), to_attr="prefetched_derived")


def derived_of(document, kind: str) -> DerivedFile | None:
    """Return the document's derived file of ``kind`` (or None), honouring
    a ``prefetched_derived`` cache when present."""
    cached = getattr(document, "prefetched_derived", None)
    rows = cached if cached is not None else document.derived_files.all()
    for d in rows:
        if d.kind == kind:
            return d
    return None


def derived_visual(document):
    """Poster (PDF) or cover (EPUB) row in one pass over the prefetched rows."""
    cached = getattr(document, "prefetched_derived", None)
    rows = cached if cached is not None else list(document.derived_files.all())
    poster = cover = None
    for d in rows:
        if d.kind == "poster":
            poster = d
        elif d.kind == "cover":
            cover = d
    return poster or cover


def derived_url(document, kind: str) -> str:
    d = derived_of(document, kind)
    return d.url if d else ""


def ocr_status(document) -> str:
    """Reader-facing OCR state for a PDF document:
    ``""`` (text PDF / not applicable) · ``done`` (OCR copy exists) ·
    ``queued`` / ``running`` / ``failed`` (latest ConversionJob) ·
    ``scanned`` (image-only, no OCR yet)."""
    from apps.editor.models import ConversionJob, DocumentExtract

    if derived_of(document, "ocr_pdf"):
        return "done"
    try:
        extract = document.extract
    except DocumentExtract.DoesNotExist:
        return ""
    if not extract.is_scanned:
        return ""
    job = ConversionJob.objects.filter(document=document, kind=ConversionJob.KIND_OCR).order_by("-created_at").first()
    if job:
        if job.status == ConversionJob.STATUS_RUNNING:
            return "running"
        if job.status == ConversionJob.STATUS_FAILED:
            return "failed"
        if job.status == ConversionJob.STATUS_DONE:
            return "done"
        return "queued"
    return "scanned"

