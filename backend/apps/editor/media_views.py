"""Development media server with HTTP Range support.

Django's ``django.views.static.serve`` (what ``static()`` mounts) ignores the
``Range`` header and always answers 200 with the whole file, which silently
defeats pdf.js's chunked loading in dev — the reader would download a 1.4 GB
scanned book before painting page 1. Production serves ``/media`` through
Caddy's ``file_server`` (native 206); this view gives dev the same shape so
the streaming path is exercised locally.

Only mounted when ``settings.DEBUG`` (see ``jianzhai/urls.py``). It also
routes every request through :func:`media_access_allowed`, the same decision
Caddy's ``forward_auth`` consults in production.
"""

from __future__ import annotations

import mimetypes
import re
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse, StreamingHttpResponse

from .media_auth import media_access_status

_RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")
_CHUNK = 1024 * 1024


def _iter_range(path: Path, start: int, length: int):
    with path.open("rb") as fh:
        fh.seek(start)
        remaining = length
        while remaining > 0:
            chunk = fh.read(min(_CHUNK, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def serve_media(request, path: str):
    root = Path(settings.MEDIA_ROOT).resolve()
    full = (root / path).resolve()
    if not full.is_relative_to(root) or not full.is_file():
        raise Http404
    rel = full.relative_to(root).as_posix()
    decision = media_access_status(request.user, rel)
    if decision == 404:
        raise Http404
    if decision != 200:
        return HttpResponse("媒体访问被拒绝" if decision == 403 else "需要登录", status=decision)

    size = full.stat().st_size
    ctype = mimetypes.guess_type(str(full))[0] or "application/octet-stream"
    common = {"Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600"}

    range_header = request.headers.get("Range", "")
    m = _RANGE_RE.match(range_header.strip()) if range_header else None
    if m and request.method == "GET":
        start_s, end_s = m.groups()
        if start_s == "" and end_s == "":
            m = None
        else:
            if start_s == "":
                # suffix range: last N bytes
                length = min(int(end_s), size)
                start, end = size - length, size - 1
            else:
                start = int(start_s)
                end = min(int(end_s), size - 1) if end_s else size - 1
            if start >= size or start > end:
                resp = HttpResponse(status=416)
                resp["Content-Range"] = f"bytes */{size}"
                return resp
            length = end - start + 1
            resp = StreamingHttpResponse(_iter_range(full, start, length), status=206, content_type=ctype)
            resp["Content-Range"] = f"bytes {start}-{end}/{size}"
            resp["Content-Length"] = str(length)
            for k, v in common.items():
                resp[k] = v
            return resp

    resp = FileResponse(full.open("rb"), content_type=ctype)
    resp["Content-Length"] = str(size)
    for k, v in common.items():
        resp[k] = v
    if request.method == "HEAD":
        resp.streaming_content = iter(())  # type: ignore[assignment]
    return resp

