"""Tests for markdown_preprocess — container-fence ungluing edge cases.

Regression: dev-guide detailed.md §6.2 shows ``:::details 标题`` as inline
code inside a table row; the unguarded unglue regex split it onto its own
line, breaking the table and opening a runaway container.
"""
from __future__ import annotations

from apps.exporter.services.markdown_preprocess import (
    convert_backticked_styled_code,
    normalize_italic_wrapping_inline_html,
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


def test_recover_yuque_diagram_comment_with_internal_arrows():
    # Yuque exports diagrams as an HTML comment holding the source + a static
    # SVG image. Flowchart arrows contain ``-->`` — the generic comment strip
    # used to truncate at the first arrow, leaking the rest of the source into
    # the exported document as text.
    from apps.exporter.services.markdown_preprocess import (
        recover_yuque_diagram_comments,
    )

    src = (
        "前文。\n\n"
        "<!-- 这是一个文本绘图，源码为：flowchart LR\n"
        '    E1["大象流 A"] --> H{"ECMP 哈希"}\n'
        '    H --> P1["路径 1"]:::jam\n'
        "    classDef jam fill:#4a1f1f\n"
        "    class E1 flow -->\n"
        "![](/media/uploads/2026/07/x.svg)\n\n"
        "后文。"
    )
    out = recover_yuque_diagram_comments(src)
    assert "```mermaid\n" in out
    assert "classDef jam" in out  # full source captured, not truncated
    assert "![](/media/uploads" not in out  # static image dropped
    assert "<!--" not in out

    # Through the full preprocess: fence survives; nothing leaks as text.
    full = preprocess_markdown(src)
    assert "```mermaid" in full
    assert "classDef jam" in full  # inside the fence
    assert "后文。" in full


def test_recover_yuque_diagram_comment_plantuml():
    from apps.exporter.services.markdown_preprocess import (
        recover_yuque_diagram_comments,
    )

    src = "<!-- 这是一个文本绘图，源码为：@startuml\nA --> B\n@enduml -->\n![](/media/x.svg)"
    out = recover_yuque_diagram_comments(src)
    assert "```plantuml\n@startuml" in out


# 语雀空格包裹公式抢救（rescue_space_padded_dollar_math），镜像前端
# rescueSpacePaddedDollarMath。真实样本：doc 516（NUMA 架构）/ doc 503（AI Infra）。


def test_rescue_space_padded_dollar_math_doc516_brackets():
    src = "前文\n\n$ [ B_{\\text{total}}\\approx2B ] $\n\n后文"
    out = preprocess_markdown(src)
    assert "$$\nB_{\\text{total}}\\approx2B\n$$" in out
    assert "$ [" not in out


def test_rescue_space_padded_dollar_math_doc503_double_backslash():
    src = "$ MFU = \\\\frac{有效吞吐}{峰值吞吐} $"
    out = preprocess_markdown(src)
    assert "$$\nMFU = \\frac{有效吞吐}{峰值吞吐}\n$$" in out


def test_rescue_keeps_interval_union_brackets():
    out = preprocess_markdown("$ [0,1] \\cup [2,3] $")
    assert "$$\n[0,1] \\cup [2,3]\n$$" in out


def test_rescue_ignores_currency_and_plain_text():
    assert "$ 5 到 10 $" in preprocess_markdown("单价在 $ 5 到 10 $ 之间")
    assert "$ x + y $" in preprocess_markdown("$ x + y $")


def test_rescue_ignores_valid_inline_and_fenced_code():
    assert "$E=mc^2$" in preprocess_markdown("$E=mc^2$")
    assert "$ \\alpha $" in preprocess_markdown("```\n$ \\alpha $\n```")
    assert "$ \\alpha $" in preprocess_markdown("价格 $ \\alpha $ 收尾还有字")


# ── 彩色行内代码保码转换（2026-09-01，线上 doc 1002《Route Preference》）──
# 语雀把彩色行内代码的 <font>/<span> 染色标签导出在反引号内部；旧管线剥反引号
# 丢代码语义（颜色块/表格「不支持行内代码」）。镜像 frontend
# convertBacktickedStyledCode：保 <code> 丢颜色，**/_ → strong/em。


def test_backticked_font_becomes_code_chip_colour_dropped():
    src = '`<font style="color:rgb(77, 82, 89);">preference</font>`'
    out = preprocess_markdown(src)
    assert out == "<code>preference</code>"


def test_backticked_italic_font_keeps_em_inside_chip():
    src = '`_<font style="color:rgb(88, 88, 91);">external dist1</font>_`'
    assert preprocess_markdown(src) == "<code><em>external dist1</em></code>"


def test_backticked_multi_run_command_line_one_chip():
    src = (
        '`**<font style="color:rgb(64, 64, 64);">distance ospf</font>**'
        '<font style="color:rgb(64, 64, 64);"> {</font>'
        '**<font style="color:rgb(64, 64, 64);">intra-area</font>**'
        '<font style="color:rgb(64, 64, 64);"> </font>'
        '_<font style="color:rgb(64, 64, 64);">distance-value</font>_'
        '<font style="color:rgb(64, 64, 64);">}</font>`'
    )
    assert preprocess_markdown(src) == (
        "<code><strong>distance ospf</strong> {<strong>intra-area</strong> "
        "<em>distance-value</em>}</code>"
    )


def test_backticked_styled_code_in_table_row_survives():
    src = (
        "| 类型 | 值 | 说明 |\n"
        "| --- | --- | --- |\n"
        '| LDP | 9 | LDP `<font style="color:rgb(77, 82, 89);">preference</font>` 语句 |'
    )
    out = preprocess_markdown(src)
    assert "| LDP | 9 | LDP <code>preference</code> 语句 |" in out


def test_backticked_styled_code_neutralizes_markdown_active_chars():
    src = '`<font style="color:red">show route [detail]</font>`'
    assert preprocess_markdown(src) == "<code>show route &#91;detail&#93;</code>"


def test_backticked_unknown_tags_left_alone():
    # 反引号内含非表现层标签（真实代码样例）→ 保码转换不接手。
    src = "`<font><div>x</div></font>`"
    assert convert_backticked_styled_code(src) == src


def test_pure_bold_backticks_keep_old_unwrap_path():
    # 决策②：无染色标签的 `**x**` 仍走旧 unwrap（剥反引号留加粗），不转芯片。
    out = preprocess_markdown("`**ORM**`")
    assert "<code>" not in out
    assert "**ORM**" in out


def test_backticked_styled_code_not_converted_inside_fences():
    src = '```\n`<font style="color:red">x</font>`\n```'
    assert preprocess_markdown(src) == src


def test_font_inside_remaining_inline_code_not_rewritten_to_span():
    # normalize_legacy_html_tags 守卫：保码转换和 unwrap 都兜不住的残余形态
    # （含未知标签 + 尾随文本）留在反引号内时不改写成 span——code_inline 会
    # 原样转义展示，改写只会把转义垃圾从 font 换成 span。
    src = "`<font><div>x</div></font> tail`"
    out = preprocess_markdown(src)
    assert out == src
    assert "<span" not in out


# ── 斜体孪生 normalize_italic_wrapping_inline_html（2026-09-01，doc 1002 参数表）──
# 语雀相邻斜体粘连 `_A__B_`：中间 `__` 按侧翼规则只能开不能闭 → 字面 `_`。


def test_italic_wrapping_tags_converted_to_em_glued_tail_self_heals():
    cell = (
        '_<font style="color:rgb(88, 88, 91);">（可选）为从其他路由域通过重分发'
        "（redistribution）学习到的路由设置管理距离。取值范围 1 到 255。</font>"
        "__默认值为 110。_"
    )
    out = preprocess_markdown(cell)
    assert '<em><span style="color:rgb(88, 88, 91);">（可选）' in out
    assert "</span></em>_默认值为 110。_" in out


def test_italic_chain_glued_spans_each_get_own_em():
    src = "_<span>甲</span>__<span>乙</span>_"
    assert normalize_italic_wrapping_inline_html(src) == (
        "<em><span>甲</span></em><em><span>乙</span></em>"
    )


def test_italic_twin_never_touches_urls_snake_case_bare_cjk():
    url = "https://docs.example.com/a?TocPath=%25257C_____0"
    assert normalize_italic_wrapping_inline_html(url) == url
    assert normalize_italic_wrapping_inline_html("a_b_c") == "a_b_c"
    assert normalize_italic_wrapping_inline_html("_中文_") == "_中文_"


def test_italic_twin_not_inside_fences():
    src = '```\n_<span style="color:red">x</span>_\n```'
    assert preprocess_markdown(src) == src
