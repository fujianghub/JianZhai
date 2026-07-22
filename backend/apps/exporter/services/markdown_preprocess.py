"""Markdown preprocessing for offline export — subset of ``frontend/src/utils/markdown.ts``.

Runs before markdown-it so Yuque-imported notes and pipe tables survive export
without the browser-side editor pipeline.
"""
from __future__ import annotations

import re

_FENCE_LINE = re.compile(r"^(\s*)(`{3,}|~{3,})(.*)$")
_INNER_FONT = re.compile(
    r"<font\b([^>]*)>((?:(?!<font\b)[\s\S])*?)</font>",
    re.I,
)
_GFM_TABLE_LINE = re.compile(r"^\s*\|.*\|\s*$")
_GFM_TABLE_SEP = re.compile(r"^\s*\|(?:\s*:?-+:?\s*\|)+\s*$")
_HTML_COMMENT = re.compile(r"<!--[\s\S]*?-->")

# Yuque exports each diagram as an HTML comment holding the source plus a
# pre-rendered static SVG image. The generic ``_HTML_COMMENT`` strip truncates
# at the FIRST ``-->`` — which flowchart arrows themselves contain — leaking
# the rest of the source into the exported document as text. Real closers sit
# at end-of-line while arrows always have a target after them on the same
# line, so the closer is anchored on ``-->`` + EOL. Mirrors
# ``recoverYuqueDiagramComments`` in frontend ``markdown.ts``: the comment is
# recovered into a ``mermaid``/``plantuml`` fence (rendered offline to SVG for
# HTML/PDF/site exports) and the static image is dropped.
_YUQUE_DIAGRAM_COMMENT = re.compile(
    r"<!--\s*这是一个文本绘图[，,]?\s*(?:源码为)?[：:]\s*([\s\S]*?)-->[ \t]*(?=\r?\n|$)"
    r"((?:\r?\n[ \t]*!\[[^\]\n]*\]\([^)\n]*\)[ \t]*)?)"
)


def recover_yuque_diagram_comments(src: str) -> str:
    if "这是一个文本绘图" not in src:
        return src

    def _repl(m: re.Match) -> str:
        body = m.group(1).rstrip()
        lang = "plantuml" if body.lstrip().startswith("@startuml") else "mermaid"
        return f"\n```{lang}\n{body}\n```\n"

    return _YUQUE_DIAGRAM_COMMENT.sub(_repl, src)


def map_outside_fenced_code_blocks(src: str, fn) -> str:
    """Apply ``fn`` only to segments outside fenced code blocks."""
    lines = (src or "").split("\n")
    out: list[str] = []
    in_fence = False
    fence_char = ""
    fence_len = 0
    buf: list[str] = []

    def flush(transform: bool) -> None:
        if not buf:
            return
        chunk = "\n".join(buf)
        out.append(fn(chunk) if transform else chunk)
        buf.clear()

    for line in lines:
        m = _FENCE_LINE.match(line)
        if m:
            ch = m.group(2)[0]
            length = len(m.group(2))
            if not in_fence:
                flush(True)
                in_fence = True
                fence_char = ch
                fence_len = length
                buf.append(line)
                continue
            if ch == fence_char and length >= fence_len:
                buf.append(line)
                flush(False)
                in_fence = False
                continue
        buf.append(line)
    flush(not in_fence)
    return "\n".join(out)


def _inside_inline_code_span(src: str, index: int) -> bool:
    """Odd number of backtick *runs* between line start and ``index`` means an
    inline code span is still open there (runs, not chars, so ````code````
    double-backtick delimiters count once each)."""
    line_start = src.rfind("\n", 0, index) + 1
    runs = 0
    i = line_start
    while i < index:
        if src[i] == "`":
            runs += 1
            while i + 1 < index and src[i + 1] == "`":
                i += 1
        i += 1
    return runs % 2 == 1


def unglue_container_fences(src: str) -> str:
    """Insert missing blank lines before/after ``:::`` fences glued onto text
    (Yuque export quirk) — but leave literal ``:::`` inside inline code spans
    alone (e.g. a docs table cell showing ``` `:::details 标题` ```), else the
    split breaks the table and spawns a runaway container. Fenced code blocks
    are excluded at the call site via ``map_outside_fenced_code_blocks``."""

    def _opener(m: re.Match) -> str:
        if _inside_inline_code_span(m.string, m.start(2)):
            return m.group(0)
        return f"{m.group(1)}\n\n{m.group(2)}"

    out = re.sub(r"([^\n])(:::[a-zA-Z][\w-]*)", _opener, src)

    def _closer(m: re.Match) -> str:
        if _inside_inline_code_span(m.string, m.start(1) + 1):
            return m.group(0)
        return f"{m.group(1)}\n\n:::{m.group(2)}"

    return re.sub(r"([^\n]):::(\s*\n|$)", _closer, out)


def unwrap_backticked_emphasis(src: str) -> str:
    out = src
    out = re.sub(r"`(\*\*)([^`]+?)\1`", r"\1\2\1", out)
    out = re.sub(r"`(__)([^`]+?)\1`", r"\1\2\1", out)
    out = re.sub(r"`(\*)([^*`]+?)\1`", r"\1\2\1", out)
    return out


