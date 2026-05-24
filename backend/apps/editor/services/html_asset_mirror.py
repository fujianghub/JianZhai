"""Mirror external resource URLs (img/link/script) referenced by HTML documents.

When a user imports a saved web page, references like
``<img src="https://old-cdn.com/figure.png">`` keep loading from the original
host — fragile if that host disappears, and slower in offline environments.
This service walks the HTML, downloads each remote resource into the local
``/media/`` store as an ``Attachment`` row, and rewrites the URLs to point at
the local copy. It mirrors the design of
``apps.editor.services.image_mirror`` (which already handles Markdown image
links) so it inherits the same SSRF guards, size cap and de-duplication
behaviour.

Only absolute ``http(s)`` URLs are handled. Relative paths
(``./assets/style.css``) need a meaningful base URL that the current
attachment model doesn't expose (each upload lands in a UUID directory) — they
are reported as ``skipped`` so callers can surface a hint to the author.
"""
from __future__ import annotations

import logging
import mimetypes
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from django.core.files.base import ContentFile

from apps.editor.models import Attachment
from apps.knowledge.models import Document
from apps.knowledge.serializers import detect_doc_format

from . import image_mirror as _img

logger = logging.getLogger(__name__)

# CSS/JS payloads are usually a few KB but we cap at 1 MB to stay defensive.
MAX_RESOURCE_BYTES = 1 * 1024 * 1024


class _ResourceURLExtractor(HTMLParser):
    """Collect ``(url, kind)`` tuples from common asset-loading tags.

    ``kind`` is one of ``image``, ``stylesheet`` or ``script``; preserved so
    callers can pick the right Attachment kind / mime defaults.
    """

    def __init__(self) -> None:
        super().__init__()
        self.urls: list[tuple[str, str]] = []
        self._seen: set[str] = set()

    def _add(self, url: str, kind: str) -> None:
        url = (url or "").strip()
        if not url or url in self._seen:
            return
        self._seen.add(url)
        self.urls.append((url, kind))

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        a = {k.lower(): v for k, v in attrs if v is not None}
        if tag == "img":
            self._add(a.get("src", ""), "image")
        elif tag == "link":
            rel = (a.get("rel") or "").lower()
            if "stylesheet" in rel.split():
                self._add(a.get("href", ""), "stylesheet")
        elif tag == "script":
            self._add(a.get("src", ""), "script")


def extract_html_resource_urls(html: str) -> list[tuple[str, str]]:
    """Parse ``html`` and return ``(url, kind)`` tuples in document order."""
    p = _ResourceURLExtractor()
    try:
        p.feed(html or "")
    except Exception:  # noqa: BLE001 — HTMLParser raises a few subclasses on malformed input
        logger.debug("html_asset_mirror: HTML parse aborted, returning partial result")
    return p.urls


def _ext_for(url: str, kind: str, mime: str) -> str:
    if kind == "image":
        return (
            _img.IMAGE_EXT_BY_MIME.get(mime)
            or Path(urlparse(url).path).suffix.lower()
            or ".png"
        )
    if kind == "stylesheet":
        return ".css"
    if kind == "script":
        return ".js"
    return Path(urlparse(url).path).suffix.lower() or ".bin"


def _attachment_kind_for(kind: str) -> str:
    if kind == "image":
        return Attachment.KIND_IMAGE
    # CSS / JS land in the document bucket so the media library lists them.
    return Attachment.KIND_DOCUMENT


def fetch_text_resource(url: str, kind: str) -> tuple[bytes, str, str] | None:
    """Download a CSS/JS resource. Returns (bytes, mime, ext) or ``None``."""
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if not host or not _img._is_safe_host(host):
        logger.warning("html_asset_mirror: blocked or unresolvable host for %s", url)
        return None
    try:
        req = Request(
            url,
            headers={
                "User-Agent": "JianZhai-AssetMirror/1.0",
                "Accept": "text/css,application/javascript,*/*;q=0.5",
            },
        )
        with urlopen(req, timeout=_img.FETCH_TIMEOUT_SEC) as resp:
            data = resp.read(MAX_RESOURCE_BYTES + 1)
            if len(data) > MAX_RESOURCE_BYTES:
                logger.warning("html_asset_mirror: resource too large %s", url)
                return None
            raw_ct = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
    except (URLError, OSError, TimeoutError) as exc:
        logger.warning("html_asset_mirror: fetch failed %s — %s", url, exc)
        return None

    if not raw_ct:
        guessed, _ = mimetypes.guess_type(url)
        raw_ct = guessed or ("text/css" if kind == "stylesheet" else "application/javascript")
    return data, raw_ct, _ext_for(url, kind, raw_ct)


def mirror_html_assets_for_document(
    doc: Document,
    *,
    uploaded_by=None,
) -> dict[str, int]:
    """Mirror remote ``<img>``/``<link>``/``<script>`` URLs inside an HTML doc.

    Returns counters: ``mirrored``, ``failed``, ``skipped``, ``content_changed``.
    No-op (and returns zeros) when ``doc`` isn't an HTML-format document.
    """
    if detect_doc_format(doc) != "html":
        return {"mirrored": 0, "failed": 0, "skipped": 0, "content_changed": 0}

    urls: list[tuple[str, str]] = []
    seen: set[str] = set()
    for source in (doc.raw_content, doc.published_content):
        for url, kind in extract_html_resource_urls(source or ""):
            if url in seen:
                continue
            seen.add(url)
            urls.append((url, kind))

    mirrored = failed = skipped = 0
    url_map: dict[str, str] = {}

    for url, kind in urls:
        if not _img.should_mirror(url):
            # Either local /media/ path or a relative reference we can't resolve.
            skipped += 1
            continue
        if url in url_map:
            continue

        if kind == "image":
            fetched = _img.fetch_image(url)
        else:
            fetched = fetch_text_resource(url, kind)
        if fetched is None:
            failed += 1
            continue

        data, mime, ext = fetched
        rel_path = _img._upload_path(ext)
        att = Attachment(
            document=doc,
            uploaded_by=uploaded_by,
            original_filename=Path(urlparse(url).path).name or f"asset{ext}",
            kind=_attachment_kind_for(kind),
            mime_type=mime,
            size=len(data),
        )
        att.file.save(rel_path, ContentFile(data), save=False)
        att.save()
        url_map[url] = att.file.url
        mirrored += 1

    content_changed = 0
    for old_url, new_url in url_map.items():
        if _img._replace_url_in_fields(doc, old_url, new_url):
            content_changed = 1

    if content_changed:
        doc.save(update_fields=["raw_content", "published_content", "updated_at"])

    return {
        "mirrored": mirrored,
        "failed": failed,
        "skipped": skipped,
        "content_changed": content_changed,
    }
