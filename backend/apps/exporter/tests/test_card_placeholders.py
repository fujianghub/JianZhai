"""卡片占位符导出处理：转换 / 降级 / fence 守卫 / 零字面量泄漏。"""

from __future__ import annotations

from apps.exporter.services import markdown_render
from apps.exporter.services.card_placeholders import (
    CardMeta,
    collect_card_ids,
    convert_card_placeholders,
    degrade_card_placeholders,
)

SRC = (
    "# 标题\n"
    "[[doc-card:8]]\n"
    "中间一段\n"
    "[[link-card:https://github.com/x?a=1&b=2]]\n"
)


def test_collect_card_ids_fence_aware():
    fenced = "```\n[[doc-card:1]]\n```\n[[doc-card:2]]\n"
    assert collect_card_ids(fenced) == {2}


def test_convert_renders_doc_and_link_cards():
    out = convert_card_placeholders(
        SRC,
        doc_titles={8: "目标<文档>"},
        link_meta=lambda url: {
            "title": "GitHub 页面",
            "site_name": "GitHub",
            "description": '描述 "引号"',
        },
    )
    assert "[[doc-card:" not in out and "[[link-card:" not in out
    assert '<a class="doc-link" href="doc:8">📄 目标&lt;文档&gt;</a>' in out
    assert 'href="https://github.com/x?a=1&amp;b=2"' in out
    assert "GitHub 页面" in out
    assert "描述" in out


def test_convert_offline_falls_back_to_hostname_card():
    out = convert_card_placeholders(SRC, doc_titles={}, link_meta=lambda url: None)
    assert "[[" not in out
    assert "文档 #8" in out
    assert "github.com" in out  # 域名简卡
    assert "https://github.com/x?a=1&amp;b=2" in out


def test_convert_keeps_fenced_and_inline_literal():
    fenced = "```\n[[doc-card:3]]\n```\n前 [[doc-card:3]] 后\n"
    out = convert_card_placeholders(fenced, doc_titles={3: "T"}, link_meta=lambda u: None)
    assert out == fenced


def test_degrade_to_plain_links():
    out = degrade_card_placeholders(SRC, doc_titles={8: "目标文档"})
    assert "[[" not in out
    assert "[目标文档](doc:8)" in out
    assert "<https://github.com/x?a=1&b=2>" in out


def test_degrade_without_titles_uses_fallback_label():
    out = degrade_card_placeholders("[[doc-card:9]]\n")
    assert "[文档 #9](doc:9)" in out


def test_render_markdown_with_card_meta_renders_cards():
    html = markdown_render.render_markdown(
        SRC,
        card_meta=CardMeta(
            doc_titles={8: "目标文档"},
            link_meta=lambda url: {"title": "GitHub"},
        ),
    )
    assert "[[doc-card:" not in html and "[[link-card:" not in html
    assert "jz-doc-card" in html
    assert "jz-link-card" in html
    # doc: 链接被 _rewrite_doc_links 统一改写为导出内锚点
    assert 'href="#doc-8"' in html


def test_render_markdown_without_card_meta_never_leaks():
    html = markdown_render.render_markdown(SRC)
    assert "[[doc-card:" not in html and "[[link-card:" not in html
    assert 'href="#doc-8"' in html  # 降级为普通链接后仍走锚点改写
    assert "https://github.com/x?a=1&amp;b=2" in html
