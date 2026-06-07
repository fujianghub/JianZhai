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

import html as _html
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


# --- HTML-format documents -------------------------------------------------
# Yuque / hand-authored HTML docs embed diagrams as ``<div class="mermaid">…
# source…</div>`` plus a CDN ``<script src=".../mermaid.min.js">`` that runs
# ``mermaid.initialize({startOnLoad:true})`` in the browser. That never renders
# in an offline export (no network / blocked subresource), so we render those
# source divs to SVG server-side too and strip the now-useless runtime scripts.

# ``class="mermaid"`` as a standalone token (not ``mermaid-panel`` / ``-body``).
_HTML_MERMAID_DIV = re.compile(
    r'<div\b[^>]*\bclass="(?:[^"]*\s)?mermaid(?:\s[^"]*)?"[^>]*>(.*?)</div>',
    re.S | re.I,
)
# Mermaid runtime: the CDN <script src> and any inline mermaid.initialize/run.
_MERMAID_CDN_SCRIPT = re.compile(
    r'<script\b[^>]*\bsrc="[^"]*mermaid[^"]*"[^>]*>\s*</script>', re.I
)
_MERMAID_INIT_SCRIPT = re.compile(
    r"<script\b[^>]*>(?:(?!</script>)[\s\S])*?mermaid\.(?:initialize|init|run)"
    r"(?:(?!</script>)[\s\S])*?</script>",
    re.I,
)


def _html_mermaid_source(inner: str) -> str:
    """The diagram source as Mermaid sees it: the browser hands ``textContent``
    (HTML-unescaped, tags dropped) to ``mermaid.render``."""
    text = re.sub(r"<br\s*/?>", "\n", inner, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)  # drop any stray inline tags
    return _html.unescape(text).strip("\n")


def extract_html_mermaid_sources(html_doc: str) -> list[str]:
    """Collect Mermaid sources from ``<div class="mermaid">`` blocks in an
    HTML-format document (keys for the shared SVG batch)."""
    out: list[str] = []
    for m in _HTML_MERMAID_DIV.finditer(html_doc or ""):
        src = _html_mermaid_source(m.group(1))
        if src.strip():
            out.append(src)
    return out


def inline_html_mermaid(html_doc: str, svg_map: dict[str, str]) -> str:
    """Replace ``<div class="mermaid">source</div>`` with the pre-rendered SVG
    and strip the CDN mermaid runtime. Blocks without a rendered SVG (or when
    ``svg_map`` is empty) are left untouched so the original markup survives."""
    if not html_doc or not svg_map:
        return html_doc or ""

    def repl(m: re.Match) -> str:
        src = _html_mermaid_source(m.group(1))
        svg = svg_map.get(src)
        if not svg:
            return m.group(0)
        return f'<div class="mermaid jz-mermaid-rendered">{svg}</div>'

    out = _HTML_MERMAID_DIV.sub(repl, html_doc)
    # Only neutralise the runtime once we've actually inlined something — keeps
    # docs whose diagrams failed to render able to fall back to runtime mermaid.
    if out != html_doc:
        out = _MERMAID_CDN_SCRIPT.sub("", out)
        out = _MERMAID_INIT_SCRIPT.sub("", out)
    return out
