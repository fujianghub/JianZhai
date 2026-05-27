"""PDF export — render HTML via headless Chromium (Playwright) and print to PDF.

Playwright is imported lazily so the rest of the exporter remains usable when
Playwright/Chromium isn't installed (single-doc HTML/MD/DOCX exports still work).
"""
from __future__ import annotations

import logging
import tempfile
from pathlib import Path

from ..scope import ExportScope
from . import common, html_export

log = logging.getLogger(__name__)


class PlaywrightUnavailable(RuntimeError):
    """Playwright (or its Chromium binary) isn't installed in this environment."""

# Headless Chromium defaults for PDF rendering (containers, small /dev/shm).
CHROMIUM_LAUNCH_ARGS = (
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
)

# Large HTML-format exports can hit slow/offline subresources — stay above Playwright defaults.
_DEFAULT_GOTO_TIMEOUT_MS = 120_000


def export(scope: ExportScope) -> tuple[Path, str, str]:
    # Print mode flattens HTML-format docs (no iframes, which Chromium prints
    # blank) and reveals every panel with page breaks between documents.
    html = html_export.render_html(scope, mode="print")
    pdf_bytes = _render_pdf(html)
    path = common.reserve_export_path(".pdf")
    common.write_bytes(path, pdf_bytes)
    return path, f"{common.safe_slug(scope.label)}.pdf", "application/pdf"


def _render_pdf(html: str) -> bytes:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:  # pragma: no cover
        raise PlaywrightUnavailable(
            "Playwright not installed. Run `pip install -e .[pdf]` "
            "and `playwright install chromium`."
        ) from exc

    cleaned = (html or "").replace("\x00", "")
    html_len = len(cleaned)
    tmp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            suffix=".html",
            delete=False,
        ) as tmp:
            tmp.write(cleaned)
            tmp_path = Path(tmp.name).resolve()
    except OSError:
        log.exception("pdf_export: failed to write temp HTML (html_char_len=%s)", html_len)
        raise

    uri = tmp_path.as_uri()
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(args=list(CHROMIUM_LAUNCH_ARGS))
            try:
                page = browser.new_page()
                page.set_default_timeout(_DEFAULT_GOTO_TIMEOUT_MS)
                # Keep screen styling in the PDF — our print layout is driven by the
                # ``.is-print`` class (always-on page breaks), not @media print.
                page.emulate_media(media="screen")
                page.goto(
                    uri,
                    wait_until="load",
                    timeout=_DEFAULT_GOTO_TIMEOUT_MS,
                )
                return page.pdf(
                    format="A4",
                    margin={
                        "top": "20mm",
                        "bottom": "20mm",
                        "left": "16mm",
                        "right": "16mm",
                    },
                    print_background=True,
                )
            finally:
                browser.close()
    except Exception:
        log.exception(
            "pdf_export: Playwright PDF render failed (html_char_len=%s, tmp_path=%s)",
            html_len,
            tmp_path,
        )
        raise
    finally:
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)
