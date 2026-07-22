"""导出端 KaTeX 数学管线测试。

覆盖三层：tokenizer（``$``/``$$`` 识别 + 货币防误判 + 强调保护）、反斜杠
定界符归一化（``\\(..\\)`` / ``\\[..\\]`` → ``$``/``$$``）、预渲染 map 注入
与降级源码 span。headless Chromium 渲染本身走 ``math_render``（在线验证），
此处只测确定性部分。
"""
from __future__ import annotations

from apps.exporter.services.markdown_preprocess import (
    normalize_latex_delimiters,
    preprocess_markdown,
)
from apps.exporter.services.markdown_render import (
    collect_math_sources,
    render_markdown,
)
from apps.exporter.services.math_render import katex_stylesheet, math_key


# ── tokenizer：识别 + 保护 ────────────────────────────────────────────────


def test_inline_math_survives_emphasis_and_escapes():
    # 修复前 ``a_1 + b_1`` 里的下划线会被 CommonMark 当强调吃掉
    html = render_markdown("质能方程 $E_a = m_1 c^2$ 成立。\n")
    assert '<span class="jz-math-inline jz-math-source">$E_a = m_1 c^2$</span>' in html
    assert "<em>" not in html


def test_inline_math_backslash_commands_intact():
    html = render_markdown("$\\frac{a}{b}$\n")
    assert "\\frac{a}{b}" in html
    assert "jz-math-inline" in html


def test_currency_not_misparsed_as_math():
    html = render_markdown("价格从 5$ 涨到 10$，另有 $5 和 $10 两档。\n")
    assert "jz-math-inline" not in html


def test_block_math_single_line():
    html = render_markdown("$$E=mc^2$$\n")
    assert '<div class="jz-math-block jz-math-source">$$E=mc^2$$</div>' in html


def test_block_math_multiline():
    html = render_markdown("$$\n\\int_0^1 x\\,dx\n= \\tfrac12\n$$\n")
    assert "jz-math-block" in html
    assert "\\int_0^1" in html


def test_math_inside_table_cell():
    src = "| 公式 | 说明 |\n| --- | --- |\n| $a_1+b_2$ | 求和 |\n"
    html = render_markdown(src)
    assert "jz-math-inline" in html
    assert "<em>" not in html


def test_math_inside_fenced_code_stays_literal():
    html = render_markdown("```\n$a_1$\n```\n")
    assert "jz-math-inline" not in html


# ── 预渲染 map 注入 ───────────────────────────────────────────────────────


def test_prerendered_math_html_injected():
    pre = {math_key("x^2", False): "<span>PRERENDERED</span>"}
    html = render_markdown("行内 $x^2$ 公式\n", math_html=pre)
    assert '<span class="jz-math-inline"><span>PRERENDERED</span></span>' in html
    assert "jz-math-source" not in html


def test_prerendered_block_math_injected():
    pre = {math_key("E=mc^2", True): "<span>KATEXBLOCK</span>"}
    html = render_markdown("$$E=mc^2$$\n", math_html=pre)
    assert '<div class="jz-math-block"><span>KATEXBLOCK</span></div>' in html


def test_collect_math_sources_keys_match_render_lookup():
    src = "$$\nE=mc^2\n$$\n\n行内 $a_1$ 与表格：\n\n| c |\n| --- |\n| $b_2$ |\n"
    sources = collect_math_sources(src)
    assert ("E=mc^2", True) in sources
    assert ("a_1", False) in sources
    assert ("b_2", False) in sources


# ── 反斜杠定界符归一化 ────────────────────────────────────────────────────


def test_normalize_inline_backslash_parens():
    assert normalize_latex_delimiters("设 \\(x^2 + y\\) 为…") == "设 $x^2 + y$ 为…"


def test_normalize_inline_trims_padding():
    assert normalize_latex_delimiters("\\( x \\)") == "$x$"


def test_normalize_block_backslash_brackets():
    out = normalize_latex_delimiters("\\[\nE=mc^2\n\\]")
    assert out == "$$\nE=mc^2\n$$"


def test_normalize_block_single_line():
    assert normalize_latex_delimiters("\\[ E=mc^2 \\]") == "$$\nE=mc^2\n$$"


def test_escaped_brackets_mid_text_not_converted():
    # CommonMark 转义方括号（非行首/行尾）不能被当成公式
    src = "这是 \\[不是链接\\] 的写法"
    assert normalize_latex_delimiters(src) == src


def test_backslash_parens_in_inline_code_untouched():
    src = "行内代码 `\\(x\\)` 保持字面"
    assert normalize_latex_delimiters(src) == src


def test_backslash_math_in_fence_untouched():
    src = "```\n\\(x\\)\n\\[y\\]\n```\n"
    assert "$" not in preprocess_markdown(src)


def test_normalized_delimiters_render_as_math():
    html = render_markdown("圆面积 \\(\\pi r^2\\)：\n\n\\[\nA = \\pi r^2\n\\]\n")
    assert "jz-math-inline" in html
    assert "jz-math-block" in html


# ── KaTeX 样式表 ─────────────────────────────────────────────────────────


def test_katex_stylesheet_inlines_fonts():
    css = katex_stylesheet()
    assert "@font-face" in css
    assert "data:font/woff2;base64," in css
    # 不残留对外部字体文件的引用（离线单文件必须自足）
    assert "url(fonts/" not in css
