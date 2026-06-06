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
    out = _HTML_COMMENT.sub("", src or "")
    out = map_outside_fenced_code_blocks(out, unglue_container_fences)
    out = map_outside_fenced_code_blocks(out, apply_yuque_compat_mode)
    return out
