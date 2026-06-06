"""Tests for markdown_preprocess — container-fence ungluing edge cases.

Regression: dev-guide detailed.md §6.2 shows ``:::details 标题`` as inline
code inside a table row; the unguarded unglue regex split it onto its own
line, breaking the table and opening a runaway container.
"""
from __future__ import annotations

from apps.exporter.services.markdown_preprocess import (
    preprocess_markdown,
    unglue_container_fences,
)


def test_unglues_container_fence_after_image():
    src = "![](https://example.com/foo.png):::info\nBody\n:::"
    out = preprocess_markdown(src)
    assert "\n\n:::info" in out


def test_leaves_literal_fence_inside_inline_code_alone():
    src = (
        "| 节点 | 语法 | 文件 |\n"
        "| --- | --- | --- |\n"
        "| 折叠块 | `:::details 标题` ↔ `<details>` | `DetailsBlock.ts` |\n"
        "| 分栏 | `:::cols-2` / `:::tabs` | `Columns.ts` |"
    )
    out = preprocess_markdown(src)
    assert "\n\n:::details" not in out
    assert "\n\n:::cols-2" not in out
    assert "\n\n:::tabs" not in out
    # The table rows must survive as single lines.
    assert "| 折叠块 | `:::details 标题` ↔ `<details>` | `DetailsBlock.ts` |" in out


def test_inline_code_guard_counts_backtick_runs():
    # Outside any code span on the same line → still unglued.
    src = "`code` then text:::info\nBody\n:::"
    out = unglue_container_fences(src)
    assert "text\n\n:::info" in out


def test_does_not_unglue_inside_fenced_code_blocks():
    src = "```\nfoo:::info glued in code\n```\nafter"
    out = preprocess_markdown(src)
    assert "foo:::info glued in code" in out
    assert "foo\n\n:::info" not in out


def test_glued_closing_fence_still_unglued():
    src = ":::info\nBody:::\ntail"
    out = unglue_container_fences(src)
    assert "Body\n\n:::" in out
