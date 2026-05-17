"""Parser for the @[title](doc:NN) mention syntax used by the editor."""
from __future__ import annotations

import re
from dataclasses import dataclass

# Accept both `@[title](doc:NN)` (preferred Markdown form) and bare `[title](doc:NN)`
# (the leading "@" may be lost after a Markdown ↔ rich-text round-trip).
MENTION_RE = re.compile(r"@?\[(?P<title>[^\]]+)\]\(doc:(?P<id>\d+)\)")

CONTEXT_RADIUS = 60  # chars before/after the mention to capture as preview context


@dataclass(frozen=True)
class ParsedMention:
    target_id: int
    title: str
    position: int  # char offset of the leading "@"
    context: str


def parse_mentions(text: str) -> list[ParsedMention]:
    if not text:
        return []
    out: list[ParsedMention] = []
    for m in MENTION_RE.finditer(text):
        start = m.start()
        end = m.end()
        ctx_start = max(0, start - CONTEXT_RADIUS)
        ctx_end = min(len(text), end + CONTEXT_RADIUS)
        snippet = text[ctx_start:ctx_end].strip()
        out.append(
            ParsedMention(
                target_id=int(m.group("id")),
                title=m.group("title"),
                position=start,
                context=snippet,
            )
        )
    return out
