"""OCR for scanned (image-only) PDFs via ``ocrmypdf`` (tesseract).

The output is a copy of the original with an invisible text layer — the
reader renders that copy instead of the original (text selection, find,
highlights), ``extract_document_text`` reads it (search), the original stays
the download. Settings (all env-overridable, see settings.py):

- ``OCR_ENABLED`` / ``OCR_AUTO``: master switch / auto-queue for PDFs the
  text extract classified as scanned.
- ``OCR_LANGS`` (``chi_sim+eng``), ``OCR_JOBS`` (tesseract threads).
- ``OCR_MAX_PAGES``: bigger books are OCR'd for their first N pages only and
  the derived row records ``meta.partial`` (a 900-page scan takes hours).
- ``OCR_SECONDS_PER_PAGE`` / ``OCR_MAX_SECONDS``: the task's soft time
  limit is sized per document from its page count.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from django.conf import settings

from .text_extract import pdf_info


def _setting(name: str, default):
    return getattr(settings, name, default)


def ocr_binary() -> str | None:
    """Resolve the ocrmypdf executable: ``OCR_BIN`` as given, on PATH, or
    next to the running interpreter (venv installs)."""
    cfg = _setting("OCR_BIN", "ocrmypdf")
    if Path(cfg).is_absolute():
        return cfg if Path(cfg).exists() else None
    found = shutil.which(cfg)
    if found:
        return found
    local = Path(sys.executable).parent / cfg
    return str(local) if local.exists() else None


def _exec(cmd: list[str], **kwargs):
    """Indirection so tests can stub ocrmypdf without touching subprocess.run
    (pdfinfo / pdftotext share the module)."""
    return subprocess.run(cmd, **kwargs)  # noqa: S603


def ocr_available() -> bool:
    return ocr_binary() is not None


def ocr_time_limit(pages: int) -> int:
    """Soft time limit (seconds) for a document of ``pages`` pages."""
    per_page = int(_setting("OCR_SECONDS_PER_PAGE", 20))
    cap = int(_setting("OCR_MAX_SECONDS", 4 * 3600))
    pages = max(1, int(pages or 0))
    return int(min(cap, max(120, pages * per_page)))


def inspect_pdf(path: Path) -> dict:
    """``{"pages": int, "encrypted": bool}`` from pdfinfo (0/False when unknown)."""
    info = pdf_info(path)
    try:
        pages = int(info.get("Pages", "0"))
    except ValueError:
        pages = 0
    encrypted = info.get("Encrypted", "no").lower().startswith("yes")
    return {"pages": pages, "encrypted": encrypted}


def run_ocr(src: Path, out: Path, *, pages: int, max_pages: int | None = None, timeout: int | None = None) -> dict:
    """Run ocrmypdf ``src`` → ``out``. Returns ``{partial, ocr_pages, langs}``;
    raises ``FileNotFoundError`` (no binary), ``CalledProcessError`` or
    ``TimeoutExpired``."""
    binary = ocr_binary()
    if not binary:
        raise FileNotFoundError("ocrmypdf is not installed")
    langs = str(_setting("OCR_LANGS", "chi_sim+eng"))
    jobs = int(_setting("OCR_JOBS", 2))
    limit = int(max_pages if max_pages is not None else _setting("OCR_MAX_PAGES", 1000))
    partial = pages > limit > 0
    cmd = [
        binary,
        "--skip-text",  # pages that already carry text are copied untouched
        "--optimize", "0",  # no lossy re-encoding of the scans
        "--jobs", str(jobs),
        "-l", langs,
        "--output-type", "pdf",
        "--quiet",
    ]
    if partial:
        cmd += ["--pages", f"1-{limit}"]
    cmd += [str(src), str(out)]
    _exec(
        cmd,
        check=True,
        capture_output=True,
        text=True,
        timeout=timeout or ocr_time_limit(pages),
    )
    return {"partial": partial, "ocr_pages": min(pages, limit) if partial else pages, "langs": langs}
