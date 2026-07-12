"""Mirror external markdown image URLs into local Attachment storage."""

from __future__ import annotations

import ipaddress
import logging
import mimetypes
import re
import socket
import uuid
from datetime import datetime
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from django.core.files.base import ContentFile

from apps.editor.models import Attachment
from apps.knowledge.models import Document
from apps.knowledge.serializers import detect_doc_format

logger = logging.getLogger(__name__)

MAX_IMAGE_BYTES = 10 * 1024 * 1024
FETCH_TIMEOUT_SEC = 15
# Parallel downloads per document. Kept modest so we localise a large export
# quickly without tripping the origin CDN's per-IP rate limiting.
_FETCH_CONCURRENCY = 6

MD_IMAGE_RE = re.compile(r'!\[[^\]]*\]\(([^)]+)\)')

IMAGE_EXT_BY_MIME = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
}


def extract_markdown_image_urls(text: str) -> list[str]:
    """Return unique image URLs from markdown ``![alt](url)`` in document order."""
    seen: set[str] = set()
    out: list[str] = []
    for m in MD_IMAGE_RE.finditer(text or ""):
        url = m.group(1).strip()
        if url and url not in seen:
            seen.add(url)
            out.append(url)
    return out


def should_mirror(url: str) -> bool:
    """True for remote http(s) URLs that are not already on local media."""
    u = (url or "").strip()
    if not u.startswith(("http://", "https://")):
        return False
    if u.startswith("/media/") or "/media/" in u.split("?", 1)[0]:
        return False
    return True


def _is_safe_host(host: str) -> bool:
    """Block SSRF to private / loopback addresses."""
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        addr = info[4][0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            return False
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return False
    return True


def fetch_image(url: str) -> tuple[bytes, str, str] | None:
    """Download image bytes. Returns (data, mime_type, ext) or None on failure."""
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if not host or not _is_safe_host(host):
        logger.warning("image_mirror: blocked or unresolvable host for %s", url)
        return None
    try:
        req = Request(
            url,
            headers={
                "User-Agent": "JianZhai-ImageMirror/1.0",
                "Accept": "image/*,*/*;q=0.8",
            },
        )
        with urlopen(req, timeout=FETCH_TIMEOUT_SEC) as resp:
            data = resp.read(MAX_IMAGE_BYTES + 1)
            if len(data) > MAX_IMAGE_BYTES:
                logger.warning("image_mirror: image too large %s", url)
                return None
            raw_ct = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
    except (URLError, OSError, TimeoutError) as exc:
        logger.warning("image_mirror: fetch failed %s — %s", url, exc)
        return None

    mime = raw_ct if raw_ct.startswith("image/") else ""
    if not mime:
        guessed, _ = mimetypes.guess_type(url)
        mime = guessed or "image/png"
    ext = IMAGE_EXT_BY_MIME.get(mime) or Path(urlparse(url).path).suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}:
        ext = ".png"
    return data, mime, ext


def _upload_path(ext: str) -> str:
    now = datetime.now()
    return f"uploads/{now:%Y}/{now:%m}/{uuid.uuid4().hex}{ext}"


def _replace_url_in_fields(doc: Document, old_url: str, new_url: str) -> bool:
    changed = False
    if old_url in (doc.raw_content or ""):
        doc.raw_content = doc.raw_content.replace(old_url, new_url)
        changed = True
    if old_url in (doc.published_content or ""):
        doc.published_content = doc.published_content.replace(old_url, new_url)
        changed = True
    return changed


def mirror_images_for_document(
    doc: Document,
    *,
    uploaded_by=None,
) -> dict[str, int]:
    """Download remote markdown images and rewrite document URLs to /media/…

    Returns counts: ``mirrored``, ``failed``, ``skipped``.
    """
    if detect_doc_format(doc) != "markdown":
        return {"mirrored": 0, "failed": 0, "skipped": 0, "content_changed": 0}

    urls = extract_markdown_image_urls(doc.raw_content or "")
    urls += [u for u in extract_markdown_image_urls(doc.published_content or "") if u not in urls]

    mirrored = failed = skipped = 0
    url_map: dict[str, str] = {}

    to_fetch = [u for u in urls if should_mirror(u)]
    skipped = len(urls) - len(to_fetch)

    # Download in parallel. Remote CDNs (notably Yuque's cdn.nlark.com) throttle
    # per-IP, so a sequential fetch of a 40-image export can take minutes —
    # which is why this now runs in a Celery task off the upload request. A
    # small pool keeps total wall-clock down without hammering the origin.
    fetched_map: dict[str, tuple[bytes, str, str]] = {}
    if to_fetch:
        from concurrent.futures import ThreadPoolExecutor

        with ThreadPoolExecutor(max_workers=_FETCH_CONCURRENCY) as pool:
            for url, fetched in zip(to_fetch, pool.map(fetch_image, to_fetch)):
                if fetched is not None:
                    fetched_map[url] = fetched

    for url in to_fetch:
        fetched = fetched_map.get(url)
        if fetched is None:
            failed += 1
            continue
        if url in url_map:
            continue

        data, mime, ext = fetched
        rel_path = _upload_path(ext)
        att = Attachment(
            document=doc,
            uploaded_by=uploaded_by,
            original_filename=Path(urlparse(url).path).name or f"mirror{ext}",
            kind=Attachment.KIND_IMAGE,
            mime_type=mime,
            size=len(data),
        )
        att.file.save(rel_path, ContentFile(data), save=False)
        att.save()
        url_map[url] = att.file.url
        mirrored += 1

    content_changed = 0
    for old_url, new_url in url_map.items():
        if _replace_url_in_fields(doc, old_url, new_url):
            content_changed = 1

    if content_changed:
        doc.save(update_fields=["raw_content", "published_content", "updated_at"])

    return {
        "mirrored": mirrored,
        "failed": failed,
        "skipped": skipped,
        "content_changed": content_changed,
    }
