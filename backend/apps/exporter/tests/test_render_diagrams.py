"""Offline export rendering of Mermaid / PlantUML code blocks.

The contract documented in CLAUDE.md: offline exports do **not** run
mermaid.run() — there's no JS in a downloaded ``.md``/``.html`` zip. So
``\`\`\`mermaid`` blocks must render as clearly-labelled "diagram source"
panels rather than syntax-highlighted gibberish.
"""
from __future__ import annotations

from apps.exporter.services.markdown_render import render_markdown


def test_mermaid_block_emits_diagram_source_panel():
    src = "```mermaid\ngraph TD\nA-->B\n```\n"
    html = render_markdown(src)
    assert "jz-code-diagram" in html
    assert "jz-code-mermaid" in html
    assert "图表源码" in html
    # Body text is preserved verbatim (no Pygments tokenization noise).
    assert "graph TD" in html
    assert "A--&gt;B" in html or "A-->B" in html


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
