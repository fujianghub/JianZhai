r"""Offline export rendering of Mermaid / PlantUML code blocks.

Mermaid blocks are rendered to inline SVG ahead of time by ``diagram_render``
(headless Chromium) and threaded into the renderer via ``diagram_svgs``. When
no SVG is available (Playwright missing, syntax error, or a PlantUML block we
don't render), the fence degrades to a clearly-labelled "diagram source" panel
rather than syntax-highlighted gibberish.
"""
from __future__ import annotations

from apps.exporter.services import diagram_render
from apps.exporter.services.markdown_render import (
    collect_mermaid_sources,
    render_markdown,
)


def test_mermaid_block_without_svg_falls_back_to_source_panel():
    """No SVG provided → labelled source panel (offline-safe fallback)."""
    src = "```mermaid\ngraph TD\nA-->B\n```\n"
    html = render_markdown(src)
    assert "jz-code-diagram" in html
    assert "jz-code-mermaid" in html
    assert "图表源码" in html
    # Body text is preserved verbatim (no Pygments tokenization noise).
    assert "graph TD" in html
    assert "A--&gt;B" in html or "A-->B" in html


def test_mermaid_block_with_svg_renders_inline_diagram():
    """A pre-rendered SVG (keyed by fence body) replaces the source panel."""
    src = "```mermaid\ngraph TD\nA-->B\n```\n"
    svg = '<svg id="x" viewBox="0 0 10 10"><text>A</text></svg>'
    html = render_markdown(src, diagram_svgs={"graph TD\nA-->B": svg})
    assert "jz-diagram jz-diagram-mermaid" in html
    assert svg in html
    # Source panel chrome is gone — we show the real diagram.
    assert "图表源码" not in html
    assert "jz-code-diagram" not in html


def test_collect_mermaid_sources_keys_match_render_lookup():
    """Keys from ``collect_mermaid_sources`` must line up with the renderer's
    lookup so a batch-rendered SVG map actually hits."""
    src = (
        "```mermaid\ngraph TD\nA-->B\n```\n\n"
        "```python\nx=1\n```\n\n"
        "```mermaid\nsequenceDiagram\nA->>B: hi\n```\n"
    )
    sources = collect_mermaid_sources(src)
    assert sources == ["graph TD\nA-->B", "sequenceDiagram\nA->>B: hi"]
    # Feeding those exact keys back renders both as SVG.
    svgs = {s: f"<svg data-i='{i}'></svg>" for i, s in enumerate(sources)}
    html = render_markdown(src, diagram_svgs=svgs)
    assert html.count("jz-diagram jz-diagram-mermaid") == 2


def test_collect_mermaid_sources_ignores_plantuml_and_plain_code():
    src = (
        "```plantuml\n@startuml\nA->B\n@enduml\n```\n\n"
        "```python\nx=1\n```\n\n"
        "```mermaid\ngraph LR\nA-->B\n```\n"
    )
    assert collect_mermaid_sources(src) == ["graph LR\nA-->B"]


def test_plantuml_block_emits_diagram_source_panel():
    src = "```plantuml\n@startuml\nAlice -> Bob: hi\n@enduml\n```\n"
    html = render_markdown(src)
    assert "jz-code-diagram" in html
    assert "jz-code-plantuml" in html


def test_regular_fence_keeps_highlight_classes():
    """Non-diagram languages still go through Pygments → hljs-class spans."""
    src = "```python\ndef f():\n    return 1\n```\n"
    html = render_markdown(src)
    assert "language-python" in html
    assert "hljs-keyword" in html  # ``def`` is highlighted


def test_render_markdown_code_theme_override_is_isolated():
    """The ``code_theme`` kwarg shouldn't bleed into the next call."""
    a = render_markdown("```python\nx=1\n```", code_theme="night-owl")
    b = render_markdown("```python\nx=1\n```")
    assert 'data-code-theme="night-owl"' in a
    # Default restored after the override call returns.
    assert 'data-code-theme="one-dark-pro"' in b


def test_render_mermaid_svgs_empty_input_short_circuits():
    """No sources → empty map, never launches a browser."""
    assert diagram_render.render_mermaid_svgs([]) == {}
    assert diagram_render.render_mermaid_svgs(["", "  ", "\n"]) == {}


def test_normalize_svg_strips_percentage_width():
    svg = '<svg id="a" width="100%" height="120" viewBox="0 0 10 10"></svg>'
    out = diagram_render._normalize_svg(svg)
    assert 'width="100%"' not in out
    assert 'viewBox="0 0 10 10"' in out


HTML_MERMAID_DOC = (
    '<!doctype html><html><head>'
    '<script src="https://cdn.example/mermaid/10.6.1/mermaid.min.js"></script>'
    "</head><body>"
    '<div class="panel mermaid-panel"><div class="mermaid-body">'
    '<div class="mermaid">\nsequenceDiagram\nA-&gt;&gt;B: hi\n</div>'
    "</div></div>"
    "<script>mermaid.initialize({startOnLoad:true});</script>"
    "</body></html>"
)


def test_extract_html_mermaid_sources_unescapes_and_skips_wrappers():
    """Only the standalone ``class="mermaid"`` div is a source; ``mermaid-panel``
    / ``mermaid-body`` wrappers are not. textContent is HTML-unescaped."""
    srcs = diagram_render.extract_html_mermaid_sources(HTML_MERMAID_DOC)
    assert srcs == ["sequenceDiagram\nA->>B: hi"]


def test_inline_html_mermaid_replaces_div_and_strips_runtime():
    svg_map = {"sequenceDiagram\nA->>B: hi": "<svg id='s'></svg>"}
    out = diagram_render.inline_html_mermaid(HTML_MERMAID_DOC, svg_map)
    assert "jz-mermaid-rendered" in out
    assert "<svg id='s'></svg>" in out
    # CDN runtime + init are stripped once something rendered.
    assert "mermaid.min.js" not in out
    assert "mermaid.initialize" not in out


def test_inline_html_mermaid_no_match_leaves_doc_untouched():
    # Empty map → nothing inlined, runtime preserved (can still fall back).
    assert diagram_render.inline_html_mermaid(HTML_MERMAID_DOC, {}) == HTML_MERMAID_DOC
    # Source not in map → that block untouched, runtime preserved.
    out = diagram_render.inline_html_mermaid(HTML_MERMAID_DOC, {"other": "<svg/>"})
    assert "mermaid.min.js" in out
    assert "jz-mermaid-rendered" not in out
