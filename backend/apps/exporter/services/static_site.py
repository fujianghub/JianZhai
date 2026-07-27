"""Static site export — per-document HTML pages + index + static search index + RSS."""
from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape

from django.conf import settings

from apps.knowledge.models import Document
from apps.knowledge.serializers import detect_doc_format

from ..scope import ExportScope
from . import common, diagram_render

SITE_CSS = (
    common.export_stylesheet()
    + """
.site-layout { display: grid; grid-template-columns: 240px 1fr; gap: 32px; max-width: 1100px;
               margin: 24px auto; padding: 0 24px; }
.site-nav { position: sticky; top: 16px; align-self: start; max-height: 90vh; overflow: auto;
            font-size: 14px; line-height: 1.6; }
.site-nav a { color: #333; display: block; padding: 3px 0; }
.site-nav a.is-active { color: #1677ff; font-weight: 600; }
.site-nav ol { list-style: none; padding-left: 0; margin: 0; }
.site-nav li { margin-left: calc(var(--toc-depth, 0) * 12px); }
.site-nav .export-toc-folder { color: #999; font-size: 12px; margin-top: 8px; }
.site-search { margin-bottom: 16px; }
.site-search input { width: 100%; padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; }
.site-search-results { margin-top: 8px; }
.site-search-results a { display: block; padding: 6px 8px; border-radius: 4px; color: #333; }
.site-search-results a:hover { background: #f0f0f0; }
.site-search-results .hit-snippet { color: #999; font-size: 12px; margin-top: 2px; }
.site-footer { color: #999; text-align: center; padding: 32px 0; font-size: 13px; }
"""
)

# Shared stylesheets are emitted once as style.css / katex.css and referenced
# with <link> from every page — inlining them per page multiplied ~24KB of
# site CSS (plus ~420KB of base64 KaTeX fonts when formulas exist) by the
# number of documents in the archive.
INDEX_TEMPLATE = """\
<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>{site_title}</title>
{head_links}</head><body>
<div class="site-layout">
<aside class="site-nav">
<div class="site-search"><input id="search" placeholder="搜索..."></div>
<div class="site-search-results" id="results"></div>
<h3>所有文档</h3>
{nav}
</aside>
<main>
<h1>{site_title}</h1>
{intro}
<h2>最近更新</h2>
<ul>
{recent}
</ul>
</main>
</div>
<div class="site-footer">由 简斋 / JianZhai 生成 · {generated}</div>
<script src="search.js" defer></script>
</body></html>
"""

PAGE_TEMPLATE = """\
<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>{title} · {site_title}</title>
{head_links}</head><body>
<div class="site-layout">
<aside class="site-nav">
<div class="site-search"><input id="search" placeholder="搜索..."></div>
<div class="site-search-results" id="results"></div>
{nav}
</aside>
<main>
<article class="post">
<h1>{title}</h1>
<div class="post-meta">{meta}</div>
{body}
</article>
</main>
</div>
<div class="site-footer"><a href="{index_link}">← 返回首页</a></div>
<script src="{search_script}" defer></script>
</body></html>
"""

SEARCH_JS = """\
(function(){
  function get(url, cb){
    var x = new XMLHttpRequest();
    x.open('GET', url); x.responseType = 'json';
    x.onload = function(){ cb(x.response); };
    x.send();
  }
  var input = document.getElementById('search');
  var results = document.getElementById('results');
  if (!input || !results) return;
  var docs = [];
  get('index.json', function(data){ docs = data || []; });
  function render(matches){
    // Build results via DOM APIs + textContent — doc titles/snippets are
    // author content and must never reach innerHTML (stored XSS once the
    // site is deployed to a real origin).
    results.textContent = '';
    matches.slice(0,8).forEach(function(m){
      var a = document.createElement('a');
      a.href = m.url;
      var t = document.createElement('div');
      t.textContent = m.title;
      var s = document.createElement('div');
      s.className = 'hit-snippet';
      s.textContent = m.snippet || '';
      a.appendChild(t);
      a.appendChild(s);
      results.appendChild(a);
    });
  }
  input.addEventListener('input', function(){
    var q = input.value.trim().toLowerCase();
    if (!q){ results.textContent=''; return; }
    var matches = docs.filter(function(d){
      var hay = (d.title + ' ' + (d.body||'')).toLowerCase();
      return hay.indexOf(q) >= 0;
    }).map(function(d){
      var idx = (d.body||'').toLowerCase().indexOf(q);
      var snippet = idx >= 0 ? d.body.substr(Math.max(0,idx-40), 120) : '';
      return {title:d.title, url:d.url, snippet:snippet};
    });
    render(matches);
  });
})();
"""


