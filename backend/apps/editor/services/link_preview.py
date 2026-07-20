"""外部 URL 链接卡片预览抓取服务。

抓取目标网页的 <meta og:*> + <title> + 描述 + 首张图，供两处调用：

- ``apps.editor.views.link_preview``：编辑器/阅读端实时取卡片元数据；
- ``apps.exporter``：导出 HTML/PDF 时把 ``[[link-card:URL]]`` 渲染成静态卡片。

安全：限制只抓取 http(s)；域名解析后过滤内网 IP（复用 image_mirror 的
SSRF 守卫）；超时 5 秒；大小限制 500KB。结果经 Django cache 缓存 1 天，
防止重复抓取相同 URL。
"""

from __future__ import annotations

import re
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen
from urllib.error import URLError

from django.core.cache import cache

from .image_mirror import _is_safe_host

FETCH_TIMEOUT_SEC = 5
MAX_HTML_BYTES = 500_000
CACHE_TTL_SEC = 24 * 3600


class LinkPreviewError(Exception):
    """抓取/校验失败；``status`` 供 view 层映射 HTTP 状态码。"""

    def __init__(self, detail: str, status: int = 400) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status = status


class _OGParser(HTMLParser):
    """极简 HTML 解析器，只拿我们关心的 meta + title。"""

    def __init__(self) -> None:
        super().__init__()
        self.in_title = False
        self.title_chunks: list[str] = []
        self.meta: dict[str, str] = {}
        self.icon: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]):
        tag = tag.lower()
        attrs_d = {k.lower(): (v or "") for k, v in attrs}
        if tag == "title":
            self.in_title = True
        elif tag == "meta":
            prop = attrs_d.get("property") or attrs_d.get("name") or ""
            content = attrs_d.get("content")
            if prop and content:
                self.meta[prop.lower()] = content
        elif tag == "link":
            rel = (attrs_d.get("rel") or "").lower()
            if "icon" in rel.split():
                self.icon = attrs_d.get("href")

    def handle_endtag(self, tag: str):
        if tag.lower() == "title":
            self.in_title = False

    def handle_data(self, data: str):
        if self.in_title:
            self.title_chunks.append(data)


def fetch_link_preview(url: str) -> dict:
    """抓取 URL 的 OG 卡片信息，返回
    ``{url, title, description, image, site_name, favicon}``。

    校验失败抛 ``LinkPreviewError(status=400)``，抓取失败抛
    ``LinkPreviewError(status=502)``。
    """
    url = (url or "").strip()
    if not url:
        raise LinkPreviewError("缺少 url 参数")
    if not (url.startswith("http://") or url.startswith("https://")):
        raise LinkPreviewError("url 必须以 http:// 或 https:// 开头")
    if len(url) > 2000:
        raise LinkPreviewError("url 过长")

    cache_key = f"link-preview:{url}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    parsed = urlparse(url)
    host = parsed.hostname or ""
    if not host or not _is_safe_host(host):
        raise LinkPreviewError("目标地址不可达或处于内网")

    try:
        req = Request(
            url,
            headers={
                "User-Agent": "JianZhai-LinkPreview/1.0 (+https://github.com/fujianghub/JianZhai)",
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            },
        )
        with urlopen(req, timeout=FETCH_TIMEOUT_SEC) as resp:
            ctype = (resp.headers.get("Content-Type") or "").lower()
            if "html" not in ctype:
                raise LinkPreviewError("目标不是 HTML 页面")
            raw = resp.read(MAX_HTML_BYTES)
    except LinkPreviewError:
        raise
    except URLError as e:
        raise LinkPreviewError(f"无法访问目标：{e}", status=502) from e
    except Exception as e:  # noqa: BLE001
        raise LinkPreviewError(f"抓取失败：{e}", status=502) from e

    # 尝试以 UTF-8 解码，失败则猜测 GBK
    try:
        html = raw.decode("utf-8", errors="replace")
    except Exception:
        try:
            html = raw.decode("gbk", errors="replace")
        except Exception:
            html = raw.decode("latin-1", errors="replace")

    parser = _OGParser()
    try:
        parser.feed(html)
    except Exception:  # noqa: BLE001
        pass

    title = (parser.meta.get("og:title") or "".join(parser.title_chunks)).strip()[:200]
    desc = (
        parser.meta.get("og:description")
        or parser.meta.get("description")
        or parser.meta.get("twitter:description")
        or ""
    ).strip()[:300]
    image = parser.meta.get("og:image") or parser.meta.get("twitter:image") or ""
    site_name = (parser.meta.get("og:site_name") or host).strip()[:80]
    favicon = parser.icon or "/favicon.ico"

    # 相对路径补全
    if image and not image.startswith(("http://", "https://")):
        image = urljoin(url, image)
    if favicon and not favicon.startswith(("http://", "https://")):
        favicon = urljoin(url, favicon)

    # 标题简单清理（多空格 / 换行）
    title = re.sub(r"\s+", " ", title) or host

    data = {
        "url": url,
        "title": title,
        "description": desc,
        "image": image,
        "site_name": site_name,
        "favicon": favicon,
    }
    cache.set(cache_key, data, timeout=CACHE_TTL_SEC)
    return data


def fetch_link_preview_or_none(url: str) -> dict | None:
    """导出端友好包装：任何失败（含离线）返回 None，绝不抛异常。"""
    try:
        return fetch_link_preview(url)
    except Exception:  # noqa: BLE001
        return None
