// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_EPUB_PREFS,
  EPUB_PAPERS,
  EPUB_TURN_OPTIONS,
  RAIL_WIDTH_DEFAULT,
  filterTocEntries,
  formatMinutes,
  splitTocTitle,
  DEFAULT_TOC_PREFS,
  repairTocPrefs,
  addCalibration,
  bytesPerPage,
  estimateTocPages,
  paperFor,
  tokenSpansFromHast,
  buildFontMappingCss,
  classifyFontFamily,
  clampRailWidth,
  cssColorLuminance,
  defaultExpandedTocKeys,
  resolveColumns,
  tocAncestorKeys,
  tocHasChildren,
  visibleTocEntries,
  EPUB_POSITION_MAX_ENTRIES,
  bookEmbedsFonts,
  buildEpubUserCss,
  defaultFlowFor,
  epubPositionKey,
  flattenEpubToc,
  formatEpubProgress,
  loadEpubPosition,
  loadEpubPrefs,
  pickActiveTocId,
  pruneEpubPositions,
  legacyEpubFontKey,
  saveEpubPosition,
  saveEpubPrefs,
  stripEpubScripts,
} from './epubReader';

describe('flattenEpubToc', () => {
  it('flattens nested items with 1-based levels and stable keys', () => {
    const toc = [
      { label: '第一章', href: 'c1.html', id: 0, subitems: [{ label: ' 1.1  节 ', href: 'c1.html#s1', id: 1 }] },
      { label: '', subitems: [] },
    ];
    expect(flattenEpubToc(toc)).toEqual([
      { key: '0', title: '第一章', href: 'c1.html', level: 1, id: 0 },
      { key: '0.0', title: '1.1 节', href: 'c1.html#s1', level: 2, id: 1 },
      { key: '1', title: '（无标题）', href: null, level: 1, id: null },
    ]);
  });

  it('respects maxLevel and tolerates null', () => {
    const toc = [{ label: 'a', subitems: [{ label: 'b', subitems: [{ label: 'c' }] }] }];
    expect(flattenEpubToc(toc, 2).map((e) => e.title)).toEqual(['a', 'b']);
    expect(flattenEpubToc(null)).toEqual([]);
  });
});

describe('pickActiveTocId', () => {
  const e = (id: number, href = `c${id}.html`) => ({ key: String(id), title: `t${id}`, href, level: 1, id });
  // entries 0 (section 0), 1–3 (section 1 with fragments), 4 (section 2)
  const entries = [e(0), e(1, 'c1.html'), e(2, 'c1.html#s2'), e(3, 'c1.html#s3'), e(4)];
  const sectionOf = [0, 1, 1, 1, 2];

  it('picks the last heading at or before the range start (not the last visible one)', () => {
    // 1 and 2 are before/at the top of the page, 3 is further down but visible
    const pos: Record<number, number> = { 1: -1, 2: 0, 3: 1 };
    expect(pickActiveTocId(entries, sectionOf, 1, (x) => pos[x.id!], 3)).toBe(2);
  });

  it('falls back to the previous section chapter when the page starts above the first heading', () => {
    expect(pickActiveTocId(entries, sectionOf, 1, () => 1, 99)).toBe(0);
  });

  it('uses foliate guess for sections without entries and skips unresolvable anchors', () => {
    expect(pickActiveTocId(entries, sectionOf, 7, () => 0, 42)).toBe(42);
    const pos: Record<number, number | null> = { 1: -1, 2: null, 3: 1 };
    expect(pickActiveTocId(entries, sectionOf, 1, (x) => pos[x.id!], 3)).toBe(1);
  });
});