def export(scope: ExportScope) -> tuple[Path, str, str]:
    # Only published content goes in a static site — a deployable artifact.
    # Deliberately NO fallback to raw_content: raw is the private working copy
    # (same fail-closed stance as blog's resolve_published_html_body). A KB
    # with nothing published yields a stub index, never draft text.
    docs = [d for d in scope.documents if (d.published_content or "").strip()]

    from apps.exporter.anthology_tree import render_toc_list_html

    fname_by_id = {d.id: _doc_filename(d) for d in docs}
    # One shared nav for every page (folder tree, no per-page active state) —
    # re-rendering it per document was O(N²) on large KBs.
    nav_html = "<ol>" + render_toc_list_html(
        scope.kb, docs, doc_href=lambda dd: fname_by_id[dd["id"]]
    ) + "</ol>" if docs else ""
    recent_html = "".join(
        f'<li><a href="{_doc_filename(d)}">{common._escape(d.title)}</a></li>'
        for d in sorted(docs, key=lambda x: x.updated_at, reverse=True)[:20]
    )
    index_html = INDEX_TEMPLATE.format(
        site_title=common._escape(scope.label),
        head_links='<link rel="stylesheet" href="style.css">',
        nav=nav_html,
        intro="",
        recent=recent_html or "<li>（暂无文档）</li>",
        generated=datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"),
    )

    # search_index is the only state that must outlive the per-doc loop (it
    # feeds index.json/sitemap/feed at the end). It holds just title/url + a
    # 600-char snippet per doc — small. Everything else (rendered page bodies,
    # media bytes) is yielded and freed one doc at a time so a large KB export
    # never holds the whole site in memory; the zip is streamed straight to disk.
    search_index: list[dict] = []

    # Render Mermaid → SVG once (one headless-Chromium launch) up front; the map
    # is small text and shared across the streamed per-doc renders below.
    diagram_svgs = common.build_scope_diagram_svgs(scope)
    # 同理批量预渲染 KaTeX 公式；有公式时 katex.css（内嵌字体）作为共享文件只出一份。
    math_html = common.build_scope_math_html(scope)
    math_css = common.math_stylesheet_if(math_html)
    page_head_links = '<link rel="stylesheet" href="style.css">'
    if math_css:
        page_head_links += '\n<link rel="stylesheet" href="katex.css">'

    def _entries():
        asset_names: set[str] = set()
        yield ("index.html", index_html.encode("utf-8"))
        yield ("style.css", SITE_CSS.encode("utf-8"))
        if math_css:
            yield ("katex.css", math_css.encode("utf-8"))
        yield ("search.js", SEARCH_JS.encode("utf-8"))
        yield ("robots.txt", b"User-agent: *\nAllow: /\n")

        for doc in docs:
            body_md = common.doc_export_body(doc)
            fname = _doc_filename(doc)
            # HTML-format docs are shipped verbatim — wrapping them in
            # PAGE_TEMPLATE would inject a second <html>/<head> and clobber the
            # author's styling. Site navigation remains reachable via index.html.
            if detect_doc_format(doc) == "html" and body_md.strip():
                inlined = diagram_render.inline_html_mermaid(body_md, diagram_svgs)
                html_out = common.rewrite_html_media(
                    inlined, embed=False, asset_prefix="assets/"
                )
                yield (fname, html_out.encode("utf-8"))
                for asset_name, asset_data in common.collect_html_media(body_md):
                    if asset_name not in asset_names:
                        asset_names.add(asset_name)
                        yield (asset_name, asset_data)
                search_index.append(
                    {
                        "id": doc.id,
                        "title": doc.title,
                        "url": fname,
                        "body": common.html_to_plain_text(body_md)[:600],
                    }
                )
                continue

            body_html = common.render_document_body_html(
                doc, embed_media=False, diagram_svgs=diagram_svgs, math_html=math_html
            )
            # Cross-document mentions render as #doc-N anchors (anthology
            # convention) — dead in a multi-file site. Point them at the
            # actual per-doc pages; targets outside the archive keep the
            # anchor (harmless no-op on click).
            body_html = re.sub(
                r'href="#doc-(\d+)"',
                lambda m: (
                    f'href="{fname_by_id[int(m.group(1))]}"'
                    if int(m.group(1)) in fname_by_id
                    else m.group(0)
                ),
                body_html,
            )
            for asset_name, asset_data in common.collect_markdown_media(body_md):
                if asset_name not in asset_names:
                    asset_names.add(asset_name)
                    yield (asset_name, asset_data)
            meta = doc.knowledge_base.name + (
                f" · {doc.published_at:%Y-%m-%d}" if doc.published_at else ""
            )
            page = PAGE_TEMPLATE.format(
                title=common._escape(doc.title),
                site_title=common._escape(scope.label),
                head_links=page_head_links,
                nav=nav_html,
                meta=common._escape(meta),
                body=body_html,
                index_link="index.html",
                search_script="search.js",
            )
            yield (fname, page.encode("utf-8"))
            search_index.append(
                {
                    "id": doc.id,
                    "title": doc.title,
                    "url": fname,
                    "body": _plain_text(body_md)[:600],
                }
            )

        # By now the loop above has fully populated search_index.
        yield ("index.json", json.dumps(search_index, ensure_ascii=False).encode("utf-8"))
        yield ("sitemap.xml", _render_sitemap(docs).encode("utf-8"))
        yield ("feed.xml", _render_rss(scope, docs).encode("utf-8"))

    path = common.reserve_export_path(".zip")
    common.stream_zip_to_path(path, _entries())
    return path, common.build_export_filename(scope, ".zip", tag="site"), "application/zip"


