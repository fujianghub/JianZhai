"""Single-file HTML export.

Multi-document scopes render as an *anthology*: a fixed left TOC plus one
``.export-doc-panel`` shown at a time. HTML-format documents embed in a
style-isolated ``iframe[srcdoc]`` (interactive) or flatten to inline styles +
body (print); Markdown documents render through ``markdown_render``.
"""
from __future__ import annotations

from pathlib import Path

from apps.knowledge.serializers import detect_doc_format

from ..scope import ExportScope
from . import common


def render_html(scope: ExportScope, *, mode: str = "interactive") -> str:
    """Render the scope to a single HTML page.

    ``mode="interactive"`` ships the TOC-switching JS and iframe panels;
    ``mode="print"`` reveals every panel, drops the TOC, and flattens HTML docs
    for headless-Chromium pagination (used by the PDF exporter).
    """
    if len(scope.documents) <= 1:
        return _render_single(scope, mode=mode)
    return _render_anthology(scope, mode=mode)


def _render_single(scope: ExportScope, *, mode: str) -> str:
    if scope.documents:
        doc = scope.documents[0]
        inner = common.render_document_body_html(doc, embed_media=True, export_mode=mode)
        body = (
            f"<h1>{common._escape(doc.title)}</h1>\n"
            f"{common._doc_meta_html(doc)}\n{inner}"
        )
    else:
        body = ""
    return common.HTML_SHELL.format(
        title=common._escape(scope.label),
        css=common.export_stylesheet() + common.load_export_anthology_css(),
        body_class="",
        body=body,
    )


def _render_anthology(scope: ExportScope, *, mode: str) -> str:
    is_print = mode == "print"
    panels = common.doc_panels_html(scope, export_mode=mode)
    toc = "" if is_print else _build_toc(scope)
    script = "" if is_print else f"<script>{ANTHOLOGY_JS}</script>"
    return ANTHOLOGY_SHELL.format(
        title=common._escape(scope.label),
        css=common.export_stylesheet() + common.load_export_anthology_css(),
        print_class=" is-print" if is_print else "",
        toc=toc,
        panels=panels,
        script=script,
    )


def _build_toc(scope: ExportScope) -> str:
    items = "\n".join(
        f'<li><a href="#doc-{doc.id}">{common._escape(doc.title)}</a></li>'
        for doc in scope.documents
    )
    return (
        '<nav class="export-toc" aria-label="目录">'
        '<div class="export-toc-title">目录</div>'
        f"<ol>{items}</ol>"
        '<div class="export-toc-resizer" role="separator" '
        'aria-label="调整目录宽度" tabindex="0"></div>'
        "</nav>"
    )


ANTHOLOGY_SHELL = """\
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>{title}</title>
<style>{css}</style>
</head>
<body class="export-anthology{print_class}">
{toc}
<main class="export-main">
{panels}
</main>
{script}
</body>
</html>
"""

