r"""Server-side KaTeX → HTML rendering for offline HTML/PDF/site export.

离线导出不带 JavaScript，``$$..$$`` / ``$..$`` 过去要么被 CommonMark 吃成残破
字面量、要么（tokenizer 修复后）降级为源码 span。本模块与 ``diagram_render``
同构：用驱动 PDF 导出的同一个 headless Chromium 把全 scope 的公式批量预渲染
成 KaTeX HTML（一次浏览器启动渲染全部公式），``markdown_render`` 的
``math_html`` env 在渲染期按 ``_math_key`` 查表内联。

KaTeX bundle vendor 在 ``static/vendor/katex/``（与前端同版本 0.16），后端容器
无需 node_modules。字体以 base64 data URI 内嵌进 ``katex_stylesheet()``——导出
物单文件离线可显，PDF 导出的子资源闸门（仅放公网 http）也拦不到它。

一切优雅降级：Playwright/Chromium 缺失或单条公式渲染失败时，该公式从 map
缺席，调用方回退到转义源码 span（公式原文完好）。
"""
from __future__ import annotations

import base64
import logging
import re
from functools import lru_cache
from pathlib import Path

log = logging.getLogger(__name__)

_RENDER_TIMEOUT_MS = 10_000

_STATIC = Path(__file__).resolve().parent.parent / "static" / "vendor" / "katex"


@lru_cache(maxsize=1)
def _katex_bundle() -> str:
    return (_STATIC / "katex.min.js").read_text(encoding="utf-8")


# 与前端 ``markdown.ts katexPlugin`` 完全相同的渲染参数：throwOnError:false 把
# 坏公式渲成红字而非抛异常；output:'html' 跳过 MathML twin（导出物更小，且与
# 阅读端产物一致）。
_RENDER_JS = (
    "(args) => window.katex.renderToString(args[0], "
    "{displayMode: args[1], throwOnError: false, output: 'html'})"
)


def math_key(latex: str, display: bool) -> str:
    """镜像 ``markdown_render._math_key`` —— 渲染键与查找键的唯一格式。"""
    return ("D:" if display else "I:") + latex


def render_katex_html(sources: list[tuple[str, bool]]) -> dict[str, str]:
    """把 ``(latex, display)`` 列表批量渲染为 ``{math_key: katex_html}``。

    单条失败仅缺席该条；Playwright/Chromium 不可用时返回空 map，调用方全部
    回退源码 span。
    """
    distinct = list(dict.fromkeys((s, d) for s, d in sources if s and s.strip()))
    if not distinct:
        return {}

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        log.info("math_render: Playwright unavailable; math stays as source spans.")
        return {}

    out: dict[str, str] = {}
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
            )
            try:
                page = browser.new_page()
                page.set_default_timeout(_RENDER_TIMEOUT_MS)
                page.set_content(
                    "<!doctype html><html><head><meta charset='utf-8'>"
                    "</head><body></body></html>"
                )
                page.add_script_tag(content=_katex_bundle())
                for latex, display in distinct:
                    try:
                        html_str = page.evaluate(_RENDER_JS, [latex, display])
                        if html_str:
                            out[math_key(latex, display)] = html_str
                    except Exception as exc:  # 一条坏公式不拖垮其余
                        log.warning(
                            "math_render: katex render failed (%s): %.160s",
                            type(exc).__name__,
                            str(exc),
                        )
            finally:
                browser.close()
    except Exception:
        # 浏览器启动本身失败（无 Chromium、沙箱、OOM…）
        log.exception("math_render: headless Chromium unavailable; falling back.")
        return out
    return out


# katex.min.css 的每条 @font-face 列 woff2/woff/ttf 三源。离线单文件导出只留
# woff2（Chromium 打印与所有现代浏览器均支持）并内嵌为 data URI。
_FONT_SRC = re.compile(r'src:url\(fonts/([\w-]+\.woff2)\) format\("woff2"\)[^;}]*')


@lru_cache(maxsize=1)
def katex_stylesheet() -> str:
    """KaTeX CSS，woff2 字体 base64 内嵌（约 420KB，仅含公式的导出才注入）。"""
    css = (_STATIC / "katex.min.css").read_text(encoding="utf-8")

    def _inline(m: re.Match) -> str:
        font_path = _STATIC / "fonts" / m.group(1)
        try:
            b64 = base64.b64encode(font_path.read_bytes()).decode("ascii")
        except OSError:
            return m.group(0)
        return f'src:url(data:font/woff2;base64,{b64}) format("woff2")'

    return _FONT_SRC.sub(_inline, css)