def unwrap_backticked_html(src: str) -> str:
    tags = r"(?:font|span|u|mark|kbd|sub|sup|br)"
    marker = r"(\*\*|__)?"
    closing = r"\1"
    pattern = (
        r"`" + marker + r"(<" + tags + r"\b[^`<>]*?(?:/>|>[^`]*?</" + tags + r">))"
        + closing + r"`"
    )
    return re.sub(pattern, r"\1\2\1", src, flags=re.I)


# LaTeX 反斜杠定界符 → 美元定界符归一化。
# ChatGPT / 论文 / 部分平台导出习惯 ``\(x\)`` / ``\[..\]``，而全站四套解析器
# （前端阅读、Tiptap、CM6、本导出端）只认 ``$`` / ``$$``——归一化一次全端识别。
# 块级锚定「``\[`` 起行、``\]`` 收行」：CommonMark 转义方括号（``\[非链接\]``）
# 都出现在行中，行锚定天然避开；行内 ``\(..\)`` 由 ``_inside_inline_code_span``
# 守卫字面反斜杠示例，代码围栏由调用点 ``map_outside_fenced_code_blocks`` 排除。
# 镜像 frontend ``markdown.ts normalizeLatexDelimiters``，改动须两端同步。
_LATEX_BLOCK_DELIM = re.compile(
    r"^[ \t]*\\\[[ \t]*\n?([\s\S]*?)\n?[ \t]*\\\][ \t]*$", re.M
)
_LATEX_INLINE_DELIM = re.compile(r"\\\(([^\n]*?)\\\)")


def normalize_latex_delimiters(src: str) -> str:
    if "\\(" not in src and "\\[" not in src:
        return src

    def _block(m: re.Match) -> str:
        body = m.group(1).strip()
        if not body:
            return m.group(0)
        return f"$$\n{body}\n$$"

    out = _LATEX_BLOCK_DELIM.sub(_block, src)

    def _inline(m: re.Match) -> str:
        if _inside_inline_code_span(m.string, m.start()):
            return m.group(0)
        body = m.group(1).strip()
        if not body:
            return m.group(0)
        return f"${body}$"

    return _LATEX_INLINE_DELIM.sub(_inline, out)


def normalize_yuque_images(src: str) -> str:
    out = re.sub(r"[\u200b\ufeff]+(?=\s*!\[)", "", src)
    return re.sub(r"🖼\ufe0f?(?=\s*!\[)", "", out)


def _replace_font_once(match: re.Match) -> str:
    attrs, inner = match.group(1), match.group(2)
    style_m = re.search(r'style\s*=\s*(["\'])([\s\S]*?)\1', attrs, re.I)
    style = (style_m.group(2).strip() if style_m else "") or ""
    color_m = re.search(r'color\s*=\s*(["\'])([\s\S]*?)\1', attrs, re.I)
    if color_m and "color:" not in style.lower():
        style = f"{style}; color: {color_m.group(2).strip()}".strip("; ")
    face_m = re.search(r'face\s*=\s*(["\'])([\s\S]*?)\1', attrs, re.I)
    if face_m and "font-family:" not in style.lower():
        style = f"{style}; font-family: {face_m.group(2).strip()}".strip("; ")
    if style:
        return f'<span style="{style}">{inner}</span>'
    return f"<span>{inner}</span>"


def normalize_legacy_html_tags(src: str) -> str:
    out = src
    for _ in range(32):
        nxt = _INNER_FONT.sub(_replace_font_once, out)
        if nxt == out:
            break
        out = nxt
    return out


def normalize_yuque_emphasis(src: str) -> str:
    out = re.sub(r"\*\*\*\*([^*]+?)\*\*\*\*", r"**\1**", src)
    out = re.sub(r"\*\*([^\s*][^*]*?)\s+\*\*", r"**\1**", out)
    out = re.sub(r"__([^_]+?)\s+__", r"__\1__", out)
    return out


def normalize_bold_wrapping_inline_html(src: str) -> str:
    pattern = (
        r"\*\*((?:<(?:font|span)\b[^>]*>.*?</(?:font|span)>)+)\*\*"
    )
    return re.sub(pattern, r"<strong>\1</strong>", src, flags=re.I | re.S)


def apply_yuque_compat_mode(src: str) -> str:
    out = unwrap_backticked_emphasis(src)
    out = normalize_yuque_images(out)
    out = unwrap_backticked_html(out)
    out = normalize_legacy_html_tags(out)
    out = normalize_yuque_emphasis(out)
    out = normalize_bold_wrapping_inline_html(out)
    return out


def preprocess_markdown(src: str) -> str:
    # Diagram recovery MUST precede the generic comment strip — see
    # ``recover_yuque_diagram_comments`` for why the naive strip corrupts.
    out = recover_yuque_diagram_comments(src or "")
    out = _HTML_COMMENT.sub("", out)
    out = map_outside_fenced_code_blocks(out, unglue_container_fences)
    out = map_outside_fenced_code_blocks(out, normalize_latex_delimiters)
    out = map_outside_fenced_code_blocks(out, apply_yuque_compat_mode)
    return out
