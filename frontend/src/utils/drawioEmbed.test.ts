// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  BLANK_DRAWIO_XML,
  buildDrawioEmbedUrl,
  buildDrawioFigureHtml,
  dataUriToFile,
  drawioDownloadName,
  drawioFileStem,
  groupAttachmentsForPanel,
  isMediaUrl,
  readDrawioFigure,
  decodeSvgDataUri,
  extractDiagramXmlFromSvg,
  parseDrawioMessage,
  serializeDrawioAction,
} from './drawioEmbed';
import { DRAWIO_TEMPLATES } from './drawioTemplates';

describe('buildDrawioEmbedUrl', () => {
  it('defaults: same-origin index, JSON protocol, min ui, zh, save-and-exit only', () => {
    const u = new URL(buildDrawioEmbedUrl(), 'https://x');
    expect(u.pathname).toBe('/drawio/index.html');
    const q = u.searchParams;
    expect(q.get('embed')).toBe('1');
    expect(q.get('proto')).toBe('json');
    expect(q.get('ui')).toBe('min');
    expect(q.get('lang')).toBe('zh');
    expect(q.get('libraries')).toBe('1');
    expect(q.get('noSaveBtn')).toBe('1');
    expect(q.get('saveAndExit')).toBe('1');
    // site-level offline / stealth / math=0 defaults live in PreConfig, not here
    expect(q.has('offline')).toBe(false);
    expect(q.has('math')).toBe(false);
  });

  it('options map to draw.io url params', () => {
    const q = new URL(buildDrawioEmbedUrl({ ui: 'kennedy', math: true, dark: true, modified: false, libs: 'general;uml', saveAndExit: false }), 'https://x').searchParams;
    expect(q.get('ui')).toBe('kennedy');
    expect(q.get('math')).toBe('1');
    expect(q.get('dark')).toBe('1');
    expect(q.get('modified')).toBe('0');
    expect(q.get('libs')).toBe('general;uml');
    expect(q.has('saveAndExit')).toBe(false);
    expect(q.has('noSaveBtn')).toBe(false);
  });
});

describe('parseDrawioMessage', () => {
  it('parses JSON strings and passes objects through', () => {
    expect(parseDrawioMessage('{"event":"init"}')).toEqual({ event: 'init' });
    expect(parseDrawioMessage({ event: 'save', xml: '<mxfile/>' })?.xml).toBe('<mxfile/>');
  });
  it('rejects non-protocol messages', () => {
    expect(parseDrawioMessage('ready')).toBeNull();
    expect(parseDrawioMessage('{bad')).toBeNull();
    expect(parseDrawioMessage({ type: 'jz-html-frame-ready' })).toBeNull();
    expect(parseDrawioMessage(null)).toBeNull();
    expect(parseDrawioMessage(42)).toBeNull();
  });
});

describe('serializeDrawioAction', () => {
  it('produces the JSON string draw.io expects', () => {
    expect(JSON.parse(serializeDrawioAction({ action: 'export', format: 'xmlsvg' }))).toEqual({ action: 'export', format: 'xmlsvg' });
  });
});

describe('svg helpers', () => {
  const xml = '<mxfile host="jz"><diagram id="d" name="P">x</diagram></mxfile>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" content="${xml.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}"><g/></svg>`;

  it('extracts the embedded mxfile from an xmlsvg export', () => {
    expect(extractDiagramXmlFromSvg(svg)).toBe(xml);
    expect(extractDiagramXmlFromSvg('<svg><g/></svg>')).toBeNull();
    expect(extractDiagramXmlFromSvg('<svg content="nope"/>')).toBeNull();
  });

  it('decodes an svg data uri', () => {
    const b64 = btoa(unescape(encodeURIComponent(svg)));
    expect(decodeSvgDataUri(`data:image/svg+xml;base64,${b64}`)).toBe(svg);
    expect(decodeSvgDataUri('data:image/png;base64,AAAA')).toBeNull();
  });
});


describe('drawio画板 figure format', () => {
  const attrs = { src: '/media/uploads/2026/09/a.svg', png: '/media/uploads/2026/09/a.png' };

  it('builds a single-line figure with svg img + png data attr', () => {
    const html = buildDrawioFigureHtml(attrs);
    expect(html).not.toContain('\n');
    expect(html).toBe(
      '<figure class="jz-drawio" data-jz-drawio="1" data-png="/media/uploads/2026/09/a.png"><img src="/media/uploads/2026/09/a.svg" alt="drawio画板" /></figure>',
    );
    expect(buildDrawioFigureHtml({ src: attrs.src, png: '' })).not.toContain('data-png');
  });

  it('round-trips through the DOM', () => {
    const div = document.createElement('div');
    div.innerHTML = buildDrawioFigureHtml(attrs);
    expect(readDrawioFigure(div.firstElementChild!)).toEqual({ ...attrs, scheme: 'auto', size: 'auto', align: 'center', caption: '' });
  });

  it('rejects non-media urls and non-drawio figures', () => {
    const div = document.createElement('div');
    div.innerHTML = '<figure data-jz-drawio="1" data-png="https://evil/x.png"><img src="https://evil/x.svg"></figure><figure><img src="/media/a.svg"></figure>';
    expect(readDrawioFigure(div.children[0]!)).toBeNull();
    expect(readDrawioFigure(div.children[1]!)).toBeNull();
    expect(isMediaUrl('/media/uploads/a.svg')).toBe(true);
    expect(isMediaUrl('/media/a b.svg')).toBe(false);
    expect(isMediaUrl('javascript:alert(1)')).toBe(false);
  });

  it('blank diagram is a single-page mxfile', () => {
    expect(BLANK_DRAWIO_XML.startsWith('<mxfile>')).toBe(true);
    expect(BLANK_DRAWIO_XML.match(/<diagram /g)).toHaveLength(1);
  });

  it('turns export data uris into files', async () => {
    const svg = dataUriToFile(`data:image/svg+xml;base64,${btoa('<svg/>')}`, 'b.svg')!;
    expect(svg.type).toBe('image/svg+xml');
    expect(await svg.text()).toBe('<svg/>');
    const png = dataUriToFile('data:image/png;base64,iVBORw0KGgo=', 'b.png')!;
    expect(png.type).toBe('image/png');
    expect(png.size).toBe(8);
    expect(dataUriToFile('nope', 'x')).toBeNull();
  });
});


