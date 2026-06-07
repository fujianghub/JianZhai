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
from . import common

SITE_CSS = (
    common.export_stylesheet()
    + """
.site-layout { display: grid; grid-template-columns: 240px 1fr; gap: 32px; max-width: 1100px;
               margin: 24px auto; padding: 0 24px; }
.site-nav { position: sticky; top: 16px; align-self: start; max-height: 90vh; overflow: auto;
            font-size: 14px; line-height: 1.6; }
.site-nav a { color: #333; display: block; padding: 3px 0; }
.site-nav a.is-active { color: #1677ff; font-weight: 600; }
.site-search { margin-bottom: 16px; }
.site-search input { width: 100%; padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; }
.site-search-results { margin-top: 8px; }
.site-search-results a { display: block; padding: 6px 8px; border-radius: 4px; color: #333; }
.site-search-results a:hover { background: #f0f0f0; }
.site-search-results .hit-snippet { color: #999; font-size: 12px; margin-top: 2px; }
.site-footer { color: #999; text-align: center; padding: 32px 0; font-size: 13px; }
"""
)

INDEX_TEMPLATE = """\
<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>{site_title}</title>
<style>{css}</style></head><body>
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
<style>{css}</style></head><body>
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
    if (!matches.length){ results.innerHTML=''; return; }
    results.innerHTML = matches.slice(0,8).map(function(m){
      return '<a href="'+m.url+'"><div>'+m.title+'</div>'+
             '<div class="hit-snippet">'+(m.snippet||'')+'</div></a>';
    }).join('');
  }
  input.addEventListener('input', function(){
    var q = input.value.trim().toLowerCase();
    if (!q){ results.innerHTML=''; return; }
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
    # Only published+public-friendly content goes in a static site
    docs = [d for d in scope.documents if (d.published_content or "").strip()]
    if not docs and scope.documents:
        # Fall back to raw_content if nothing has been published yet — useful for local archives.
        docs = scope.documents

    diagram_svgs = common.build_scope_diagram_svgs(scope)
    nav_html = _render_nav(docs, current_id=None)
    recent_html = "".join(
        f'<li><a href="{_doc_filename(d)}">{common._escape(d.title)}</a></li>'
        for d in sorted(docs, key=lambda x: x.updated_at, reverse=True)[:20]
    )
    index_html = INDEX_TEMPLATE.format(
        site_title=common._escape(scope.label),
        css=SITE_CSS,
        nav=nav_html,
        intro="",
        recent=recent_html or "<li>（暂无文档）</li>",
        generated=datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"),
    )

    entries: list[tuple[str, bytes]] = [
        ("index.html", index_html.encode("utf-8")),
        ("search.js", SEARCH_JS.encode("utf-8")),
        ("robots.txt", b"User-agent: *\nAllow: /\n"),
    ]

    search_index = []
    asset_names: set[str] = set()
    for doc in docs:
        body_md = common.doc_export_body(doc)
        fname = _doc_filename(doc)
        # HTML-format docs are shipped verbatim — wrapping them in PAGE_TEMPLATE
        # would inject a second <html>/<head> and clobber the author's styling.
        # Site navigation remains reachable via index.html.
        if detect_doc_format(doc) == "html" and body_md.strip():
            html_out = common.rewrite_html_media(
                body_md, embed=False, asset_prefix="assets/"
            )
            entries.append((fname, html_out.encode("utf-8")))
            for asset_name, asset_data in common.collect_html_media(body_md):
                if asset_name not in asset_names:
                    asset_names.add(asset_name)
                    entries.append((asset_name, asset_data))
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
            doc, embed_media=False, diagram_svgs=diagram_svgs
        )
        for asset_name, asset_data in common.collect_markdown_media(body_md):
            if asset_name not in asset_names:
                asset_names.add(asset_name)
                entries.append((asset_name, asset_data))
        meta = doc.knowledge_base.name + (
            f" · {doc.published_at:%Y-%m-%d}" if doc.published_at else ""
        )
        per_nav = _render_nav(docs, current_id=doc.id)
        page = PAGE_TEMPLATE.format(
            title=common._escape(doc.title),
            site_title=common._escape(scope.label),
            css=SITE_CSS,
            nav=per_nav,
            meta=common._escape(meta),
            body=body_html,
            index_link="index.html",
            search_script="search.js",
        )
        entries.append((fname, page.encode("utf-8")))
        search_index.append(
            {
                "id": doc.id,
                "title": doc.title,
                "url": fname,
                "body": _plain_text(body_md)[:600],
            }
        )

    entries.append(("index.json", json.dumps(search_index, ensure_ascii=False).encode("utf-8")))
    entries.append(("sitemap.xml", _render_sitemap(docs).encode("utf-8")))
    entries.append(("feed.xml", _render_rss(scope, docs).encode("utf-8")))

    path = common.reserve_export_path(".zip")
    common.write_bytes(path, common.make_zip(entries))
    return path, f"{common.safe_slug(scope.label)}-site.zip", "application/zip"


def _doc_filename(doc: Document) -> str:
    return f"{common.safe_slug(doc.slug or doc.title)}-{doc.id}.html"


def _render_nav(docs: list[Document], current_id: int | None) -> str:
    lines = []
    for d in docs:
        href = _doc_filename(d)
        active = " class=\"is-active\"" if d.id == current_id else ""
        lines.append(f'<a href="{href}"{active}>{common._escape(d.title)}</a>')
    return "\n".join(lines)


def _plain_text(md: str) -> str:
    """Quick-and-dirty Markdown → plain text for the search snippet field."""
    text = re.sub(r"```.*?```", "", md or "", flags=re.S)
    text = re.sub(r"`[^`]*`", "", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"[#>*_\-]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _render_sitemap(docs: list[Document]) -> str:
    items = "\n".join(
        f"  <url><loc>{xml_escape(_doc_filename(d))}</loc>"
        f"<lastmod>{d.updated_at.strftime('%Y-%m-%d')}</lastmod></url>"
        for d in docs
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"  <url><loc>index.html</loc></url>\n{items}\n</urlset>"
    )


def _render_rss(scope: ExportScope, docs: list[Document]) -> str:
    site_title = xml_escape(scope.label)
    items_xml = []
    for d in sorted(docs, key=lambda x: x.published_at or x.updated_at, reverse=True)[:50]:
        pub = (d.published_at or d.updated_at).strftime("%a, %d %b %Y %H:%M:%S GMT")
        body = xml_escape(common.doc_export_body(d)[:1000])
        items_xml.append(
            f"<item><title>{xml_escape(d.title)}</title>"
            f"<link>{_doc_filename(d)}</link>"
            f"<pubDate>{pub}</pubDate>"
            f"<description>{body}</description></item>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>'
        f"<title>{site_title}</title>"
        f"<link>{xml_escape(getattr(settings, 'SITE_PUBLIC_URL', ''))}</link>"
        f"<description>{site_title}</description>"
        + "\n".join(items_xml)
        + "</channel></rss>"
    )
