"""Lightweight markdown structure analysis for the document stats drawer.

Counts headings (by level), list items, code blocks, images, tables. Stripped
of code-fenced regions first so markdown-like syntax inside code blocks doesn't
inflate counts. Pure regex — no markdown-it round-trip on the backend.
"""
from __future__ import annotations

import re
from typing import TypedDict


class StructureCounts(TypedDict):
    headings: dict[str, int]
    code_blocks: int
    images: int
    tables: int
    lists: int
    links: int


_FENCE_RE = re.compile(r"```.*?(?:```|\Z)", re.DOTALL)
_INLINE_CODE_RE = re.compile(r"`[^`\n]+`")
_HEADING_RE = re.compile(r"^(#{1,6})\s+\S", re.MULTILINE)
_IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]+\)")
# Bare http(s)://… autolinks + [text](url) markdown links — strip after image
# extraction so `![alt](src)` isn't double-counted as a link.
_LINK_RE = re.compile(r"\[[^\]]+\]\([^)]+\)")
_LIST_ITEM_RE = re.compile(r"^\s{0,3}(?:[-*+]|\d+\.)\s+\S", re.MULTILINE)
# Table heuristic: a divider row of `| --- | --- |` style.
_TABLE_DIVIDER_RE = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$", re.MULTILINE)


def analyze(body: str) -> StructureCounts:
    """Count structural elements in markdown. Robust to partial / empty bodies."""
    if not body:
        return {
            "headings": {f"h{i}": 0 for i in range(1, 7)},
            "code_blocks": 0,
            "images": 0,
            "tables": 0,
            "lists": 0,
            "links": 0,
        }

    # Count code blocks first (raw body), then strip them so subsequent regexes
    # don't see markdown-looking lines that are actually code.
    fenced = _FENCE_RE.findall(body)
    code_blocks = len(fenced)
    stripped = _FENCE_RE.sub("", body)
    stripped = _INLINE_CODE_RE.sub("", stripped)

    headings = {f"h{i}": 0 for i in range(1, 7)}
    for m in _HEADING_RE.finditer(stripped):
        level = len(m.group(1))
        if 1 <= level <= 6:
            headings[f"h{level}"] += 1

    images = len(_IMAGE_RE.findall(stripped))
    # Images use the same `[...](...)` shape — subtract.
    links = max(0, len(_LINK_RE.findall(stripped)) - images)
    lists = len(_LIST_ITEM_RE.findall(stripped))
    tables = len(_TABLE_DIVIDER_RE.findall(stripped))

    return {
        "headings": headings,
        "code_blocks": code_blocks,
        "images": images,
        "tables": tables,
        "lists": lists,
        "links": links,
    }