describe('prefs', () => {
  beforeEach(() => localStorage.clear());

  it('defaultFlowFor switches at the paginated breakpoint', () => {
    expect(defaultFlowFor(1200)).toBe('paginated');
    expect(defaultFlowFor(600)).toBe('scrolled');
  });

  it('round-trips and repairs corrupt values', () => {
    expect(loadEpubPrefs()).toEqual(DEFAULT_EPUB_PREFS);
    saveEpubPrefs({ ...DEFAULT_EPUB_PREFS, flow: 'scrolled', columns: 1, publisherFont: true, indent: 'none', railWidth: 300 });
    expect(loadEpubPrefs()).toMatchObject({ flow: 'scrolled', columns: 1, publisherFont: true, indent: 'none', railWidth: 300 });
    localStorage.setItem('jz-epub-prefs:v1', JSON.stringify({ flow: 'bogus', fontScale: 'x', columns: 7, railWidth: 9999, turn: 'zoom', paper: 'pink' }));
    expect(loadEpubPrefs()).toMatchObject({ flow: 'auto', columns: 'auto', railWidth: 440, turn: 'none', paper: 'theme', publisherFont: false, indent: 'book' });
    // legacy first-batch shape: font preset keys migrate to the shared article font, 'publisher' → flag
    localStorage.setItem('jz-epub-prefs:v1', JSON.stringify({ font: 'verdana' }));
    expect(legacyEpubFontKey()).toBe('verdana');
    expect(loadEpubPrefs().publisherFont).toBe(false);
    localStorage.setItem('jz-epub-prefs:v1', JSON.stringify({ font: 'publisher' }));
    expect(legacyEpubFontKey()).toBeNull();
    expect(loadEpubPrefs().publisherFont).toBe(true);
    saveEpubPrefs({ ...DEFAULT_EPUB_PREFS, turn: 'flip', paper: 'sepia' });
    expect(loadEpubPrefs()).toMatchObject({ turn: 'flip', paper: 'sepia' });
    localStorage.setItem('jz-epub-prefs:v1', '{not json');
    expect(loadEpubPrefs()).toEqual(DEFAULT_EPUB_PREFS);
  });
});