def _doc_filename(doc: Document) -> str:
    return f"{common.safe_slug(doc.slug or doc.title)}-{doc.id}.html"


def _site_base_url() -> str:
    """Public base for sitemap/RSS absolute URLs (both specs require them).

    Falls back to empty (relative links) when SITE_PUBLIC_URL isn't set.
    """
    base = (getattr(settings, "SITE_PUBLIC_URL", "") or "").strip()
    return base.rstrip("/") + "/" if base else ""


def _plain_text(md: str) -> str:
    """Quick-and-dirty Markdown → plain text for the search snippet field."""
    text = re.sub(r"```.*?```", "", md or "", flags=re.S)
    text = re.sub(r"`[^`]*`", "", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"[#>*_\-]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _render_sitemap(docs: list[Document]) -> str:
    base = _site_base_url()
    items = "\n".join(
        f"  <url><loc>{xml_escape(base + _doc_filename(d))}</loc>"
        f"<lastmod>{d.updated_at.strftime('%Y-%m-%d')}</lastmod></url>"
        for d in docs
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"  <url><loc>{xml_escape(base + 'index.html')}</loc></url>\n{items}\n</urlset>"
    )


def _render_rss(scope: ExportScope, docs: list[Document]) -> str:
    base = _site_base_url()
    site_title = xml_escape(scope.label)
    now = datetime.now(UTC).strftime("%a, %d %b %Y %H:%M:%S GMT")
    items_xml = []
    for d in sorted(docs, key=lambda x: x.published_at or x.updated_at, reverse=True)[:50]:
        pub = (d.published_at or d.updated_at).strftime("%a, %d %b %Y %H:%M:%S GMT")
        link = xml_escape(base + _doc_filename(d))
        # Description from *published* content only, as readable plain text —
        # never raw_content, and never unrendered markdown source.
        summary = xml_escape(_plain_text(d.published_content or "")[:1000])
        items_xml.append(
            f"<item><title>{xml_escape(d.title)}</title>"
            f"<link>{link}</link>"
            f'<guid isPermaLink="false">jianzhai-doc-{d.id}</guid>'
            f"<pubDate>{pub}</pubDate>"
            f"<description>{summary}</description></item>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>'
        f"<title>{site_title}</title>"
        f"<link>{xml_escape(getattr(settings, 'SITE_PUBLIC_URL', ''))}</link>"
        f"<description>{site_title}</description>"
        f"<lastBuildDate>{now}</lastBuildDate>"
        + "\n".join(items_xml)
        + "</channel></rss>"
    )
