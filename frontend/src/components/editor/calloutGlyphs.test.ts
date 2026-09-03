import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CALLOUT_GLYPHS, calloutGlyphUrl } from './calloutGlyphs';
import { CALLOUT_TEMPLATES } from './callouts';

const md = readFileSync(resolve(__dirname, '../../styles/markdown.css'), 'utf8');
const exp = readFileSync(resolve(__dirname, '../../../../backend/apps/exporter/static/export-markdown.css'), 'utf8');

describe('callout glyphs stay in sync across reader / editor / exporter', () => {
  it('every menu preset has a glyph', () => {
    for (const t of CALLOUT_TEMPLATES) expect(CALLOUT_GLYPHS[t.slug], t.slug).toBeTruthy();
  });
  it('markdown.css carries the exact data URI per slug', () => {
    for (const slug of Object.keys(CALLOUT_GLYPHS)) {
      expect(md, slug).toContain(`.jz-callout-${slug}`);
      expect(md, slug).toContain(calloutGlyphUrl(slug));
    }
  });
  it('export-markdown.css matches for every slug', () => {
    for (const slug of Object.keys(CALLOUT_GLYPHS)) expect(exp, slug).toContain(calloutGlyphUrl(slug));
  });
});
