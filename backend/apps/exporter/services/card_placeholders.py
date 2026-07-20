"""``[[doc-card:ID]]`` / ``[[link-card:URL]]`` 卡片占位符的导出端处理。

前端编辑器把卡片节点序列化为整行占位符（见 frontend DocCardEmbed /
LinkCardEmbed），历史上导出管线完全不认识它们 → HTML/PDF/.md/docx 全部
字面量泄漏。本模块提供两条路径：

- ``convert_card_placeholders``：HTML/PDF/static-site —— 占位符行转成
  样式化卡片 HTML 块（markdown-it ``html=True`` 直接放行）。外链元数据
  可注入（默认走 link_preview 抓取 + 24h 缓存），失败降级域名简卡。
- ``degrade_card_placeholders``：.md / docx —— 占位符降级为普通链接行
  （doc-card → ``[标题](doc:ID)``，link-card → ``<URL>``），后续管线
  按既有 mention 规则继续改写。

两条路径都 fence 感知（fence 内保持字面量），任何输出都不再含 ``[[``。
"""

from __future__ import annotations

import html
import re
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from urllib.parse import urlparse

DOC_CARD_RE = re.compile(r"^\[\[doc-card:(\d+)\]\]\s*$")
LINK_CARD_RE = re.compile(r"^\[\[link-card:(https?://[^\]\s]+?)\]\]\s*$")


@dataclass(frozen=True)
class CardMeta:
    """render_markdown 的卡片元数据注入包。"""

    doc_titles: dict[int, str]
    link_meta: Callable[[str], dict | None]

_FENCE_RE = re.compile(r"^\s*(```|~~~)")


def _map_card_lines(src: str, repl: Callable[[str], str | None]) -> str:
    """对 fence 外的每一行应用 ``repl``（返回 None = 原样保留）。"""
    out: list[str] = []
    in_fence = False
    for line in src.split("\n"):
        if _FENCE_RE.match(line):
            in_fence = not in_fence
            out.append(line)
            continue
        if not in_fence:
            replaced = repl(line)
            if replaced is not None:
                out.append(replaced)
                continue
        out.append(line)
    return "\n".join(out)


def collect_card_ids(src: str) -> set[int]:
    """fence 外全部 ``[[doc-card:ID]]`` 的目标文档 id。"""
    ids: set[int] = set()

    def scan(line: str) -> None:
        m = DOC_CARD_RE.match(line)
        if m:
            ids.add(int(m.group(1)))

    def repl(line: str) -> str | None:
        scan(line)
        return None

    _map_card_lines(src, repl)
    return ids


def doc_titles_for(sources: Iterable[str]) -> dict[int, str]:
    """跨多篇正文批量查卡片目标标题（一条 IN 查询）。"""
    ids: set[int] = set()
    for src in sources:
        ids |= collect_card_ids(src)
    if not ids:
        return {}
    from apps.knowledge.models import Document

    return dict(Document.objects.filter(pk__in=ids).values_list("id", "title"))


def default_link_meta(url: str) -> dict | None:
    """外链卡片元数据的默认 provider：复用 link_preview 抓取（SSRF 守卫 +
    24h 缓存），任何失败（含离线导出）返回 None → 域名简卡。"""
    from apps.editor.services.link_preview import fetch_link_preview_or_none

    return fetch_link_preview_or_none(url)


def _doc_card_html(doc_id: int, title: str | None) -> str:
    label = title or f"文档 #{doc_id}"
    # href 用 doc:ID —— render_markdown 末尾的 _rewrite_doc_links 会统一
    # 改成 #doc-ID 锚点，与 mention 链接行为一致
    return (
        '<div class="jz-doc-card">'
        f'<a class="doc-link" href="doc:{doc_id}">📄 {html.escape(label, quote=False)}</a>'
        "</div>"
    )


def _link_card_html(url: str, meta: dict | None) -> str:
    host = urlparse(url).hostname or url
    title = (meta or {}).get("title") or url
    site = (meta or {}).get("site_name") or host
    desc = (meta or {}).get("description") or ""
    desc_html = (
        f'<span class="jz-link-card-desc">{html.escape(desc, quote=False)}</span>'
        if desc
        else ""
    )
    return (
        f'<a class="jz-link-card" href="{html.escape(url)}">'
        f'<span class="jz-link-card-site-name">{html.escape(site, quote=False)}</span>'
        f'<span class="jz-link-card-title">{html.escape(title, quote=False)}</span>'
        f"{desc_html}"
        f'<span class="jz-link-card-url">{html.escape(url, quote=False)}</span>'
        "</a>"
    )


def convert_card_placeholders(
    src: str,
    *,
    doc_titles: dict[int, str] | None = None,
    link_meta: Callable[[str], dict | None] | None = None,
) -> str:
    """占位符行 → 卡片 HTML 块（HTML/PDF/static-site 路径）。"""
    if "[[doc-card:" not in src and "[[link-card:" not in src:
        return src
    titles = doc_titles or {}
    meta_fn = link_meta or (lambda _url: None)

    def repl(line: str) -> str | None:
        m = DOC_CARD_RE.match(line)
        if m:
            doc_id = int(m.group(1))
            return _doc_card_html(doc_id, titles.get(doc_id))
        m = LINK_CARD_RE.match(line)
        if m:
            url = m.group(1)
            return _link_card_html(url, meta_fn(url))
        return None

    return _map_card_lines(src, repl)


def degrade_card_placeholders(
    src: str,
    *,
    doc_titles: dict[int, str] | None = None,
) -> str:
    """占位符行 → 普通链接行（.md / docx 路径，绝不泄漏 ``[[``）。"""
    if "[[doc-card:" not in src and "[[link-card:" not in src:
        return src
    titles = doc_titles or {}

    def repl(line: str) -> str | None:
        m = DOC_CARD_RE.match(line)
        if m:
            doc_id = int(m.group(1))
            label = titles.get(doc_id) or f"文档 #{doc_id}"
            return f"[{label}](doc:{doc_id})"
        m = LINK_CARD_RE.match(line)
        if m:
            return f"<{m.group(1)}>"
        return None

    return _map_card_lines(src, repl)