# Inlined into the interactive anthology: TOC click switches the visible panel,
# intra-doc ``#doc-N`` links do the same, visible HTML iframes are sized to
# their content height, and the TOC column is drag-resizable (localStorage).
# Kept ES5-ish so it runs even in old offline viewers.
ANTHOLOGY_JS = """
(function(){
  var TOC_MIN = 180;
  var TOC_MAX = 480;
  var TOC_DEFAULT = 248;
  var TOC_KEY = 'jz-export-toc-width';
  var toc = document.querySelector('.export-toc');
  var resizer = document.querySelector('.export-toc-resizer');
  var panels = document.querySelectorAll('.export-doc-panel');
  function sizeFrames(panel){
    if(!panel) return;
    var frames = panel.querySelectorAll('iframe.export-html-frame');
    for(var i=0;i<frames.length;i++){
      try{
        var d = frames[i].contentDocument;
        if(d && d.documentElement){
          frames[i].style.height = (d.documentElement.scrollHeight + 8) + 'px';
        }
      }catch(e){}
    }
  }
  function visiblePanel(){
    for(var i=0;i<panels.length;i++){
      if(!panels[i].hidden) return panels[i];
    }
    return null;
  }
  function clampTocWidth(w){
    return Math.max(TOC_MIN, Math.min(TOC_MAX, Math.round(w)));
  }
  function setTocWidth(w, persist){
    var width = clampTocWidth(w);
    document.documentElement.style.setProperty('--export-toc-width', width + 'px');
    if(persist){
      try{ localStorage.setItem(TOC_KEY, String(width)); }catch(e){}
    }
    sizeFrames(visiblePanel());
    return width;
  }
  function readStoredTocWidth(){
    try{
      var raw = localStorage.getItem(TOC_KEY);
      if(raw){ return clampTocWidth(parseInt(raw, 10)); }
    }catch(e){}
    return TOC_DEFAULT;
  }
  function showPanel(id){
    for(var i=0;i<panels.length;i++){ panels[i].hidden = (panels[i].id !== id); }
    if(toc){
      var links = toc.querySelectorAll('a');
      for(var j=0;j<links.length;j++){
        var on = links[j].getAttribute('href') === '#' + id;
        if(on){ links[j].classList.add('active'); } else { links[j].classList.remove('active'); }
      }
    }
    sizeFrames(document.getElementById(id));
    window.scrollTo(0,0);
  }
  if(resizer){
    setTocWidth(readStoredTocWidth(), false);
    var dragging = false;
    var startX = 0;
    var startW = TOC_DEFAULT;
    function onMove(clientX){
      setTocWidth(startW + (clientX - startX), false);
    }
    function stopDrag(){
      if(!dragging) return;
      dragging = false;
      resizer.classList.remove('is-dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      var current = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--export-toc-width'),
        10
      );
      setTocWidth(current || TOC_DEFAULT, true);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', stopDrag);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', stopDrag);
    }
    function onMouseMove(e){ if(dragging) onMove(e.clientX); }
    function onTouchMove(e){
      if(dragging && e.touches && e.touches[0]) onMove(e.touches[0].clientX);
    }
    function startDrag(clientX){
      dragging = true;
      startX = clientX;
      startW = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--export-toc-width'),
        10
      ) || TOC_DEFAULT;
      resizer.classList.add('is-dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    resizer.addEventListener('mousedown', function(e){
      e.preventDefault();
      startDrag(e.clientX);
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', stopDrag);
    });
    resizer.addEventListener('touchstart', function(e){
      if(!e.touches || !e.touches[0]) return;
      startDrag(e.touches[0].clientX);
      document.addEventListener('touchmove', onTouchMove, {passive:false});
      document.addEventListener('touchend', stopDrag);
    }, {passive:true});
    resizer.addEventListener('keydown', function(e){
      var step = e.shiftKey ? 32 : 8;
      var current = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--export-toc-width'),
        10
      ) || TOC_DEFAULT;
      if(e.key === 'ArrowLeft'){ e.preventDefault(); setTocWidth(current - step, true); }
      else if(e.key === 'ArrowRight'){ e.preventDefault(); setTocWidth(current + step, true); }
    });
  }
  document.addEventListener('click', function(e){
    var a = e.target.closest ? e.target.closest('a[href^="#doc-"]') : null;
    if(!a) return;
    var id = a.getAttribute('href').slice(1);
    if(!document.getElementById(id)) return;
    e.preventDefault();
    showPanel(id);
    if(history.replaceState){ history.replaceState(null,'',a.getAttribute('href')); }
  });
  var frames = document.querySelectorAll('iframe.export-html-frame');
  for(var i=0;i<frames.length;i++){
    frames[i].addEventListener('load', function(){
      var p = this.closest ? this.closest('.export-doc-panel') : null;
      if(p && !p.hidden) sizeFrames(p);
    });
  }
  var initial = (location.hash || '').slice(1);
  if(initial && document.getElementById(initial)){ showPanel(initial); }
  else if(panels.length){ showPanel(panels[0].id); }
})();
"""


def export(scope: ExportScope) -> tuple[Path, str, str]:
    # Single-doc HTML export of an HTML-format document → preserve the source
    # verbatim. Wrapping it in our shell would double the <html>/<head> tags
    # and lose the author's original styling.
    if len(scope.documents) == 1:
        doc = scope.documents[0]
        body = common.doc_export_body(doc)
        if detect_doc_format(doc) == "html" and body.strip():
            path = common.reserve_export_path(".html")
            common.write_text(path, common.rewrite_html_media(body))
            return (
                path,
                f"{common.safe_slug(doc.title)}.html",
                "text/html; charset=utf-8",
            )
    html = render_html(scope)
    path = common.reserve_export_path(".html")
    common.write_text(path, html)
    return path, f"{common.safe_slug(scope.label)}.html", "text/html; charset=utf-8"
