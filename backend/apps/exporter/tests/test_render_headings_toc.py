"""Offline export: heading anchors + numbering + [TOC] / [TOC:section].

Mirrors the frontend reader pipeline so exported HTML/PDF/site get the same
anchor ids, Yuque-style hierarchical numbers and expanded tables of contents.
"""
from __future__ import annotations

import re

from apps.exporter.services.markdown_render import render_markdown


def _toc_links(html: str) -> list[str]:
    return re.findall(r'<a href="#([^"]+)"', html)


def test_headings_get_anchor_ids():
    html = render_markdown("# 引言\n\n## 背景\n")
    assert 'id="引言"' in html
    assert 'id="背景"' in html


def test_duplicate_headings_get_unique_ids():
    html = render_markdown("# A\n\n# A\n")
    assert 'id="a"' in html
    assert 'id="a-1"' in html


def test_toc_expands_to_heading_list():
    html = render_markdown("[TOC]\n\n# A\n\n## B\n\n# C\n")
    assert "jz-inline-toc" in html
    assert _toc_links(html) == ["a", "b", "c"]
    # No literal marker left behind.
    assert "[TOC]" not in html


def test_section_toc_scopes_to_subtree():
    src = "# A\n\n[TOC:section]\n\n## A1\n\n### A1a\n\n# B\n\n## B1\n"
    html = render_markdown(src)
    assert _toc_links(html) == ["a1", "a1a"]


def test_numbering_off_by_default():
    html = render_markdown("# A\n\n## B\n")
    assert "jz-heading-num" not in html
    # Anchors still present so TOC links work regardless of numbering.
    assert 'id="a"' in html


def test_numbering_injects_hierarchical_numbers():
    # Compacted: h1,h2,h4 → 1, 1.1, 1.1.1
    html = render_markdown("# A\n\n## B\n\n#### C\n", numbering=True)
    assert '<span class="jz-heading-num">1.1</span>' in html
    assert '<span class="jz-heading-num">1.1.1</span>' in html


def test_numbering_flows_into_toc():
    html = render_markdown("[TOC]\n\n# A\n\n## B\n", numbering=True)
    assert '<span class="jz-toc-num">1</span>' in html
    assert '<span class="jz-toc-num">1.1</span>' in html
