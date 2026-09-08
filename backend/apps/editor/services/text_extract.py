"""Extract searchable text + metadata from binary attachments.

PDF → ``pdfinfo`` (pages / Encrypted) + ``pdftotext -layout``; PPT → the
LibreOffice deck PDF (``DerivedFile(deck_pdf)``, when present) through the
same path; EPUB → XHTML chapters in the zip with tags stripped. All three use
tooling already in the image (poppler-utils) or the standard library.

The result is stored in :class:`DocumentExtract` — deliberately **not** in
``raw_content``: that column is the author's working copy (edited in the
editor, exported, previewed), while extracted text is index-only.
"""

from __future__ import annotations

import logging
import re
import subprocess
import tempfile
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

log = logging.getLogger(__name__)

# tsvector caps a single value at 1 MB; jieba over 400k chars is a few
# seconds on the convert queue. Anything longer is truncated (flagged).
MAX_TEXT_CHARS = 400_000
# Fewer than this many characters per page over the whole file → the PDF is
# (almost certainly) a scanned image book: nothing to index until OCR.
SCANNED_CHARS_PER_PAGE = 20
_PDFTOTEXT_TIMEOUT = 300
_PDFINFO_TIMEOUT = 60


@dataclass
class ExtractResult:
    text: str = ""
    source: str = "none"
    page_count: int = 0
    encrypted: bool = False
    is_scanned: bool = False
    truncated: bool = False
    meta: dict = field(default_factory=dict)

    @property
    def chars(self) -> int:
        return len(self.text)


def _cap(text: str) -> tuple[str, bool]:
    text = text or ""
    if len(text) > MAX_TEXT_CHARS:
        return text[:MAX_TEXT_CHARS], True
    return text, False


def pdf_info(path: Path) -> dict:
    """``pdfinfo`` key/values (empty dict when the binary is missing/fails)."""
    try:
        out = subprocess.run(
            ["pdfinfo", str(path)], capture_output=True, text=True, timeout=_PDFINFO_TIMEOUT
        ).stdout
    except (OSError, subprocess.TimeoutExpired):
        return {}
    info: dict = {}
    for line in out.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            info[k.strip()] = v.strip()
    return info


def extract_pdf(path: Path, *, source: str = "pdf") -> ExtractResult:
    info = pdf_info(path)
    res = ExtractResult(source=source)
    try:
        res.page_count = int(info.get("Pages", "0") or 0)
    except ValueError:
        res.page_count = 0
    res.encrypted = info.get("Encrypted", "no").lower().startswith("yes")
    res.meta = {k: info[k] for k in ("Title", "Author", "Producer", "Page size") if k in info}
    if res.encrypted:
        return res
    try:
        proc = subprocess.run(
            ["pdftotext", "-layout", "-q", str(path), "-"],
            capture_output=True,
            timeout=_PDFTOTEXT_TIMEOUT,
        )
        text = proc.stdout.decode("utf-8", "replace")
    except (OSError, subprocess.TimeoutExpired) as exc:
        log.warning("pdftotext failed for %s: %s", path, exc)
        text = ""
    text = _normalize(text)
    res.text, res.truncated = _cap(text)
    if res.page_count > 0:
        res.is_scanned = len(text) < SCANNED_CHARS_PER_PAGE * res.page_count
    else:
        res.is_scanned = not text
    return res


_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"[ \t\f\v]+")
_BLANK_LINES_RE = re.compile(r"\n{3,}")


def _strip_tags(html: str) -> str:
    html = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", html)
    text = _TAG_RE.sub(" ", html)
    import html as html_mod

    return html_mod.unescape(text)


def _normalize(text: str) -> str:
    text = text.replace("\x00", "").replace("\f", "\n")
    text = _WS_RE.sub(" ", text)
    text = "\n".join(line.strip() for line in text.splitlines())
    return _BLANK_LINES_RE.sub("\n\n", text).strip()


def extract_epub(path: Path) -> ExtractResult:
    res = ExtractResult(source="epub")
    parts: list[str] = []
    try:
        with zipfile.ZipFile(path) as zf:
            names = [n for n in zf.namelist() if n.lower().endswith((".xhtml", ".html", ".htm"))]
            # Rough reading order: the container lists them roughly in spine
            # order for most producers; a full OPF parse is not worth it here.
            for n in sorted(names):
                try:
                    parts.append(_strip_tags(zf.read(n).decode("utf-8", "replace")))
                except Exception:  # noqa: BLE001
                    continue
            res.page_count = len(names)
    except zipfile.BadZipFile:
        return res
    res.text, res.truncated = _cap(_normalize("\n\n".join(parts)))
    return res


def extract_attachment(att, *, deck_pdf_path: Path | None = None) -> ExtractResult:
    """Dispatch on the attachment's extension. ``deck_pdf_path`` lets a pptx
    reuse its LibreOffice render instead of a second conversion."""
    name = (att.original_filename or "").lower()
    with tempfile.TemporaryDirectory() as tmp:
        if name.endswith(".pdf"):
            p = Path(tmp) / "src.pdf"
            _copy(att, p)
            return extract_pdf(p)
        if name.endswith(".epub"):
            p = Path(tmp) / "src.epub"
            _copy(att, p)
            return extract_epub(p)
        if name.endswith((".ppt", ".pptx")):
            if deck_pdf_path is not None and deck_pdf_path.exists():
                return extract_pdf(deck_pdf_path, source="deck_pdf")
            return ExtractResult(source="none")
    return ExtractResult(source="none")


def _copy(att, dest: Path) -> None:
    import shutil

    with att.file.open("rb") as fh, dest.open("wb") as out:
        shutil.copyfileobj(fh, out, length=1024 * 1024)
