"""Access decision for media bytes (``/media/<relpath>``).

Until 2026-09-08 every file under ``/media`` was served without any check —
by Caddy's ``file_server`` in production and Django's ``static()`` in dev — so
the audience / ReadGrant gates that protect the *API* never applied to the
attachment bytes themselves: anyone holding a uuid URL could read the PDF.

This module is the single decision point, consulted by both stacks:

- production: Caddy ``forward_auth`` → ``GET /api/v1/media-auth/`` (view
  below) before ``file_server`` answers;
- development: ``media_views.serve_media`` calls it inline.

Rules (mirrors ``apps.reading.views._readable_doc``):
- staff (authors share one content pool) → allow everything;
- a file that belongs to a document → the document must be visible to the
  requester through ``visible_documents`` (public, published, KB public, not
  deleted, audience + ReadGrant);
- a document-less attachment (editor image uploads before the doc exists,
  orphans) → any authenticated user;
- ``avatars/`` → everyone;
- anonymous requests only pass when ``SITE_REQUIRE_LOGIN`` is off;
- unknown paths → 404.

Decisions are cached in Redis for a minute per (user, path): a visibility
change takes at most 60 s to reach the file layer, which is acceptable for
the read side and keeps a 90-thumbnail rail from costing 90 DB round trips.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.core.cache import cache

log = logging.getLogger(__name__)

STATUS_OK = 200
STATUS_LOGIN = 401
STATUS_FORBIDDEN = 403
STATUS_NOT_FOUND = 404

CACHE_TTL_S = 60


def _document_id_for(relpath: str) -> tuple[bool, int | None]:
    """Resolve a media path to ``(known, document_id)``.

    ``known`` is False for paths no row names (404). ``document_id`` is None for
    known but document-less files (orphan/editor uploads)."""
    from apps.editor.models import Attachment, DerivedFile, SlideImage

    if relpath.startswith("uploads/"):
        row = Attachment.objects.filter(file=relpath).values_list("document_id", flat=True).first()
        if row is None and not Attachment.objects.filter(file=relpath).exists():
            return False, None
        return True, row
    if relpath.startswith("slides/"):
        for field in ("image", "thumbnail"):
            row = SlideImage.objects.filter(**{field: relpath}).values_list("document_id", flat=True).first()
            if row is not None:
                return True, row
        return False, None
    if relpath.startswith("derived/"):
        row = DerivedFile.objects.filter(file=relpath).values_list("document_id", flat=True).first()
        return (True, row) if row is not None else (False, None)
    return False, None


def _document_visible(user, document_id: int) -> bool:
    from apps.accounts.scoping import scope_queryset
    from apps.knowledge.audience import visible_documents
    from apps.knowledge.models import Document

    if getattr(user, "is_staff", False):
        return scope_queryset(Document.all_objects.all(), user).filter(pk=document_id).exists()
    qs = Document.objects.filter(
        visibility="public",
        status="published",
        knowledge_base__visibility="public",
        is_deleted=False,
    )
    return visible_documents(qs, user).filter(pk=document_id).exists()


def _decide(user, relpath: str) -> int:
    require_login = bool(getattr(settings, "SITE_REQUIRE_LOGIN", True))
    authed = bool(getattr(user, "is_authenticated", False))
    if relpath.startswith("avatars/"):
        return STATUS_OK
    if not authed and require_login:
        return STATUS_LOGIN
    if getattr(user, "is_staff", False):
        return STATUS_OK
    known, doc_id = _document_id_for(relpath)
    if not known:
        return STATUS_NOT_FOUND
    if doc_id is None:
        return STATUS_OK if authed else STATUS_FORBIDDEN
    return STATUS_OK if _document_visible(user, doc_id) else STATUS_FORBIDDEN


def media_access_status(user, relpath: str) -> int:
    """HTTP status the media layer should answer with for this user/path."""
    relpath = (relpath or "").lstrip("/")
    if not relpath or ".." in relpath.split("/"):
        return STATUS_NOT_FOUND
    uid = getattr(user, "pk", None) or 0
    key = f"media-auth:v1:{uid}:{relpath}"
    try:
        cached = cache.get(key)
    except Exception:  # noqa: BLE001 — cache outage must not block reading
        cached = None
    if cached is not None:
        return int(cached)
    status = _decide(user, relpath)
    try:
        cache.set(key, status, CACHE_TTL_S)
    except Exception:  # noqa: BLE001
        pass
    return status


def media_access_allowed(user, relpath: str) -> bool:
    return media_access_status(user, relpath) == STATUS_OK
