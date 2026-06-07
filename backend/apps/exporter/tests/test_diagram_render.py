"""Real headless-Chromium Mermaid → SVG rendering (Playwright-gated).

Skipped wholesale when Playwright/Chromium isn't installed — the renderer
already degrades to source panels there, covered by ``test_render_diagrams``.
"""
from __future__ import annotations

import pytest

pytest.importorskip("playwright")

from apps.exporter.scope import collect_for_scope
from apps.exporter.services import diagram_render, html_export
from apps.exporter.tests.conftest import make_doc
from apps.knowledge.models import Document

MERMAID_DOC = """# Diagram doc

```mermaid
graph TD
A[Start] --> B{OK?}
B -->|yes| C[Done]
B -->|no| A
```

Trailing text.
"""


def test_render_mermaid_svgs_produces_real_svg():
    src = "graph TD\nA-->B\nB-->C"
    out = diagram_render.render_mermaid_svgs([src])
    assert src in out
    assert out[src].lstrip().startswith("<svg")
    assert "</svg>" in out[src]


def test_render_mermaid_svgs_bad_syntax_is_omitted():
    """A syntax error drops that one diagram from the map (caller falls back)."""
    out = diagram_render.render_mermaid_svgs(["graph TD\nA-->B", "!!!not a diagram!!!"])
    assert "graph TD\nA-->B" in out
    assert "!!!not a diagram!!!" not in out


@pytest.mark.django_db
def test_html_export_embeds_rendered_mermaid_svg(owner, kb):
    make_doc(kb, "mmd", published=MERMAID_DOC)
    doc = Document.objects.get(slug="mmd", knowledge_base=kb)
    scope = collect_for_scope(owner=owner, scope="doc", target_id=doc.id)
    html = html_export.render_html(scope)
    assert "jz-diagram jz-diagram-mermaid" in html
    assert "<svg" in html
    # The real diagram replaced the source-panel fallback.
    assert "图表源码" not in html
