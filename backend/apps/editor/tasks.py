"""Celery task: convert an uploaded PPT/PPTX into ordered slide images.

Pipeline (see plan F3): LibreOffice ``soffice --headless --convert-to pdf``
turns the presentation into a PDF (layout-faithful, page-ordered), then poppler
``pdftoppm -png`` rasterises each page. Each page becomes a :class:`SlideImage`
row the blog reader renders with a thumbnail rail.

Requires ``libreoffice`` (soffice) + ``poppler-utils`` (pdftoppm) on PATH. When
either binary is missing the task logs a clear hint and leaves slides empty —
the reader keeps showing a "转换中" placeholder rather than crashing.
"""

from __future__ import annotations

import logging
import subprocess
import tempfile
from pathlib import Path

from celery import shared_task
from django.core.files.base import ContentFile
from django.db import transaction

log = logging.getLogger(__name__)

# LibreOffice cold-start + render can be slow for large decks.
_SOFFICE_TIMEOUT = 180
_PDFTOPPM_TIMEOUT = 180
_RASTER_DPI = 150


def _run(cmd: list[str], *, timeout: int, cwd: str | None = None) -> None:
    """Run a subprocess, raising on non-zero exit with captured output."""
    # LibreOffice needs a writable profile dir; point HOME at the temp workspace
    # so it never touches the service user's real home (read-only in Docker).
    env = {"HOME": cwd or tempfile.gettempdir(), "PATH": _path_env()}
    proc = subprocess.run(
        cmd,
        cwd=cwd,
        env=env,
        timeout=timeout,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    if proc.returncode != 0:
        out = (proc.stdout or b"").decode("utf-8", "replace")[-1000:]
        raise RuntimeError(f"{cmd[0]} exited {proc.returncode}: {out}")


def _path_env() -> str:
    import os

    return os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin")


def _convert(pptx_path: Path, workdir: Path) -> list[Path]:
    """Convert a pptx file to a sorted list of per-page PNG paths."""
    _run(
        [
            "soffice",
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            str(workdir),
            str(pptx_path),
        ],
        timeout=_SOFFICE_TIMEOUT,
        cwd=str(workdir),
    )
    pdfs = list(workdir.glob("*.pdf"))
    if not pdfs:
        raise RuntimeError("LibreOffice produced no PDF")
    pdf_path = pdfs[0]

    prefix = workdir / "slide"
    _run(
        ["pdftoppm", "-png", "-r", str(_RASTER_DPI), str(pdf_path), str(prefix)],
        timeout=_PDFTOPPM_TIMEOUT,
        cwd=str(workdir),
    )
    # pdftoppm names pages slide-1.png, slide-2.png … (zero-padded for big decks).
    pngs = sorted(
        workdir.glob("slide-*.png"),
        key=lambda p: int(p.stem.rsplit("-", 1)[-1]),
    )
    if not pngs:
        raise RuntimeError("pdftoppm produced no PNG pages")
    return pngs


@shared_task(name="editor.convert_pptx")
def convert_pptx_to_slides(document_id: int, attachment_id: int) -> int:
    """Render a pptx attachment into ordered SlideImage rows. Returns slide count."""
    from .models import Attachment, SlideImage

    # Idempotency: if slides already exist for this doc, a prior run (or retry)
    # already did the work — don't duplicate.
    if SlideImage.objects.filter(document_id=document_id).exists():
        log.info("pptx %s already has slides — skip", document_id)
        return 0

    try:
        att = Attachment.objects.get(pk=attachment_id, document_id=document_id)
    except Attachment.DoesNotExist:
        log.warning("pptx convert: attachment %s not found", attachment_id)
        return 0

    try:
        with tempfile.TemporaryDirectory() as tmp:
            workdir = Path(tmp)
            src_name = Path(att.original_filename or "deck.pptx").name
            pptx_path = workdir / src_name
            with att.file.open("rb") as fh:
                pptx_path.write_bytes(fh.read())

            pngs = _convert(pptx_path, workdir)

            from PIL import Image

            rows = []
            for idx, png in enumerate(pngs):
                data = png.read_bytes()
                with Image.open(png) as im:
                    w, h = im.size
                slide = SlideImage(
                    document_id=document_id,
                    source=att,
                    index=idx,
                    width=w,
                    height=h,
                )
                slide.image.save(f"slide-{idx}.png", ContentFile(data), save=False)
                rows.append(slide)

            with transaction.atomic():
                # Re-check under nothing fancy; unique_together guards duplicates.
                SlideImage.objects.bulk_create(rows)
            log.info("pptx %s → %d slides", document_id, len(rows))
            return len(rows)
    except FileNotFoundError as exc:
        log.error(
            "pptx convert: missing system binary (%s). Install `libreoffice` + "
            "`poppler-utils` and restart the celery worker.",
            exc,
        )
        return 0
    except Exception:  # noqa: BLE001 — never let a bad deck kill the worker
        log.exception("pptx convert failed for document %s", document_id)
        return 0
