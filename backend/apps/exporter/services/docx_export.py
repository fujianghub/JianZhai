"""DOCX export — walk the markdown-it token stream and emit python-docx elements.

Supports headings, paragraphs (with bold/italic/code runs), bullet/ordered lists,
blockquotes, code blocks, and horizontal rules. Tables degrade to a paragraph noting
their presence (full table support is left for v0.6).
"""
from __future__ import annotations

from pathlib import Path

from docx import Document as DocxDocument
from docx.enum.text import WD_PARAGRAPH_ALIGNMENT
from docx.shared import Pt
from markdown_it import MarkdownIt

from ..scope import ExportScope
from . import common

_md = MarkdownIt("commonmark", {"breaks": True}).enable("table")


def export(scope: ExportScope) -> tuple[Path, str, str]:
    docx = DocxDocument()
    _set_default_font(docx)

    for idx, doc in enumerate(scope.documents):
        if idx > 0:
            docx.add_page_break()
        title_para = docx.add_paragraph()
        run = title_para.add_run(doc.title)
        run.bold = True
        run.font.size = Pt(22)
        meta_para = docx.add_paragraph()
        meta_run = meta_para.add_run(
            f"{doc.knowledge_base.name}"
            + (f" · {doc.published_at:%Y-%m-%d}" if doc.published_at else "")
        )
        meta_run.italic = True
        meta_run.font.size = Pt(10)

        tokens = _md.parse(doc.raw_content or "")
        _render_tokens(docx, tokens)

    path = common.reserve_export_path(".docx")
    docx.save(path)
    return (
        path,
        f"{common.safe_slug(scope.label)}.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


def _set_default_font(docx: DocxDocument) -> None:
    style = docx.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)


def _render_tokens(docx: DocxDocument, tokens) -> None:
    """Lightweight pass over markdown-it tokens. Tracks lists/blockquote/heading state."""
    list_stack: list[tuple[str, int]] = []  # (kind: 'bullet'|'ordered', counter)

    i = 0
    while i < len(tokens):
        t = tokens[i]
        tt = t.type

        if tt == "heading_open":
            level = int(t.tag[1])  # h1..h6
            inline = tokens[i + 1]
            para = docx.add_paragraph()
            run = para.add_run(_inline_text(inline))
            run.bold = True
            run.font.size = Pt({1: 20, 2: 17, 3: 14, 4: 12, 5: 11, 6: 11}.get(level, 12))
            i += 3  # heading_open, inline, heading_close
            continue

        if tt == "paragraph_open":
            inline = tokens[i + 1]
            para = docx.add_paragraph()
            _emit_inline_runs(para, inline)
            if list_stack:
                kind, _ = list_stack[-1]
                para.style = docx.styles[
                    "List Bullet" if kind == "bullet" else "List Number"
                ]
            i += 3
            continue

        if tt == "bullet_list_open":
            list_stack.append(("bullet", 0))
            i += 1
            continue
        if tt == "ordered_list_open":
            list_stack.append(("ordered", 0))
            i += 1
            continue
        if tt in ("bullet_list_close", "ordered_list_close"):
            list_stack.pop()
            i += 1
            continue

        if tt == "blockquote_open":
            i += 1
            continue
        if tt == "blockquote_close":
            i += 1
            continue

        if tt == "code_block" or tt == "fence":
            para = docx.add_paragraph()
            run = para.add_run(t.content.rstrip("\n"))
            run.font.name = "Consolas"
            run.font.size = Pt(10)
            para.paragraph_format.left_indent = Pt(12)
            i += 1
            continue

        if tt == "hr":
            para = docx.add_paragraph("─" * 40)
            para.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER
            i += 1
            continue

        if tt == "table_open":
            # Skip until table_close, dropping in a note. (Full table support deferred.)
            depth = 1
            j = i + 1
            while j < len(tokens) and depth:
                if tokens[j].type == "table_open":
                    depth += 1
                elif tokens[j].type == "table_close":
                    depth -= 1
                j += 1
            docx.add_paragraph("[此处原 Markdown 包含一个表格，已省略]")
            i = j
            continue

        # list_item_open / close are no-ops; their inner paragraph_open handles formatting
        i += 1


def _emit_inline_runs(para, inline_token) -> None:
    """Walk an inline token's children, emitting runs with bold/italic/code marks."""
    bold = italic = code = False
    for child in inline_token.children or []:
        ct = child.type
        if ct == "strong_open":
            bold = True
        elif ct == "strong_close":
            bold = False
        elif ct in ("em_open", "emphasis_open"):
            italic = True
        elif ct in ("em_close", "emphasis_close"):
            italic = False
        elif ct == "code_inline":
            run = para.add_run(child.content)
            run.font.name = "Consolas"
            continue
        elif ct == "softbreak":
            para.add_run(" ")
        elif ct == "hardbreak":
            para.add_run("\n")
        elif ct == "text":
            run = para.add_run(child.content)
            run.bold = bold
            run.italic = italic
            if code:
                run.font.name = "Consolas"
        elif ct == "link_open":
            # Render the link text inline; href is dropped (Word footnotes are out of scope here).
            pass
        elif ct == "link_close":
            pass


def _inline_text(inline_token) -> str:
    return "".join(
        c.content for c in (inline_token.children or []) if c.type in ("text", "code_inline")
    )
