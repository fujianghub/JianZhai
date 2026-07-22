"""jieba-based pre-tokenization so PostgreSQL tsvector can handle Chinese."""
from __future__ import annotations

import re
from functools import lru_cache
from html.parser import HTMLParser
from typing import Iterable

import jieba
from django.contrib.postgres.search import SearchVector
from django.db.models import Value

# Silence jieba's startup log spam
jieba.setLogLevel(60)


class _PlainTextExtractor(HTMLParser):
    """Walk an HTML document and collect just its visible text.

    Skips ``<script>`` and ``<style>`` contents (they're noise for full-text
    search). The output is whitespace-collapsed at join time.
    """

    _SKIP_TAGS = {"script", "style"}

    def __init__(self) -> None:
        super().__init__()
        self._chunks: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, _attrs) -> None:
        if tag.lower() in self._SKIP_TAGS:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in self._SKIP_TAGS and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._skip_depth > 0:
            return
        text = (data or "").strip()
        if text:
            self._chunks.append(text)

    def get(self) -> str:
        return " ".join(self._chunks)


def _strip_html_tags(html: str) -> str:
    """Best-effort tag-stripping for search indexing of HTML documents."""
    if not html:
        return ""
    parser = _PlainTextExtractor()
    try:
        parser.feed(html)
    except Exception:  # noqa: BLE001 — HTMLParser raises a few subclasses on broken input
        # Fall through with whatever we managed to collect.
        pass
    return parser.get()


def _segment(text: str) -> str:
    tokens = (t.strip() for t in jieba.cut_for_search(text) if t and t.strip())
    return " ".join(_iter_unique(tokens))


@lru_cache(maxsize=512)
def _segment_cached(text: str) -> str:
    return _segment(text)


def segment(text: str) -> str:
    if not text:
        return ""
    # Cache short inputs only — search *queries* are short and often repeated,
    # and jieba tokenization is CPU-heavy. Document *bodies* (via
    # ``update_search_vector``) are large and unique per doc, so caching them
    # would waste memory for a near-zero hit rate. Tokenization is deterministic,
    # so a process-global cache stays correct across requests.
    if len(text) <= 256:
        return _segment_cached(text)
    return _segment(text)


def _iter_unique(items: Iterable[str]) -> Iterable[str]:
    seen: set[str] = set()
    for it in items:
        if it not in seen:
            seen.add(it)
            yield it


# 卡片占位符（前端编辑器序列化产物），入索引前整体剥除
_CARD_PLACEHOLDER_RE = re.compile(r"\[\[(?:doc-card|link-card):[^\]\n]*\]\]")

# 数学公式（``$$..$$`` 块 / ``$..$`` 行内）入索引前剥除：LaTeX 命令碎片
# （frac、mathbb、\、{}…）只会成为噪声词元，还干扰 jieba 分词。行内正则
# 镜像渲染端边界（开 ``$`` 前非数字/反斜杠、内容首尾非空白、闭 ``$`` 后
# 非数字），货币写法 ``5$ 到 10$`` 不受影响。
_MATH_BLOCK_RE = re.compile(r"\$\$[\s\S]+?\$\$")
_MATH_INLINE_RE = re.compile(r"(?<![\d\\$])\$(?!\s)[^$\n]+?(?<![\s\\])\$(?!\d)")


def collect_search_text(document) -> str:
    """Plain text blob for indexing: title, body, tag names, comment bodies."""
    from apps.knowledge.serializers import detect_doc_format

    body = document.raw_content or ""
    if detect_doc_format(document) == "html":
        body = _strip_html_tags(body)
    # 卡片占位符是纯语法脚手架（``[[doc-card:8]]`` / ``[[link-card:URL]]``），
    # 原样入索引会让 ``doc-card``、URL 碎片变成可搜噪音 —— 剥掉整行标记
    body = _CARD_PLACEHOLDER_RE.sub(" ", body)
    # 数学公式整段剥除（块级先剥，避免 ``$$`` 被行内正则误拆）。
    # 先把 ``\(..\)`` / ``\[..\]`` 反斜杠定界归一化为 ``$`` 形式（与渲染端
    # 同一套函数），否则该形式的 LaTeX 碎片会漏进索引。
    from apps.exporter.services.markdown_preprocess import (
        map_outside_fenced_code_blocks,
        normalize_latex_delimiters,
    )

    body = map_outside_fenced_code_blocks(body, normalize_latex_delimiters)
    body = _MATH_BLOCK_RE.sub(" ", body)
    body = _MATH_INLINE_RE.sub(" ", body)

    tag_names = " ".join(
        document.tags.values_list("name", flat=True)
    )
    comment_text = " ".join(
        document.comments.values_list("content", flat=True)
    )
    return " ".join(
        part
        for part in (document.title or "", body, tag_names, comment_text)
        if part
    )


def update_search_vector(document) -> None:
    """Recompute and persist `document.search_vector`.

    HTML documents (``detect_doc_format == 'html'``) are stripped of tags first
    so ``<div>``/``<span>`` etc. don't pollute the jieba token stream — the
    blog reader never shows raw HTML, search shouldn't index it either.
    """
    from apps.knowledge.models import Document  # local import to avoid cycle

    blob = segment(collect_search_text(document))

    Document.all_objects.filter(pk=document.pk).update(
        search_vector=SearchVector(Value(blob), config="simple")
    )
