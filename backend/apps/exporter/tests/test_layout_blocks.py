"""结构布局块（cols/tabs/details）导出端镜像 —— 对齐前端 convertLayoutBlocks。"""
from __future__ import annotations

import pytest

from apps.exporter.services.markdown_preprocess import (
    convert_layout_blocks,
    preprocess_markdown,
)
from apps.exporter.services.markdown_render import render_markdown

COLS_SRC = ":::cols-2\n左边内容\n::col\n右边内容\n:::"
TABS_SRC = ":::tabs\n::tab 甲\n内容甲\n::tab 乙\n内容乙\n:::"
DETAILS_SRC = ":::details 点开看\n隐藏内容\n:::"


def test_cols_convert_to_grid_html():
    out = convert_layout_blocks(COLS_SRC)
    assert 'class="jz-columns jz-columns-2"' in out
    assert out.count('class="jz-column"') == 2
    assert "::col" not in out
    assert "左边内容" in out and "右边内容" in out


def test_tabs_convert_to_labeled_panels():
    out = convert_layout_blocks(TABS_SRC)
    assert 'class="jz-tabs"' in out
    assert 'data-label="甲"' in out and 'data-label="乙"' in out
    assert "::tab" not in out


def test_details_convert_with_summary():
    out = convert_layout_blocks(DETAILS_SRC)
    assert '<details class="jz-details-block">' in out
    assert "<summary>点开看</summary>" in out


def test_unterminated_fence_left_untouched():
    src = ":::cols-2\n没有闭合"
    assert convert_layout_blocks(src) == src


def test_nested_callout_inside_column_survives():
    src = ":::cols-2\n:::info 提示\n内嵌\n:::\n::col\n右\n:::"
    out = convert_layout_blocks(src)
    assert ":::info 提示" in out  # callout 留给 markdown-it 容器规则
    assert out.count('class="jz-column"') == 2


def test_fenced_code_not_converted():
    src = "```\n:::cols-2\n::col\n:::\n```"
    assert preprocess_markdown(src).strip() == src.strip()


def test_render_markdown_no_layout_leakage():
    """全渲染回归：布局容器不得再落进 catch-all callout，分隔符不得泄漏。"""
    html = render_markdown(f"{COLS_SRC}\n\n{TABS_SRC}\n\n{DETAILS_SRC}")
    assert "jz-callout-cols-2" not in html
    assert "jz-callout-tabs" not in html
    assert "jz-callout-details" not in html
    assert "::col" not in html
    assert "::tab" not in html
    assert 'class="jz-columns jz-columns-2"' in html
    assert "<summary>点开看</summary>" in html
    # 列内 Markdown 继续正常解析成段落
    assert "<p>左边内容</p>" in html


@pytest.mark.django_db
def test_print_mode_opens_details(owner, kb):
    from apps.exporter.scope import collect_for_scope
    from apps.exporter.services import html_export
    from apps.exporter.tests.conftest import make_doc
    from apps.knowledge.models import Document

    make_doc(kb, "d1", published=DETAILS_SRC)
    make_doc(kb, "d2", published="second")
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    html = html_export.render_html(scope, mode="print")
    assert '<details class="jz-details-block" open>' in html
