"""``looks_like_html`` 嗅探的误判防护。

历史 bug：``"<html" in head[:800]`` —— Markdown 文章开头若引用了一段 HTML
示例（```html 围栏里含 ``<html>``），整篇被误判为 doc_format='html'，
博客端走 HtmlPostReader 原样 iframe 渲染，公开页面全坏。
"""
from __future__ import annotations

from apps.knowledge.html_content import looks_like_html


def test_real_html_doctype():
    assert looks_like_html("<!DOCTYPE html>\n<html><body>hi</body></html>")


def test_real_html_no_doctype():
    assert looks_like_html("  <html lang=\"zh\">\n<head></head><body></body></html>")


def test_html_after_comment_prefix():
    # 真 HTML 页面在前 800 字符内出现 <html，即便不在开头
    assert looks_like_html("<!-- saved page -->\n<!doctype html><html></html>")


def test_markdown_plain():
    assert not looks_like_html("# 标题\n\n正文段落。")


def test_markdown_with_html_fence_example():
    md = (
        "# 模板讲解\n\n"
        "下面是一个最小 HTML 页面：\n\n"
        "```html\n"
        "<!DOCTYPE html>\n"
        "<html>\n<head><title>demo</title></head>\n<body></body>\n</html>\n"
        "```\n\n"
        "以上就是结构。\n"
    )
    assert not looks_like_html(md)


def test_markdown_with_tilde_fence_example():
    md = "说明\n\n~~~html\n<html><body>x</body></html>\n~~~\n\n后文"
    assert not looks_like_html(md)


def test_markdown_with_unterminated_fence():
    # 4096 字符采样窗截断了围栏收尾 —— 开栏后的内容都不算数
    md = "前言\n\n```html\n<html>\n" + "x\n" * 50
    assert not looks_like_html(md)


def test_empty_and_none():
    assert not looks_like_html("")
    assert not looks_like_html(None)  # type: ignore[arg-type]