describe('turn / paper / time / filter', () => {
  it('turn options cover every mode once, default is slide', () => {
    expect(EPUB_TURN_OPTIONS.map((o) => o.value).sort()).toEqual(['cover', 'fade', 'flip', 'none', 'slide', 'vertical']);
    expect(DEFAULT_EPUB_PREFS.turn).toBe('none');
  });
  it('papers: theme has no colours, presets have both; unknown → theme', () => {
    expect(EPUB_PAPERS[0]).toMatchObject({ key: 'theme', bg: null, fg: null });
    expect(EPUB_PAPERS.slice(1).every((p) => /^#/.test(p.bg!) && /^#/.test(p.fg!))).toBe(true);
    expect(paperFor('night').dark).toBe(true);
    expect(paperFor('nope').key).toBe('theme');
  });
  it('formatMinutes', () => {
    expect(formatMinutes(0.4)).toBe('不到 1 分钟');
    expect(formatMinutes(12.4)).toBe('12 分钟');
    expect(formatMinutes(80)).toBe('1 小时 20 分');
    expect(formatMinutes(120)).toBe('2 小时');
    expect(formatMinutes(null)).toBe('');
    expect(formatMinutes(-3)).toBe('');
  });
  it('filterTocEntries is case-insensitive and empty-query transparent', () => {
    const e = (t: string) => ({ key: t, title: t, href: t, level: 1, id: null });
    const entries = [e('第1章 OSPF'), e('第2章 eigrp'), e('附录')];
    expect(filterTocEntries(entries, '')).toBe(entries);
    expect(filterTocEntries(entries, 'ospf').map((x) => x.title)).toEqual(['第1章 OSPF']);
    expect(filterTocEntries(entries, '章').length).toBe(2);
  });
});

describe('toc prefs + page estimate', () => {
  it('repairs toc prefs', () => {
    expect(repairTocPrefs(undefined)).toEqual(DEFAULT_TOC_PREFS);
    expect(repairTocPrefs({ density: 'loose', size: 'l', wrap: true, pages: false, font: 'serif', color: 'layered' })).toEqual({ density: 'loose', size: 'l', wrap: true, pages: false, font: 'serif', color: 'layered' });
    expect(repairTocPrefs({ font: 'comic', color: 'pink' })).toMatchObject({ font: 'ui', color: 'text' });
    expect(repairTocPrefs({ density: 'x', size: 9 })).toEqual(DEFAULT_TOC_PREFS);
    expect(loadEpubPrefs().toc).toEqual(DEFAULT_TOC_PREFS);
  });
  it('calibrates bytes per page and estimates entry pages', () => {
    let c = { bytes: 0, pages: 0 };
    expect(bytesPerPage(c)).toBe(1000);
    c = addCalibration(c, 20000, 10);
    c = addCalibration(c, 0, 5); // ignored
    c = addCalibration(c, 900, 1); // single-page cover: ignored
    expect(bytesPerPage(c)).toBe(2000);
    const e = (k: string) => ({ key: k, title: k, href: k, level: 1, id: null });
    const entries = [e('a'), e('b1'), e('b2'), e('c'), e('x')];
    const sectionOf = [0, 1, 1, 2, -1];
    // three sections of 40% / 40% / 20%
    const { pages, total } = estimateTocPages(entries, sectionOf, [0, 0.4, 0.8, 1], 200000, 2000);
    expect(total).toBe(100);
    expect(pages).toEqual([1, 41, 61, 81, null]);
  });
  it('page estimate degrades gracefully without section data', () => {
    const { pages, total } = estimateTocPages([{ key: 'a', title: 'a', href: 'a', level: 1, id: null }], [0], [], 0, 1000);
    expect(pages).toEqual([null]);
    expect(total).toBe(1);
  });
});

describe('splitTocTitle', () => {
  it('splits Chinese and numeric prefixes, leaves plain titles intact', () => {
    expect(splitTocTitle('第1章 路由器的基本概述')).toEqual({ num: '第1章', text: '路由器的基本概述' });
    expect(splitTocTitle('第十二篇  多协议BGP')).toEqual({ num: '第十二篇', text: '多协议BGP' });
    expect(splitTocTitle('1.2 实验需求及拓扑描述')).toEqual({ num: '1.2', text: '实验需求及拓扑描述' });
    expect(splitTocTitle('7.3.10 实现eigrp的STUB末节配置')).toEqual({ num: '7.3.10', text: '实现eigrp的STUB末节配置' });
    expect(splitTocTitle('二、总结')).toEqual({ num: '二、', text: '总结' });
    expect(splitTocTitle('Chapter 3: Routing')).toEqual({ num: 'Chapter 3', text: 'Routing' });
    expect(splitTocTitle('前言')).toEqual({ num: '', text: '前言' });
    expect(splitTocTitle('IPv6基础')).toEqual({ num: '', text: 'IPv6基础' });
    expect(splitTocTitle('2026年展望')).toEqual({ num: '', text: '2026年展望' });
  });
});

describe('tokenSpansFromHast', () => {
  it('flattens nested scopes into offset spans with the nearest scope, merging neighbours', () => {
    const root = {
      type: 'root',
      children: [
        { type: 'element', properties: { className: ['hljs-keyword'] }, children: [{ type: 'text', value: 'if' }] },
        { type: 'text', value: ' (' },
        {
          type: 'element',
          properties: { className: ['hljs-string'] },
          children: [
            { type: 'text', value: '"a' },
            { type: 'element', properties: { className: ['hljs-subst'] }, children: [{ type: 'text', value: 'X' }] },
            { type: 'text', value: '"' },
          ],
        },
        { type: 'text', value: ') ' },
        { type: 'element', properties: { className: ['hljs-built_in'] }, children: [{ type: 'text', value: 'print' }] },
        { type: 'element', properties: { className: ['hljs-unknownscope'] }, children: [{ type: 'text', value: '!' }] },
      ],
    };
    expect(tokenSpansFromHast(root)).toEqual([
      { start: 0, end: 2, cls: 'keyword' },
      // subst is not a colour scope → inherits string; adjacent string parts merge
      { start: 4, end: 8, cls: 'string' },
      { start: 10, end: 15, cls: 'built_in' },
    ]);
  });
  it('returns nothing for plain text', () => {
    expect(tokenSpansFromHast({ type: 'root', children: [{ type: 'text', value: 'hello' }] })).toEqual([]);
  });
});

describe('columns / rail', () => {
  it('auto columns depend on stage width; fixed prefs pass through', () => {
    expect(resolveColumns('auto', 900)).toBe(1);
    expect(resolveColumns('auto', 1200)).toBe(2);
    expect(resolveColumns(2, 500)).toBe(2);
    expect(resolveColumns(1, 2000)).toBe(1);
  });
  it('clamps rail width and repairs NaN', () => {
    expect(clampRailWidth(100)).toBe(180);
    expect(clampRailWidth(1000)).toBe(440);
    expect(clampRailWidth(NaN)).toBe(RAIL_WIDTH_DEFAULT);
    expect(clampRailWidth(260.6)).toBe(261);
  });
});

describe('toc tree', () => {
  const e = (key: string, level: number) => ({ key, title: key, href: key, level, id: null });
  const entries = [e('0', 1), e('0.0', 2), e('0.0.0', 3), e('0.1', 2), e('1', 1), e('2', 1), e('2.0', 2)];
  it('ancestors / hasChildren', () => {
    expect(tocAncestorKeys('0.0.0')).toEqual(['0.0', '0']);
    expect(tocAncestorKeys('1')).toEqual([]);
    expect(tocHasChildren(entries, 0)).toBe(true);
    expect(tocHasChildren(entries, 3)).toBe(false);
    expect(tocHasChildren(entries, 6)).toBe(false);
  });
  it('default expansion shows two levels; visibility follows expanded ancestors', () => {
    const exp = defaultExpandedTocKeys(entries);
    expect([...exp]).toEqual(['0', '2']);
    expect(visibleTocEntries(entries, exp).map((x) => x.key)).toEqual(['0', '0.0', '0.1', '1', '2', '2.0']);
    exp.add('0.0');
    expect(visibleTocEntries(entries, exp).map((x) => x.key)).toContain('0.0.0');
    expect(visibleTocEntries(entries, new Set()).map((x) => x.key)).toEqual(['0', '1', '2']);
  });
});

describe('font roles', () => {
  it('classifies publisher families', () => {
    expect(classifyFontFamily('STKai, "MKai PRC", Kai, "楷体"')).toBe('kai');
    expect(classifyFontFamily('"MYing Hei S", Hei, "黑体"')).toBe('hei');
    expect(classifyFontFamily('STSong, "Song S", Song, "宋体"')).toBe('song');
    expect(classifyFontFamily('monospace')).toBe('mono');
    expect(classifyFontFamily('Courier New, monospace')).toBe('mono');
    expect(classifyFontFamily('sans-serif')).toBe('hei');
    expect(classifyFontFamily('serif')).toBe('song');
    expect(classifyFontFamily('yinbiao')).toBe('other');
    expect(classifyFontFamily('')).toBe('other');
  });
  it('maps rules to role stacks, dedupes, skips unknown roles, adds inline-tag rules', () => {
    const css = buildFontMappingCss(
      [
        { selector: 'p.kai', family: 'STKai' },
        { selector: 'p.kai', family: 'STKai' },
        { selector: 'code.x', family: 'monospace' },
        { selector: 'span.yb', family: 'yinbiao' },
        { selector: 'h1', family: 'Hei' },
        { selector: 'p.song', family: '宋体' },
      ],
      { body: 'BODY', kai: 'KAI', hei: 'HEI', mono: 'MONO' },
    );
    expect(css.match(/p\.kai \{/g)).toHaveLength(1);
    expect(css).toContain('p.kai { font-family: KAI !important; }');
    expect(css).toContain('code.x { font-family: MONO !important; }');
    expect(css).toContain('h1 { font-family: HEI !important; }');
    expect(css).toContain('p.song { font-family: BODY !important; }');
    expect(css).not.toContain('span.yb');
    expect(css).toContain('[data-jz-font="kai"] { font-family: KAI !important; }');
  });
  it('luminance parses rgb/rgba and treats transparent as null', () => {
    expect(cssColorLuminance('rgb(255, 255, 255)')).toBeCloseTo(1, 3);
    expect(cssColorLuminance('rgb(0, 0, 0)')).toBe(0);
    expect(cssColorLuminance('rgba(0, 0, 0, 0)')).toBeNull();
    expect(cssColorLuminance('transparent')).toBeNull();
    expect(cssColorLuminance('rgb(220, 220, 220)')!).toBeGreaterThan(0.6);
  });
});

describe('position memory', () => {
  beforeEach(() => localStorage.clear());

  it('keys by path without the cache-busting query', () => {
    expect(epubPositionKey('/media/uploads/a.epub?_=123')).toBe('/media/uploads/a.epub');
    expect(epubPositionKey('/media/uploads/a.epub')).toBe('/media/uploads/a.epub');
  });

  it('saves, loads and clamps fraction', () => {
    saveEpubPosition('k', { cfi: 'epubcfi(/6/4!/4/2)', fraction: 1.7 }, 42);
    expect(loadEpubPosition('k')).toEqual({ cfi: 'epubcfi(/6/4!/4/2)', fraction: 1, t: 42 });
    expect(loadEpubPosition('missing')).toBeNull();
    saveEpubPosition('k', { cfi: '', fraction: 0.5 });
    expect(loadEpubPosition('k')?.t).toBe(42);
  });

  it('prunes the oldest entries beyond the cap', () => {
    const map: Record<string, { cfi: string; fraction: number; t: number }> = {};
    for (let i = 0; i < EPUB_POSITION_MAX_ENTRIES + 5; i++) map[`b${i}`] = { cfi: 'x', fraction: 0, t: i };
    const pruned = pruneEpubPositions(map, EPUB_POSITION_MAX_ENTRIES);
    expect(Object.keys(pruned)).toHaveLength(EPUB_POSITION_MAX_ENTRIES);
    expect(pruned.b0).toBeUndefined();
    expect(pruned[`b${EPUB_POSITION_MAX_ENTRIES + 4}`]).toBeDefined();
  });
});

describe('buildEpubUserCss', () => {
  const base = {
    bg: '#fdfbf7',
    fg: '#222',
    accent: '#02b377',
    muted: '#777',
    dark: false,
    fontFamily: null,
    baseFontPx: 16.5,
    fontScale: 1.2,
    lineHeight: 1.7,
    justify: true,
  };

  it('indent none strips the publisher first-line indent', () => {
    const [, after] = buildEpubUserCss({ ...base, indent: 'none' });
    expect(after).toContain('text-indent: 0 !important');
  });

  it('emits colours, scale and line-height with !important in the after sheet', () => {
    const [before, after] = buildEpubUserCss(base);
    expect(before).toContain('color-scheme: light');
    // 16.5px (the site's --jz-fs-read) × 1.2 → books size like articles
    expect(before).toContain('font-size: 19.8px');
    expect(after).toContain('font-size: 19.8px !important');
    expect(after).not.toContain('text-indent: 0 !important');
    expect(after).toContain('background-color: #fdfbf7 !important');
    expect(after).toContain('line-height: 1.7 !important');
    expect(after).toContain('text-align: justify');
    expect(after).not.toContain('font-family');
    // code blocks / publisher boxes are themed, never removed
    expect(after).toContain('[data-jz-box]');
    expect(after).toContain('pre {');
    expect(after).toContain('white-space: pre-wrap !important');
    expect(after).toContain('/*jz-user*/');
  });

  it('forces the font only when a family is given, and dims images in dark themes', () => {
    const [, after] = buildEpubUserCss({
      ...base,
      dark: true,
      fontFamily: '"Noto Serif SC", serif',
      roles: { kai: 'KAI', hei: 'HEI', mono: 'MONO' },
      justify: false,
    });
    expect(after).toContain('font-family: "Noto Serif SC", serif !important');
    // the body override never reaches code — that keeps the site's monospace
    expect(after).toContain('pre, code, kbd, samp, tt, [data-jz-box="code"] { font-family: MONO !important; }');
    expect(after).toContain('filter: brightness(.88)');
    expect(after).toContain('text-align: start');
  });
});

describe('formatEpubProgress', () => {
  it('joins the available parts', () => {
    expect(formatEpubProgress({ fraction: 0.123, section: { current: 2, total: 117 }, tocLabel: ' 第二章 ' })).toBe(
      '12% · 第 3/117 节 · 第二章',
    );
    expect(formatEpubProgress({ fraction: 2 })).toBe('100%');
    expect(formatEpubProgress({})).toBe('');
  });
});

describe('stripEpubScripts', () => {
  it('returns markup untouched when there is nothing to strip', () => {
    const clean = '<html><body><p>安全</p><a href="c2.html#x">链接</a></body></html>';
    expect(stripEpubScripts(clean)).toBe(clean);
  });

  it('removes script tags, inline handlers, javascript: URLs and embeds', () => {
    const dirty =
      '<html><head><script src="x.js"></script><script>alert(1)</script></head>' +
      '<body onload="evil()"><p onclick=\'e()\' class="k">文</p>' +
      '<a href="javascript:steal()">x</a><img src="a.jpg" onerror=hack()>' +
      '<iframe src="https://x"></iframe><object data="a.swf"></object></body></html>';
    const out = stripEpubScripts(dirty);
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/on(load|click|error)/i);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/<(iframe|object)/i);
    expect(out).toContain('class="k"');
    expect(out).toContain('src="a.jpg"');
    expect(out).toContain('href="#"');
  });

  it('does not eat words that merely start with "on"', () => {
    const s = '<p>online onboarding</p><span title="one">x</span>';
    expect(stripEpubScripts(s)).toBe(s);
  });
});

describe('fonts', () => {
  it('detects embedded fonts from manifest media types or extensions', () => {
    expect(bookEmbedsFonts([{ mediaType: 'application/x-font-ttf', href: 'f.ttf' }])).toBe(true);
    expect(bookEmbedsFonts([{ mediaType: 'application/octet-stream', href: 'fonts/x.woff2' }])).toBe(true);
    expect(bookEmbedsFonts([{ mediaType: 'text/css', href: 'a.css' }])).toBe(false);
    expect(bookEmbedsFonts(undefined)).toBe(false);
  });

});
