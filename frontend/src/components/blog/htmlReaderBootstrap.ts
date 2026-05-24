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
  '})();',
  '</scr', 'ipt>',
].join('');

/** Insert bootstrap right before ``</body>``; if absent, append at end. */
export function injectHtmlReaderBootstrap(html: string): string {
  if (!html) return HTML_READER_BOOTSTRAP;
  const m = /<\/body\s*>/i.exec(html);
  if (m) {
    return html.slice(0, m.index) + HTML_READER_BOOTSTRAP + html.slice(m.index);
  }
  return html + HTML_READER_BOOTSTRAP;
}
