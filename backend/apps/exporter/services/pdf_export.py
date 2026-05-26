"""PDF export — render HTML via headless Chromium (Playwright) and print to PDF.

Playwright is imported lazily so the rest of the exporter remains usable when
Playwright/Chromium isn't installed (single-doc HTML/MD/DOCX exports still work).
"""
from __future__ import annotations

from pathlib import Path

from ..scope import ExportScope
from . import common, html_export


class PlaywrightUnavailable(RuntimeError):
    """Playwright (or its Chromium binary) isn't installed in this environment."""


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

    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--no-sandbox"])
        try:
            page = browser.new_page()
            # Keep screen styling in the PDF — our print layout is driven by the
            # ``.is-print`` class (always-on page breaks), not @media print.
            page.emulate_media(media="screen")
            page.set_content(html, wait_until="load")
            return page.pdf(
                format="A4",
                margin={"top": "20mm", "bottom": "20mm", "left": "16mm", "right": "16mm"},
                print_background=True,
            )
        finally:
            browser.close()
