"""Shared helpers for HTML document bodies (blog reader, backfill, publish)."""
from __future__ import annotations

from pathlib import Path

from apps.editor.models import Attachment
from apps.knowledge.models import Document


def looks_like_html(text: str) -> bool:
    """Heuristic: does this text look like a full HTML page?"""
    head = (text or "").lstrip()[:4096].lower()
    return head.startswith("<!doctype html") or "<html" in head[:800]


def decode_attachment_bytes(blob: bytes) -> str:
    for enc in ("utf-8", "utf-8-sig", "gbk", "gb18030"):
        try:
            return blob.decode(enc)
        except UnicodeDecodeError:
            continue
    return blob.decode("utf-8", errors="replace")


def decode_attachment(att: Attachment) -> str | None:
    """Read an attachment file and decode to text. Returns ``None`` on I/O error."""
    if not att.file:
        return None
    try:
        with att.file.open("rb") as fh:
            blob = fh.read()
    except (OSError, ValueError):
        return None
    return decode_attachment_bytes(blob)


def _primary_attachment(doc: Document) -> Attachment | None:
    if not doc.pk:
        return None
    cached = getattr(doc, "ordered_attachments", None)
    if cached is not None:
        return cached[0] if cached else None
    return doc.attachments.order_by("created_at").first()


def _is_html_attachment(att: Attachment) -> bool:
    name = (att.original_filename or "").lower()
    ext = Path(name).suffix
    mime = att.mime_type or ""
    return ext in {".html", ".htm"} or mime in {"text/html", "application/xhtml+xml"}


def resolve_html_body(doc: Document) -> str:
    """Best-effort HTML source for blog rendering or publish.

    Priority: non-empty ``published_content`` → ``raw_content`` → primary
    ``.html`` attachment bytes (decoded).
    """
    if (doc.published_content or "").strip():
        return doc.published_content
    if (doc.raw_content or "").strip():
        return doc.raw_content
    att = _primary_attachment(doc)
    if att and _is_html_attachment(att):
        return decode_attachment(att) or ""
    return ""


def resolve_published_html_body(doc: Document) -> str:
    """HTML source for the PUBLIC blog reader — never falls back to raw_content.

    ``raw_content`` is the private working copy; an author who edits it after
    publishing (or who clears the published snapshot) must not have the draft
    leak through public endpoints. Legacy docs published before publish()
    started snapshotting are still served via the immutable original ``.html``
    attachment, which is what was on screen when they hit publish.
    """
    if (doc.published_content or "").strip():
        return doc.published_content
    att = _primary_attachment(doc)
    if att and _is_html_attachment(att):
        return decode_attachment(att) or ""
    return ""
