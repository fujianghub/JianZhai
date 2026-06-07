r"""Server-side Mermaid → SVG rendering for offline HTML/PDF export.

Offline exports ship no JavaScript, so a ``\`\`\`mermaid`` block used to degrade
to a "diagram source" code panel (see ``markdown_render._render_fence``). This
module renders those blocks to **inline SVG** ahead of time using the same
headless Chromium that powers the PDF exporter, so the downloaded HTML shows the
actual diagram — no runtime, no network.

The mermaid bundle is vendored at ``static/vendor/mermaid.min.js`` (the exact
build the frontend ships) so the backend container needs no ``node_modules``.

Everything degrades gracefully: if Playwright/Chromium is missing or a single
diagram has a syntax error, the caller falls back to the source panel for that
block. One Chromium launch renders every diagram in a scope (batched), so the
per-export cost is one browser start, not one per diagram.
"""
from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from pathlib import Path

log = logging.getLogger(__name__)

# Per-diagram render timeout — a pathological diagram shouldn't wedge an export.
_RENDER_TIMEOUT_MS = 20_000

# Mirrors frontend ``mermaidConfig`` for the light export surface: native SVG
# ``<text>`` labels (htmlLabels:false) so the SVG is self-contained and survives
# any downstream sanitisation, plus the tightened spacings used in-app.
_MERMAID_INIT = {
    "startOnLoad": False,
    "securityLevel": "strict",
    "theme": "default",
    "htmlLabels": False,
    "fontFamily": (
        '"Noto Serif SC", "Songti SC", "PingFang SC", system-ui, '
        "-apple-system, sans-serif"
    ),
    "flowchart": {
        "htmlLabels": False,
        "nodeSpacing": 30,
        "rankSpacing": 40,
        "curve": "basis",
        "padding": 8,
    },
    "sequence": {
        "diagramMarginX": 32,
        "diagramMarginY": 8,
        "boxMargin": 8,
        "messageMargin": 28,
        "actorMargin": 60,
        "noteMargin": 6,
    },
    "classDiagram": {"padding": 8},
    "stateDiagram": {"padding": 8},
    "journey": {"boxMargin": 6, "diagramMarginX": 32, "diagramMarginY": 8},
}


@lru_cache(maxsize=1)
def _mermaid_bundle() -> str:
    path = Path(__file__).resolve().parent.parent / "static" / "vendor" / "mermaid.min.js"
    return path.read_text(encoding="utf-8")


# Resolve the mermaid API regardless of the bundle's global shape (the esbuild
# IIFE exposes ``window.mermaid`` and ``window.__esbuild_esm_mermaid_nm.mermaid``).
_API_EXPR = (
    "(window.mermaid && window.mermaid.render ? window.mermaid : "
    "(window.mermaid && window.mermaid.default && window.mermaid.default.render "
    "? window.mermaid.default : window.__esbuild_esm_mermaid_nm.mermaid.default))"
)

_RENDER_JS = (
    "async (args) => {"
    "  const [src, id] = args;"
    f" const m = {_API_EXPR};"
    "  if (m.parse) { await m.parse(src); }"
    "  const { svg } = await m.render(id, src);"
    "  return svg;"
    "}"
)

# ``mermaid.render`` returns ``width="100%"`` with no explicit height, which
# collapses or stretches oddly when inlined. We strip the percentage width and
# let the intrinsic ``viewBox`` + a max-width CSS rule size it (export-markdown.css).
_SVG_WIDTH_PCT = re.compile(r'(<svg\b[^>]*?)\swidth="100%"', re.I)


def _normalize_svg(svg: str) -> str:
    return _SVG_WIDTH_PCT.sub(r"\1", svg or "", count=1)


def render_mermaid_svgs(sources: list[str]) -> dict[str, str]:
    """Render distinct Mermaid sources to SVG in one headless Chromium session.

    Returns a ``{source: svg}`` map. Sources that fail to render (syntax error)
    or that can't be rendered at all (Playwright/Chromium missing) are simply
    absent from the map — callers fall back to the source panel for those.
    """
    distinct = list(dict.fromkeys(s for s in sources if s and s.strip()))
    if not distinct:
        return {}

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        log.info("diagram_render: Playwright unavailable; Mermaid blocks stay as source.")
        return {}

    out: dict[str, str] = {}
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
            )
            try:
                page = browser.new_page()
                page.set_default_timeout(_RENDER_TIMEOUT_MS)
                page.set_content("<!doctype html><html><head><meta charset='utf-8'>"
                                 "</head><body></body></html>")
                page.add_script_tag(content=_mermaid_bundle())
                page.evaluate(f"() => {_API_EXPR}.initialize({json.dumps(_MERMAID_INIT)})")
                for idx, src in enumerate(distinct):
                    try:
                        svg = page.evaluate(_RENDER_JS, [src, f"jz-export-mmd-{idx}"])
                        if svg:
                            out[src] = _normalize_svg(svg)
                    except Exception as exc:  # one bad diagram shouldn't kill the rest
                        log.warning(
                            "diagram_render: mermaid render failed (%s): %.160s",
                            type(exc).__name__,
                            str(exc),
                        )
            finally:
                browser.close()
    except Exception:
        # Browser launch itself failed (no Chromium binary, sandbox, OOM, …).
        log.exception("diagram_render: headless Chromium unavailable; falling back.")
        return out
    return out
