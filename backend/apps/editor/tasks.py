"""Celery task: convert an uploaded PPT/PPTX into ordered slide images.

Pipeline (see plan F3): LibreOffice ``soffice --headless --convert-to pdf``
turns the presentation into a PDF (layout-faithful, page-ordered), then poppler
``pdftoppm -jpeg`` rasterises each page. Each page becomes a :class:`SlideImage`
row the blog reader renders with a thumbnail rail.

Requires ``libreoffice`` (soffice) + ``poppler-utils`` (pdftoppm) on PATH. When
either binary is missing the task logs a clear hint and leaves slides empty —
the reader keeps showing a "转换中" placeholder rather than crashing.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from celery import Task, shared_task
from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction

log = logging.getLogger(__name__)

# LibreOffice cold-start + render can be slow for large decks.
_SOFFICE_TIMEOUT = 180
_PDFTOPPM_TIMEOUT = 180
_RASTER_DPI = 150
# Slides are photo-heavy; JPEG cuts a title raster from ~2 MB (PNG) to ~0.27 MB
# with no visible loss, so a 94-slide deck drops from ~24 MB to a few MB.
_JPEG_QUALITY = 82
# Rail thumbnail long-edge in px (displayed at 160px, 2x for retina). ~15-35 KB
# each vs the full raster — the rail was the reader's real weight.
_THUMB_LONG_EDGE = 320
_THUMB_QUALITY = 75


def _run(cmd: list[str], *, timeout: int, cwd: str | None = None) -> str:
    """Run a subprocess, raising on non-zero exit. Returns captured stdout.

    Note: LibreOffice frequently exits 0 while silently refusing to convert a
    file (e.g. "Error: source file could not be loaded" for a corrupt deck), so
    callers must also check the *side effects* — the returned text is what lets
    them surface that hidden message when no output file appears.
    """
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
    out = (proc.stdout or b"").decode("utf-8", "replace")
    if proc.returncode != 0:
        raise RuntimeError(f"{cmd[0]} exited {proc.returncode}: {out[-1000:]}")
    return out


def _path_env() -> str:
    import os

    return os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin")


def render_deck_pdf(pptx_path: Path, workdir: Path) -> Path:
    """LibreOffice-render a pptx into ``workdir`` and return the PDF path.

    Shared by the full slide conversion and the PDF-only backfill for decks
    converted before the intermediate PDF was kept.
    """
    out = _run(
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
        # soffice exits 0 even when it can't load the source (corrupt/invalid
        # deck). Its real complaint ("Error: source file could not be loaded")
        # is only in stdout — include it so the failure reason isn't a mystery.
        raise RuntimeError(f"LibreOffice produced no PDF: {out.strip()[-500:]}")
    return pdfs[0]


def _convert(pptx_path: Path, workdir: Path) -> list[Path]:
    """Convert a pptx file to a sorted list of per-page JPEG paths.

    Leaves the intermediate PDF in ``workdir`` for the caller to keep.
    """
    pdf_path = render_deck_pdf(pptx_path, workdir)

    prefix = workdir / "slide"
    # JPEG (not PNG): slide rasters are photo-heavy, JPEG is ~7x smaller with no
    # visible loss, which is what keeps a large deck light in the reader.
    _run(
        ["pdftoppm", "-jpeg", "-jpegopt", f"quality={_JPEG_QUALITY}",
         "-r", str(_RASTER_DPI), str(pdf_path), str(prefix)],
        timeout=_PDFTOPPM_TIMEOUT,
        cwd=str(workdir),
    )
    # pdftoppm names pages slide-1.jpg, slide-2.jpg … (zero-padded for big decks).
    imgs = sorted(
        workdir.glob("slide-*.jpg"),
        key=lambda p: int(p.stem.rsplit("-", 1)[-1]),
    )
    if not imgs:
        raise RuntimeError("pdftoppm produced no JPEG pages")
    return imgs


def _store_deck_pdf(document_id: int, att, pdf_path: Path, page_count: int) -> None:
    """Persist the LibreOffice PDF as the document's ``DerivedFile(deck_pdf)``.

    Best-effort: the slides are the product, the PDF only adds the text layer,
    so a storage hiccup here is logged and never fails the conversion.
    """
    from django.core.files import File

    from .models import DerivedFile

    try:
        deck, _created = DerivedFile.objects.get_or_create(
            document_id=document_id,
            kind=DerivedFile.KIND_DECK_PDF,
            defaults={"source": att},
        )
        if deck.file:
            try:
                deck.file.delete(save=False)
            except Exception:  # noqa: BLE001
                pass
        deck.source = att
        deck.page_count = page_count
        deck.size = pdf_path.stat().st_size
        with pdf_path.open("rb") as fh:
            deck.file.save("deck.pdf", File(fh), save=False)
        deck.save()
    except Exception:  # noqa: BLE001
        log.exception("pptx convert: failed to store deck PDF for %s", document_id)


def ensure_deck_pdf(document_id: int, att, page_count: int) -> bool:
    """Render + store only the deck PDF for a deck whose slides already exist.

    Returns True when a deck now exists. Used by the idempotency path of the
    conversion task and by ``backfill_pptx_pdf``.
    """
    with tempfile.TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        src_name = Path(att.original_filename or "deck.pptx").name
        pptx_path = workdir / src_name
        with att.file.open("rb") as fh, pptx_path.open("wb") as out:
            shutil.copyfileobj(fh, out, length=1024 * 1024)
        pdf_path = render_deck_pdf(pptx_path, workdir)
        _store_deck_pdf(document_id, att, pdf_path, page_count)
    from .models import DerivedFile

    return DerivedFile.objects.filter(
        document_id=document_id, kind=DerivedFile.KIND_DECK_PDF
    ).exists()


def _set_slide_state(document_id: int, status: str, error: str = "") -> None:
    """Persist the doc's slide-conversion state so the reader can stop guessing.

    Best-effort: a status write must never be the thing that crashes the task.
    """
    from apps.knowledge.models import Document

    try:
        Document.objects.filter(pk=document_id).update(
            slide_status=status, slide_error=error[:200]
        )
    except Exception:  # noqa: BLE001
        log.exception("pptx convert: failed to set slide_status for %s", document_id)


# Maps a raw failure to a short, human-facing reason shown in the reader.
def _failure_reason(exc: Exception) -> str:
    msg = str(exc)
    if isinstance(exc, subprocess.TimeoutExpired):
        return "转换超时（文件过大或幻灯过多），请稍后重试"
    if "could not be loaded" in msg or "produced no PDF" in msg:
        return "文件已损坏或无法解析（可能不是有效的 PPT），请重新导出后上传"
    if "pdftoppm produced no" in msg:
        return "幻灯渲染失败（PDF 光栅化未产出页面）"
    return "PPT 转换失败，请重试或联系管理员"


def extract_pptx_notes(pptx_path) -> list[str]:
    """Per-slide speaker notes in presentation order (via python-pptx).

    Best-effort: any failure (python-pptx missing, unreadable pptx) yields ``[]``
    so notes never block the raster conversion — they are secondary content.
    Index ``i`` is meant to align with the i-th rendered PDF page; a deck with
    hidden slides can drift (LibreOffice may skip them in the PDF while
    python-pptx still lists them), so callers map by index and tolerate a length
    mismatch rather than assuming a 1:1 correspondence.
    """
    try:
        from pptx import Presentation
    except ImportError:
        log.warning("python-pptx not installed — skipping PPT notes extraction")
        return []
    try:
        prs = Presentation(str(pptx_path))
    except Exception:  # noqa: BLE001 — a bad deck must not fail the raster path
        log.exception("pptx notes: could not open %s", pptx_path)
        return []
    notes: list[str] = []
    for slide in prs.slides:
        text = ""
        try:
            if slide.has_notes_slide:
                tf = slide.notes_slide.notes_text_frame
                if tf is not None:
                    text = (tf.text or "").strip()
        except Exception:  # noqa: BLE001 — skip a single unreadable notes slide
            text = ""
        notes.append(text)
    return notes


def _queue_text_extract(document_id: int) -> None:
    """Best-effort follow-up: index the deck PDF text (never fails the caller)."""
    try:
        extract_document_text.delay(document_id)
    except Exception:  # noqa: BLE001 — broker down → the backfill command catches up
        log.warning("could not queue text extract for %s", document_id)


# Transient failures worth a retry: LibreOffice cold-start timeouts and OS
# hiccups (but not FileNotFoundError — a missing binary never heals).
_RETRYABLE = (subprocess.TimeoutExpired, OSError)
_MAX_RETRIES = 2
_RETRY_BACKOFF_S = 30


class ConvertTask(Task):
    """Failure bookkeeping for the pptx conversion.

    ``on_failure`` fires when the task finally gives up (retries exhausted or a
    non-retryable exception escaped) — including SoftTimeLimitExceeded — so the
    document never stays ``pending`` forever. A *hard* time limit SIGKILLs the
    process and skips this; ``sweep_stuck_conversions`` covers that case.
    """

    def on_failure(self, exc, task_id, args, kwargs, einfo):  # noqa: D401
        document_id = args[0] if args else kwargs.get("document_id")
        if document_id is None:
            return
        _set_slide_state(document_id, "failed", _failure_reason(exc))
        _finish_open_jobs(document_id, "failed", _failure_reason(exc))


def _finish_open_jobs(document_id: int, status: str, error: str = "", kind: str | None = None) -> None:
    from .models import ConversionJob

    try:
        for job in ConversionJob.objects.filter(
            document_id=document_id, kind=kind or ConversionJob.KIND_PPTX_SLIDES, status=ConversionJob.STATUS_RUNNING
        ):
            job.finish(status, error=error)
    except Exception:  # noqa: BLE001
        log.exception("conversion job bookkeeping failed for %s", document_id)


def _start_job(document_id: int, kind: str, *, task_id: str = "", attempt: int = 0, src_bytes: int = 0):
    from .models import ConversionJob

    try:
        return ConversionJob.objects.create(
            document_id=document_id, kind=kind, task_id=task_id or "", attempt=attempt, src_bytes=src_bytes
        )
    except Exception:  # noqa: BLE001
        log.exception("could not open conversion job for %s", document_id)
        return None


def _should_retry(task, exc: BaseException) -> bool:
    """Retry transient errors when running under a worker (never on a direct
    call — tests and management commands want the synchronous result)."""
    if isinstance(exc, FileNotFoundError) or not isinstance(exc, _RETRYABLE):
        return False
    req = getattr(task, "request", None)
    if req is None or getattr(req, "called_directly", True):
        return False
    return (getattr(req, "retries", 0) or 0) < _MAX_RETRIES


@shared_task(
    name="editor.convert_pptx",
    bind=True,
    base=ConvertTask,
    acks_late=True,
    reject_on_worker_lost=True,
    # Explicitly below the global 540/600 so the soft limit fires first and the
    # failure is recorded (a hard kill would leave the doc pending).
    soft_time_limit=520,
    time_limit=560,
)
def convert_pptx_to_slides(self, document_id: int, attachment_id: int) -> int:
    """Render a pptx attachment into ordered SlideImage rows. Returns slide count."""
    from .models import Attachment, ConversionJob, SlideImage

    try:
        att = Attachment.objects.get(pk=attachment_id, document_id=document_id)
    except Attachment.DoesNotExist:
        log.warning("pptx convert: attachment %s not found", attachment_id)
        _set_slide_state(document_id, "failed", "附件丢失，无法转换")
        return 0

    req = getattr(self, "request", None)
    job = _start_job(
        document_id,
        ConversionJob.KIND_PPTX_SLIDES,
        task_id=str(getattr(req, "id", "") or ""),
        attempt=int(getattr(req, "retries", 0) or 0),
        src_bytes=int(att.size or 0),
    )
    started = time.monotonic()

    # Idempotency: if slides already exist for this doc, a prior run (or retry)
    # already did the work — don't duplicate. A deck converted before the
    # intermediate PDF was kept only gets that PDF rendered (self-heal).
    existing = SlideImage.objects.filter(document_id=document_id).count()
    if existing:
        from .models import DerivedFile

        if not DerivedFile.objects.filter(
            document_id=document_id, kind=DerivedFile.KIND_DECK_PDF
        ).exists():
            try:
                ensure_deck_pdf(document_id, att, existing)
            except Exception:  # noqa: BLE001
                log.exception("pptx %s: deck PDF backfill failed", document_id)
        log.info("pptx %s already has slides — skip", document_id)
        _set_slide_state(document_id, "done")
        if job:
            job.finish("done", pages=existing)
        return 0

    try:
        with tempfile.TemporaryDirectory() as tmp:
            workdir = Path(tmp)
            src_name = Path(att.original_filename or "deck.pptx").name
            pptx_path = workdir / src_name
            with att.file.open("rb") as fh, pptx_path.open("wb") as out:
                shutil.copyfileobj(fh, out, length=1024 * 1024)

            pages = _convert(pptx_path, workdir)

            # Speaker notes align to rendered pages by index (best-effort — see
            # extract_pptx_notes; a hidden-slide drift just leaves some pages blank).
            notes = extract_pptx_notes(pptx_path)

            import io

            from PIL import Image

            rows = []
            # Files are written before the rows exist; if the bulk insert (or
            # anything after a save) fails, drop what we wrote so a failed
            # conversion leaves no orphans on disk.
            saved_files: list = []
            for idx, page in enumerate(pages):
                data = page.read_bytes()
                with Image.open(page) as im:
                    w, h = im.size
                    # Downscale the already-rendered raster into a light rail
                    # thumbnail (cheaper than a second pdftoppm pass over the PDF).
                    thumb = im.convert("RGB")
                    thumb.thumbnail(
                        (_THUMB_LONG_EDGE, _THUMB_LONG_EDGE), Image.LANCZOS
                    )
                    tbuf = io.BytesIO()
                    thumb.save(tbuf, format="JPEG", quality=_THUMB_QUALITY)
                slide = SlideImage(
                    document_id=document_id,
                    source=att,
                    index=idx,
                    width=w,
                    height=h,
                    notes=notes[idx] if idx < len(notes) else "",
                )
                slide.image.save(f"slide-{idx}.jpg", ContentFile(data), save=False)
                saved_files.append(slide.image)
                slide.thumbnail.save(
                    f"thumb-{idx}.jpg", ContentFile(tbuf.getvalue()), save=False
                )
                saved_files.append(slide.thumbnail)
                rows.append(slide)

            try:
                with transaction.atomic():
                    # Re-check under nothing fancy; unique_together guards duplicates.
                    SlideImage.objects.bulk_create(rows)
            except Exception:
                for f in saved_files:
                    try:
                        f.delete(save=False)
                    except Exception:  # noqa: BLE001
                        pass
                raise
            # Keep the PDF the rasters came from — it carries the selectable
            # text + links the reader lays over each slide.
            pdfs = list(workdir.glob("*.pdf"))
            if pdfs:
                _store_deck_pdf(document_id, att, pdfs[0], len(rows))
            out_bytes = sum(int(r.image.size or 0) for r in rows if r.image) + (
                pdfs[0].stat().st_size if pdfs else 0
            )
            elapsed_ms = int((time.monotonic() - started) * 1000)
            log.info(
                "pptx %s → %d slides in %d ms (src %d B, out %d B)",
                document_id, len(rows), elapsed_ms, att.size or 0, out_bytes,
            )
            _set_slide_state(document_id, "done")
            if job:
                job.finish("done", pages=len(rows), out_bytes=out_bytes)
            _queue_text_extract(document_id)
            return len(rows)
    except FileNotFoundError as exc:
        log.error(
            "pptx convert: missing system binary (%s). Install `libreoffice` + "
            "`poppler-utils` and restart the celery worker.",
            exc,
        )
        reason = "服务器缺少 PPT 转换组件（LibreOffice/poppler），请联系管理员"
        _set_slide_state(document_id, "failed", reason)
        if job:
            job.finish("failed", error=reason)
        return 0
    except Exception as exc:  # noqa: BLE001 — never let a bad deck kill the worker
        if _should_retry(self, exc):
            log.warning("pptx convert %s: transient %r — retrying", document_id, exc)
            if job:
                job.finish("failed", error=f"retrying: {_failure_reason(exc)}")
            raise self.retry(exc=exc, countdown=_RETRY_BACKOFF_S * (int(self.request.retries) + 1))
        log.exception("pptx convert failed for document %s", document_id)
        _set_slide_state(document_id, "failed", _failure_reason(exc))
        if job:
            job.finish("failed", error=_failure_reason(exc))
        return 0


@shared_task
def mirror_document_images(document_id: int, uploaded_by_id: int | None = None) -> dict:
    """Download a markdown document's remote images into local /media storage.

    Runs off the upload request: a Yuque export can carry 40+ images on a CDN
    (cdn.nlark.com) that both anti-hotlinks (browser loads 403 on a foreign
    Referer) and throttles per-IP, so mirroring them synchronously blew past the
    request timeout and left the body full of broken remote URLs. As a task it
    can take its time; the reader shows the remote images (via
    ``referrerpolicy=no-referrer``) until this swaps them for local copies.
    """
    from apps.knowledge.models import Document
    from apps.editor.services.image_mirror import mirror_images_for_document

    doc = Document.objects.filter(pk=document_id).first()
    if doc is None:
        log.info("mirror_document_images: document %s gone, skipping", document_id)
        return {"ok": False, "reason": "document missing"}

    uploaded_by = None
    if uploaded_by_id is not None:
        from django.contrib.auth import get_user_model

        uploaded_by = get_user_model().objects.filter(pk=uploaded_by_id).first()

    result = mirror_images_for_document(doc, uploaded_by=uploaded_by)
    log.info("mirror_document_images %s → %s", document_id, result)
    return result


@shared_task(name="editor.cleanup_media_report")
def cleanup_media_report() -> dict:
    """Weekly orphan-media report (report-only; deletion is a manual
    ``manage.py cleanup_media --apply``)."""
    from .media_maintenance import cleanup_media

    stats = cleanup_media(apply=False)
    log.info(
        "cleanup_media report: scanned=%s orphans=%s (%.1f MB) examples=%s",
        stats["scanned"], stats["orphans"], stats["orphan_bytes"] / 1e6, stats["examples"][:5],
    )
    return {k: v for k, v in stats.items() if k != "examples"}


# A conversion that is still ``pending`` this long after its last update has
# no live task behind it (a hard time-limit kill, a lost worker, a dropped
# broker message). Comfortably above the task's 560 s hard limit + retries.
STUCK_PENDING_MINUTES = 20


@shared_task(name="editor.sweep_stuck_conversions")
def sweep_stuck_conversions(minutes: int = STUCK_PENDING_MINUTES) -> int:
    """Mark decks stuck in ``pending`` (no running job, no recent update) as
    failed so the reader shows a retry instead of spinning forever."""
    from datetime import timedelta

    from django.utils import timezone

    from apps.knowledge.models import Document

    from .models import ConversionJob

    cutoff = timezone.now() - timedelta(minutes=minutes)
    stuck = Document.all_objects.filter(slide_status=Document.SLIDE_PENDING, updated_at__lt=cutoff)
    n = 0
    for doc in stuck.iterator():
        running = ConversionJob.objects.filter(
            document=doc, kind=ConversionJob.KIND_PPTX_SLIDES, status=ConversionJob.STATUS_RUNNING,
            created_at__gte=cutoff,
        ).exists()
        if running:
            continue
        _set_slide_state(doc.id, "failed", "转换任务丢失（worker 中断），请重新转换")
        _finish_open_jobs(doc.id, "failed", "swept: stuck pending")
        n += 1
    if n:
        log.warning("sweep_stuck_conversions: marked %d deck(s) failed", n)
    return n


@shared_task(name="editor.extract_document_text", soft_time_limit=520, time_limit=560)
def extract_document_text(document_id: int) -> dict:
    """Populate ``DocumentExtract`` for a PDF / PPT / EPUB document and
    re-index it. Idempotent; safe to run again after OCR or a re-convert."""
    from apps.knowledge.serializers import _primary_attachment, detect_doc_format
    from apps.knowledge.models import Document

    from .models import ConversionJob, DerivedFile, DocumentExtract
    from .services.text_extract import ExtractResult, extract_attachment, extract_pdf

    try:
        doc = Document.all_objects.select_related("knowledge_base").get(pk=document_id)
    except Document.DoesNotExist:
        return {"source": "none", "chars": 0, "is_scanned": False, "encrypted": False}
    job = _start_job(document_id, ConversionJob.KIND_PDF_EXTRACT)
    fmt = detect_doc_format(doc)
    att = _primary_attachment(doc)
    res = ExtractResult()
    try:
        if att is not None and fmt in {"pdf", "pptx", "epub"}:
            from .services.posters import extract_epub_cover, make_pdf_poster, store_derived_image
            from .services.text_extract import extract_epub

            ocr = DerivedFile.objects.filter(document_id=document_id, kind=DerivedFile.KIND_OCR_PDF).first()
            deck = DerivedFile.objects.filter(document_id=document_id, kind=DerivedFile.KIND_DECK_PDF).first()
            with tempfile.TemporaryDirectory() as tmp:
                work = Path(tmp)

                def _copy(field_file, name: str) -> Path:
                    dest = work / name
                    with field_file.open("rb") as fh, dest.open("wb") as out:
                        shutil.copyfileobj(fh, out, length=1024 * 1024)
                    return dest

                if fmt == "pdf":
                    # OCR copy wins over the original when present (scanned books).
                    src = _copy(ocr.file, "ocr.pdf") if ocr and ocr.file else _copy(att.file, "src.pdf")
                    res = extract_pdf(src, source="ocr_pdf" if ocr and ocr.file else "pdf")
                    if not res.encrypted:
                        poster = make_pdf_poster(src, work)
                        if poster:
                            store_derived_image(document_id, att, DerivedFile.KIND_POSTER, poster[0], poster[1], poster[2], page_count=res.page_count)
                elif fmt == "pptx":
                    if deck and deck.file:
                        res = extract_attachment(att, deck_pdf_path=_copy(deck.file, "deck.pdf"))
                elif fmt == "epub":
                    src = _copy(att.file, "src.epub")
                    res = extract_epub(src)
                    cover = extract_epub_cover(src, work)
                    if cover:
                        store_derived_image(document_id, att, DerivedFile.KIND_COVER, cover[0], cover[1], cover[2])
        DocumentExtract.objects.update_or_create(
            document_id=document_id,
            defaults={
                "source": res.source,
                "text": res.text,
                "chars": res.chars,
                "truncated": res.truncated,
                "page_count": res.page_count,
                "encrypted": res.encrypted,
                "is_scanned": res.is_scanned,
                "meta": res.meta,
            },
        )
        if job:
            job.finish("done", pages=res.page_count, out_bytes=res.chars)
        # Image-only PDF (no OCR copy yet) → OCR queue. `source == "pdf"`
        # guards the loop: a copy that still reads as scanned isn't re-queued.
        if fmt == "pdf" and res.is_scanned and res.source == "pdf" and not res.encrypted and getattr(settings, "OCR_AUTO", False):
            queue_ocr(document_id, res.page_count)
    except Exception as exc:  # noqa: BLE001
        log.exception("text extract failed for document %s", document_id)
        if job:
            job.finish("failed", error=str(exc))
        raise
    # Re-index synchronously here (we're already on a worker) instead of
    # relying on a signal round-trip.
    try:
        from apps.search.services import update_search_vector

        update_search_vector(doc)
    except Exception:  # noqa: BLE001
        log.exception("reindex after extract failed for %s", document_id)
    return {"source": res.source, "chars": res.chars, "is_scanned": res.is_scanned, "encrypted": res.encrypted}


# ── OCR (2026-09-08 批 13) ──────────────────────────────────────────────────
# Scanned PDFs get an ocrmypdf copy with a text layer as DerivedFile(ocr_pdf);
# the reader / text extract prefer it, the original stays the download.


class OcrTask(Task):
    """Close the OCR ConversionJob when the task finally gives up."""

    def on_failure(self, exc, task_id, args, kwargs, einfo):  # noqa: D401
        from .models import ConversionJob

        document_id = args[0] if args else kwargs.get("document_id")
        if document_id is None:
            return
        _finish_open_jobs(document_id, "failed", _ocr_failure_reason(exc), kind=ConversionJob.KIND_OCR)


def _ocr_failure_reason(exc: BaseException) -> str:
    if isinstance(exc, subprocess.TimeoutExpired):
        return "OCR 超时（页数过多），可用 backfill_ocr --max-pages 分段"
    if isinstance(exc, FileNotFoundError):
        return "ocrmypdf 未安装"
    if isinstance(exc, subprocess.CalledProcessError):
        tail = (exc.stderr or exc.stdout or "").strip().splitlines()
        return ("ocrmypdf 退出 %s：%s" % (exc.returncode, tail[-1] if tail else ""))[:200]
    return (str(exc) or exc.__class__.__name__)[:200]


def queue_ocr(document_id: int, pages: int = 0, *, force: bool = False, max_pages: int | None = None) -> bool:
    """Queue ``ocr_pdf`` on the ``ocr`` queue with a per-document soft time
    limit (pages × OCR_SECONDS_PER_PAGE, capped). Never raises."""
    from .services.ocr import ocr_time_limit

    if not getattr(settings, "OCR_ENABLED", False):
        return False
    limit = ocr_time_limit(pages or int(getattr(settings, "OCR_MAX_PAGES", 1000)))
    try:
        ocr_pdf.apply_async(
            args=[document_id],
            kwargs={"force": force, "max_pages": max_pages},
            soft_time_limit=limit,
            time_limit=limit + 120,
        )
        return True
    except Exception:  # noqa: BLE001 — broker down → backfill_ocr catches up
        log.warning("could not queue OCR for %s", document_id)
        return False


def _store_ocr_pdf(document_id: int, att, pdf_path: Path, page_count: int, meta: dict) -> None:
    """Persist the OCR copy as ``DerivedFile(ocr_pdf)`` (raises on failure —
    here the copy *is* the product)."""
    from django.core.files import File

    from .models import DerivedFile

    row, _created = DerivedFile.objects.get_or_create(
        document_id=document_id, kind=DerivedFile.KIND_OCR_PDF, defaults={"source": att}
    )
    if row.file:
        try:
            row.file.delete(save=False)
        except Exception:  # noqa: BLE001
            pass
    row.source = att
    row.page_count = page_count
    row.size = pdf_path.stat().st_size
    row.meta = meta
    with pdf_path.open("rb") as fh:
        row.file.save("ocr.pdf", File(fh), save=False)
    row.save()


@shared_task(
    name="editor.ocr_pdf",
    bind=True,
    base=OcrTask,
    acks_late=True,
    reject_on_worker_lost=True,
    soft_time_limit=4 * 3600,
    time_limit=4 * 3600 + 120,
)
def ocr_pdf(self, document_id: int, force: bool = False, max_pages: int | None = None) -> dict:
    """OCR a scanned PDF into ``DerivedFile(ocr_pdf)`` and re-run the text
    extract from the copy. Idempotent: an existing copy short-circuits unless
    ``force``. Encrypted PDFs and non-PDF documents are skipped."""
    from apps.knowledge.models import Document
    from apps.knowledge.serializers import _primary_attachment, detect_doc_format

    from .models import ConversionJob, DerivedFile
    from .services.ocr import inspect_pdf, ocr_available, run_ocr

    try:
        doc = Document.all_objects.get(pk=document_id)
    except Document.DoesNotExist:
        return {"status": "skipped", "reason": "missing"}
    att = _primary_attachment(doc)
    if att is None or detect_doc_format(doc) != "pdf":
        return {"status": "skipped", "reason": "not_pdf"}
    if not force and DerivedFile.objects.filter(document_id=document_id, kind=DerivedFile.KIND_OCR_PDF).exists():
        return {"status": "skipped", "reason": "exists"}
    task_id = getattr(getattr(self, "request", None), "id", "") or ""
    job = _start_job(document_id, ConversionJob.KIND_OCR, task_id=task_id, src_bytes=int(getattr(att.file, "size", 0) or 0))
    if not ocr_available():
        if job:
            job.finish("failed", error="ocrmypdf 未安装")
        return {"status": "failed", "reason": "no_binary"}
    started = time.monotonic()
    try:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            src = work / "src.pdf"
            with att.file.open("rb") as fh, src.open("wb") as out:
                shutil.copyfileobj(fh, out, length=1024 * 1024)
            info = inspect_pdf(src)
            if info["encrypted"]:
                if job:
                    job.finish("failed", error="加密 PDF 无法 OCR")
                return {"status": "skipped", "reason": "encrypted"}
            out_pdf = work / "ocr.pdf"
            meta = run_ocr(src, out_pdf, pages=info["pages"], max_pages=max_pages)
            meta["seconds"] = int(time.monotonic() - started)
            _store_ocr_pdf(document_id, att, out_pdf, info["pages"], meta)
            if job:
                job.finish("done", pages=meta["ocr_pages"], out_bytes=out_pdf.stat().st_size)
    except Exception as exc:  # noqa: BLE001
        log.exception("OCR failed for document %s", document_id)
        if job:
            job.finish("failed", error=_ocr_failure_reason(exc))
        raise
    # Re-extract from the copy (search + is_scanned flip) — already on a worker.
    res = extract_document_text(document_id)
    return {"status": "done", "pages": info["pages"], "partial": meta["partial"], "chars": res.get("chars", 0)}

