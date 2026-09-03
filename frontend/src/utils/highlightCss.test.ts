/**
 * Guards the hand-maintained ``::highlight(jz-md-*)`` rules in reader.css
 * against drifting from HIGHLIGHT_SWATCHES: every colour × style pair must
 * have exactly one rule carrying that swatch's hex, and no orphan rules.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { HIGHLIGHT_SWATCHES } from './epubNotes';

const css = readFileSync(resolve(__dirname, '../styles/reader.css'), 'utf8');
const STYLE_PREFIX = { highlight: 'hl', underline: 'un', squiggly: 'sq' } as const;

describe('reader.css ::highlight rules mirror HIGHLIGHT_SWATCHES', () => {
  const rules = [...css.matchAll(/::highlight\(jz-md-(hl|un|sq)-([a-z]+)\)\s*\{([^}]*)\}/g)];

  it('has one rule per colour × style with the matching hex', () => {
    for (const sw of HIGHLIGHT_SWATCHES) {
      for (const prefix of Object.values(STYLE_PREFIX)) {
        const hits = rules.filter((m) => m[1] === prefix && m[2] === sw.key);
        expect(hits, `${prefix}-${sw.key}`).toHaveLength(1);
        expect(hits[0][3].toLowerCase(), `${prefix}-${sw.key} hex`).toContain(sw.hex.toLowerCase());
      }
    }
  });

  it('has no orphan rules for unknown colours', () => {
    const known = new Set(HIGHLIGHT_SWATCHES.map((s) => s.key));
    const orphans = rules.filter((m) => !known.has(m[2] as never)).map((m) => m[0]);
    expect(orphans).toEqual([]);
  });
});
