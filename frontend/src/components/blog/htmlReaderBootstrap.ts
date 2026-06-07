import { withBaseHref, withSrcdocBase } from '@/utils/htmlPreview';

/** ES5 bootstrap injected into srcDoc HTML (raw_content-only fallback).
 *  Kept in a plain ``.ts`` file so ``</script>`` never appears inside ``.tsx``
 *  — some Vite/esbuild dev transforms treat that sequence as a tag terminator
 *  and break the parent module's default export. */
export const HTML_READER_BOOTSTRAP = [
  '<script>(function(){',
  'var seen={};',
  'function uniq(id){var x=id,i=1;while(seen[x]){i++;x=id+\'-\'+i;}seen[x]=1;return x;}',
  'function slug(t){return (t||\'\').trim().toLowerCase()',
  '  .replace(/[^\\w\\u4e00-\\u9fa5\\s-]/g,\'\').replace(/\\s+/g,\'-\').slice(0,80)',
  '  || \'h\'+Math.random().toString(36).slice(2,7);}',
  'function contentHeight(){',
  '  var d=document.documentElement,b=document.body;',
  '  return Math.max(d?d.scrollHeight:0,b?b.scrollHeight:0,d?d.offsetHeight:0,b?b.offsetHeight:0);',
  '}',
  'function builtInNav(){',
  '  try{',
  '    var links=document.querySelectorAll(\'aside a[href],nav a[href],[class*="toc"] a[href],[class*="sidebar"] a[href]\');',
  '    return links.length>=10;',
  '  }catch(e){return false;}',
  '}',
  'function scan(){',
  '  var hs=document.querySelectorAll(\'h1,h2,h3,h4,h5,h6\'),items=[];',
  '  for(var i=0;i<hs.length;i++){',
  '    var h=hs[i];if(!h.id)h.id=uniq(slug(h.textContent));',
  '    items.push({id:h.id,level:+h.tagName.charAt(1),',
  '      text:(h.textContent||\'\').trim(),',
  '      top:h.getBoundingClientRect().top+(window.pageYOffset||0)});',
  '  }',
  '  try{parent.postMessage({type:\'jz-html-meta\',',
  '    height:contentHeight(),headings:items,',
  '    plainText:(document.body&&document.body.innerText||\'\').slice(0,200000),',
  '    hasBuiltInNav:builtInNav()},\'*\');',
  '  }catch(e){}',
  '}',
  'function ready(fn){document.readyState===\'complete\'?fn():window.addEventListener(\'load\',fn);}',
  'try{',
  '  if(!document.getElementById(\'jz-vh-override\')){',
  '    var s=document.createElement(\'style\'); s.id=\'jz-vh-override\';',
  '    s.textContent=\':where(.hero,[class*="hero"],.cover,[class*="cover"],\'+',
  '                  \'.banner,[class*="banner"]){min-height:0 !important;}\'+',
  '                  \':where(body,html){min-height:0 !important;}\';',
  '    (document.head||document.documentElement).appendChild(s);',
  '  }',
  '}catch(e){}',
  'var pending=0;',
  'function scheduleScan(){if(pending)return;pending=setTimeout(function(){pending=0;scan();},50);}',
  'ready(scan);',
  'if(window.ResizeObserver){try{new ResizeObserver(scheduleScan).observe(document.documentElement);}catch(e){}}',
  'window.addEventListener(\'message\',function(e){',
  '  if(e&&e.data&&e.data.type===\'jz-scroll-to\'){',
  '    var el=document.getElementById(e.data.id);if(el)el.scrollIntoView({block:\'start\'});',
  '  }',
  '});',
  // In-document anchor clicks must scroll in place: with an http(s) <base>
  // (attachment mode) a plain "#sec" link would otherwise resolve to the
  // base URL and navigate the iframe to the raw file, losing this bootstrap.
  'document.addEventListener(\'click\',function(e){',
  '  var t=e.target;',
  '  while(t&&t!==document&&!(t.tagName&&t.tagName.toLowerCase()===\'a\'))t=t.parentNode;',
  '  if(!t||t===document)return;',
  '  var href=t.getAttribute(\'href\')||\'\';',
  '  if(href.charAt(0)===\'#\'){',
  '    e.preventDefault();',
  '    var el=document.getElementById(href.slice(1));',
  '    if(el)el.scrollIntoView({block:\'start\'});',
  '  }',
  '},true);',
  '})();',
  '</scr', 'ipt>',
].join('');

/** Insert bootstrap right before ``</body>``; if absent, append at end.
 *
 *  Also injects a `<base>`: ``about:srcdoc`` for raw_content HTML (default),
 *  or the attachment's own URL when ``baseHref`` is given — fetched-attachment
 *  mode renders via srcDoc inside an opaque-origin sandbox, and the http(s)
 *  base makes ``./assets/x.css`` and ``/media/...`` resolve exactly like the
 *  old ``<iframe src>`` did. */
export function injectHtmlReaderBootstrap(html: string, baseHref?: string): string {
  const withBase = (s: string) => (baseHref ? withBaseHref(s, baseHref) : withSrcdocBase(s));
  if (!html) return withBase('') + HTML_READER_BOOTSTRAP;
  const based = withBase(html);
  const m = /<\/body\s*>/i.exec(based);
  if (m) {
    return based.slice(0, m.index) + HTML_READER_BOOTSTRAP + based.slice(m.index);
  }
  return based + HTML_READER_BOOTSTRAP;
}
