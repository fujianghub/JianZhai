/**
 * Callout corner glyphs — white line icons on the coloured disc, shared by
 * the reading page (markdown.css ``--c-glyph``), the editor menus
 * (``calloutSwatch``) and the exporter CSS. Each entry is either an SVG path
 * (24 grid, 2.2 white stroke, round caps) or a digit rendered as SVG text.
 * ``calloutGlyphUrl`` produces the data URI both CSS files carry verbatim
 * (``calloutGlyphs.test`` locks them in sync).
 */
export const CALLOUT_GLYPHS: Record<string, { d?: string; text?: string }> = {
  tips: { d: 'M9.5 17.5h5M10.3 20h3.4M12 3.6a5.4 5.4 0 0 0-3.3 9.7c.6.5.9 1.1.9 1.8v.4h4.8v-.4c0-.7.3-1.3.9-1.8A5.4 5.4 0 0 0 12 3.6z' },
  info: { d: 'M12 7.2v.2M12 10.8v6.4' },
  note: { d: 'M6.5 4v16M6.5 5h10.2l-2.4 3.5 2.4 3.5H6.5' },
  warning: { d: 'M12 5.5v7.5M12 17v.2' },
  danger: { d: 'M7.5 7.5l9 9M16.5 7.5l-9 9' },
  error: { d: 'M7.5 7.5l9 9M16.5 7.5l-9 9' },
  success: { d: 'M6 12.5l3.8 3.8L18 8' },
  quote: { d: 'M9 15c-1.6 0-2.7-1.1-2.7-2.6S7.4 9.8 9 9.8c0-2 1-3.2 2.6-3.6M17.2 15c-1.6 0-2.7-1.1-2.7-2.6s1.1-2.6 2.7-2.6c0-2 1-3.2 2.6-3.6' },
  color1: { text: '1' },
  color2: { text: '2' },
  color3: { text: '3' },
  color4: { text: '4' },
  color5: { text: '5' },
  color6: { text: '6' },
};

export function calloutGlyphSvg(slug: string): string {
  const g = CALLOUT_GLYPHS[slug] ?? { text: '★' };
  const inner = g.d
    ? `<path d='${g.d}' fill='none' stroke='#fff' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/>`
    : `<text x='12' y='16.6' text-anchor='middle' font-family='system-ui,-apple-system,sans-serif' font-size='13' font-weight='700' fill='#fff'>${g.text}</text>`;
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>${inner}</svg>`;
}

/** ``url("data:image/svg+xml,…")`` — the exact string used in CSS. */
export function calloutGlyphUrl(slug: string): string {
  const svg = calloutGlyphSvg(slug).replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, "'");
  return `url("data:image/svg+xml,${svg}")`;
}
