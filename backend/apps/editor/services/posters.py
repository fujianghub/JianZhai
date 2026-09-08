"""First-page posters for PDFs and cover images for EPUBs (``DerivedFile``
kinds ``poster`` / ``cover``) — what document cards, hover previews and the
book shelf show instead of a bare format pill.

PDF: ``pdftoppm -jpeg -f 1 -l 1 -scale-to-x 480`` (poppler, already in the
image). EPUB: the OPF's ``<meta name="cover">`` / ``properties="cover-image"``
item read straight out of the zip — no new dependency.
"""

from __future__ import annotations

import logging
import re
import subprocess
import zipfile
from pathlib import Path

log = logging.getLogger(__name__)

POSTER_WIDTH = 480
_PDFTOPPM_TIMEOUT = 120


def make_pdf_poster(pdf_path: Path, workdir: Path) -> tuple[Path, int, int] | None:
    """Render page 1 to a JPEG; returns ``(path, width, height)`` or None."""
    prefix = workdir / "poster"
    try:
        subprocess.run(
            [
                "pdftoppm", "-jpeg", "-jpegopt", "quality=80", "-f", "1", "-l", "1",
                "-scale-to-x", str(POSTER_WIDTH), "-scale-to-y", "-1", str(pdf_path), str(prefix),
            ],
            check=True,
            capture_output=True,
            timeout=_PDFTOPPM_TIMEOUT,
        )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        log.warning("poster: pdftoppm failed for %s: %s", pdf_path, exc)
        return None
    outs = sorted(workdir.glob("poster*.jpg"))
    if not outs:
        return None
    try:
        from PIL import Image

        with Image.open(outs[0]) as im:
            w, h = im.size
    except Exception:  # noqa: BLE001
        w = h = 0
    return outs[0], w, h


_OPF_RE = re.compile(r'full-path="([^"]+\.opf)"', re.I)
_ITEM_RE = re.compile(r"<item\b[^>]*>", re.I)


def _attr(tag: str, name: str) -> str | None:
    m = re.search(name + r'\s*=\s*"([^"]*)"', tag, re.I)
    return m.group(1) if m else None


def extract_epub_cover(epub_path: Path, workdir: Path) -> tuple[Path, int, int] | None:
    """Locate the cover image via the OPF manifest and copy it to ``workdir``."""
    try:
        with zipfile.ZipFile(epub_path) as zf:
            names = set(zf.namelist())
            container = zf.read("META-INF/container.xml").decode("utf-8", "replace") if "META-INF/container.xml" in names else ""
            m = _OPF_RE.search(container)
            opf_name = m.group(1) if m else next((n for n in names if n.lower().endswith(".opf")), None)
            if not opf_name or opf_name not in names:
                return None
            opf = zf.read(opf_name).decode("utf-8", "replace")
            base = opf_name.rsplit("/", 1)[0] + "/" if "/" in opf_name else ""
            items = {}
            cover_href = None
            for tag in _ITEM_RE.findall(opf):
                iid, href, props, media = _attr(tag, "id"), _attr(tag, "href"), _attr(tag, "properties") or "", _attr(tag, "media-type") or ""
                if iid and href:
                    items[iid] = (href, media)
                if "cover-image" in props and href:
                    cover_href = href
            if cover_href is None:
                mm = re.search(r'<meta\b[^>]*name\s*=\s*"cover"[^>]*content\s*=\s*"([^"]+)"', opf, re.I) or re.search(
                    r'<meta\b[^>]*content\s*=\s*"([^"]+)"[^>]*name\s*=\s*"cover"', opf, re.I
                )
                if mm and mm.group(1) in items:
                    cover_href = items[mm.group(1)][0]
            if cover_href is None:
                # Last resort: an image item whose id/href says "cover".
                for iid, (href, media) in items.items():
                    if media.startswith("image/") and ("cover" in iid.lower() or "cover" in href.lower()):
                        cover_href = href
                        break
            if cover_href is None:
                return None
            from urllib.parse import unquote

            member = unquote(base + cover_href)
            if member not in names:
                return None
            data = zf.read(member)
    except (zipfile.BadZipFile, KeyError, OSError) as exc:
        log.warning("cover: could not read %s: %s", epub_path, exc)
        return None
    ext = Path(member).suffix.lower() or ".jpg"
    out = workdir / f"cover{ext}"
    out.write_bytes(data)
    try:
        from PIL import Image

        with Image.open(out) as im:
            w, h = im.size
    except Exception:  # noqa: BLE001
        w = h = 0
    return out, w, h


def store_derived_image(document_id: int, att, kind: str, path: Path, width: int, height: int, *, page_count: int = 0) -> None:
    """Upsert ``DerivedFile(kind)`` from a local file (best-effort)."""
    from django.core.files import File

    from apps.editor.models import DerivedFile

    try:
        row, _ = DerivedFile.objects.get_or_create(document_id=document_id, kind=kind, defaults={"source": att})
        if row.file:
            try:
                row.file.delete(save=False)
            except Exception:  # noqa: BLE001
                pass
        row.source = att
        row.width, row.height = width, height
        row.page_count = page_count
        row.size = path.stat().st_size
        with path.open("rb") as fh:
            row.file.save(f"{kind}{path.suffix.lower()}", File(fh), save=False)
        row.save()
    except Exception:  # noqa: BLE001
        log.exception("could not store %s for document %s", kind, document_id)