describe('drawio画板 settings attrs', () => {
  const base = { src: '/media/uploads/a.svg', png: '/media/uploads/a.png' };

  it('defaults emit no extra attributes', () => {
    expect(buildDrawioFigureHtml({ ...base, scheme: 'auto', size: 'auto', align: 'center', caption: '' })).toBe(
      buildDrawioFigureHtml(base),
    );
  });

  it('round-trips scheme / size / align / caption through the DOM', () => {
    const html = buildDrawioFigureHtml({ ...base, scheme: 'light', size: 'full', align: 'left', caption: '图 1 <拓扑> & "说明"' });
    expect(html).not.toContain('\n');
    expect(html).toContain('data-jz-scheme="light"');
    expect(html).toContain('<figcaption>图 1 &lt;拓扑&gt; &amp; &quot;说明&quot;</figcaption>');
    const div = document.createElement('div');
    div.innerHTML = html;
    expect(readDrawioFigure(div.firstElementChild!)).toEqual({
      ...base, scheme: 'light', size: 'full', align: 'left', caption: '图 1 <拓扑> & "说明"',
    });
  });

  it('unknown attribute values fall back to defaults; caption newlines collapse', () => {
    const div = document.createElement('div');
    div.innerHTML = '<figure data-jz-drawio="1" data-jz-scheme="neon" data-jz-size="xl" data-jz-align="up"><img src="/media/a.svg"><figcaption>a\n  b</figcaption></figure>';
    expect(readDrawioFigure(div.firstElementChild!)).toMatchObject({ scheme: 'auto', size: 'auto', align: 'center', caption: 'a b' });
    expect(buildDrawioFigureHtml({ ...base, caption: 'x\ny' })).toContain('<figcaption>x y</figcaption>');
  });

});

describe('drawio画板 files', () => {
  it('file stem is drawio画板-YYYYMMDD-HHmmss-xxxx', () => {
    expect(drawioFileStem(new Date(2026, 8, 24, 7, 5, 9))).toMatch(/^drawio画板-20260924-070509-[a-z0-9]{4}$/);
  });

  it('download names are safe and numbered only when needed', () => {
    expect(drawioDownloadName('园区网 / 设计:v2', 0, 1)).toBe('园区网_设计_v2-画板.svg');
    expect(drawioDownloadName('A', 1, 3)).toBe('A-画板2.svg');
    expect(drawioDownloadName('', 0, 1)).toBe('drawio画板-画板.svg');
  });

  it('panel groups each SVG+PNG pair into one row, keeps other files and order', () => {
    const items = [
      { id: 1, original_filename: 'report.pdf' },
      { id: 2, original_filename: 'drawio画板-20260924-070509-ab12.png' },
      { id: 3, original_filename: 'drawio画板-20260924-070509-ab12.svg' },
      { id: 4, original_filename: 'drawio画板-20260924-080000-cd34.svg' },
      { id: 5, original_filename: 'drawio.svg' },
      { id: 6, original_filename: 'drawio.png' },
      { id: 7, original_filename: 'my-drawio画板.png' },
    ];
    const rows = groupAttachmentsForPanel(items);
    expect(rows.map((r) => (r.type === 'file' ? `f${r.att.id}` : `d${r.svg?.id ?? '-'}/${r.png?.id ?? '-'}`))).toEqual([
      'f1', 'd3/2', 'd4/-', 'd5/-', 'd-/6', 'f7',
    ]);
  });
});

describe('drawio画板 templates', () => {
  it('four starters, each a well-formed single-page mxfile with consistent ids', () => {
    expect(DRAWIO_TEMPLATES.map((t) => t.id)).toEqual(['blank', 'flowchart', 'network', 'layers']);
    for (const t of DRAWIO_TEMPLATES) {
      const doc = new DOMParser().parseFromString(t.xml, 'application/xml');
      expect(doc.querySelector('parsererror'), t.id).toBeNull();
      expect(doc.querySelectorAll('diagram')).toHaveLength(1);
      const cells = [...doc.querySelectorAll('mxCell')];
      const ids = cells.map((c) => c.getAttribute('id'));
      expect(new Set(ids).size, t.id).toBe(ids.length);
      for (const e of cells.filter((c) => c.getAttribute('edge') === '1')) {
        expect(ids).toContain(e.getAttribute('source'));
        expect(ids).toContain(e.getAttribute('target'));
      }
    }
  });
});
