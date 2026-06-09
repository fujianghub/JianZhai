/**
 * Per-diagram graphic-theme contract for the Mermaid wrapper.
 *
 * A diagram can be pinned to a built-in Mermaid palette independent of the
 * document theme. The pinned config must carry the chosen theme and NO custom
 * ``themeVariables`` — otherwise the doc-derived tints would leak in and defeat
 * the whole point of an isolated palette.
 */
import { describe, it, expect } from 'vitest';
import { __test__, isBuiltinMermaidTheme, MERMAID_GRAPHIC_THEMES } from './mermaid';

const { mermaidBuiltinConfig } = __test__;

describe('isBuiltinMermaidTheme', () => {
  it('accepts the recognised built-in palettes', () => {
    for (const t of ['default', 'base', 'dark', 'forest', 'neutral']) {
      expect(isBuiltinMermaidTheme(t)).toBe(true);
    }
  });
  it('rejects empty / unknown values', () => {
    expect(isBuiltinMermaidTheme('')).toBe(false);
    expect(isBuiltinMermaidTheme('yuque-light')).toBe(false);
    expect(isBuiltinMermaidTheme('forest; drop')).toBe(false);
  });
});

describe('MERMAID_GRAPHIC_THEMES', () => {
  it('offers 跟随文档 (empty id) plus only valid built-in ids', () => {
    expect(MERMAID_GRAPHIC_THEMES[0].id).toBe('');
    for (const t of MERMAID_GRAPHIC_THEMES.slice(1)) {
      expect(isBuiltinMermaidTheme(t.id)).toBe(true);
    }
  });
});

describe('mermaidBuiltinConfig', () => {
  it('pins the chosen theme and carries NO custom themeVariables', () => {
    const cfg = mermaidBuiltinConfig('forest') as Record<string, unknown>;
    expect(cfg.theme).toBe('forest');
    expect('themeVariables' in cfg).toBe(false);
  });
  it('keeps the shared safety/layout hardening', () => {
    const cfg = mermaidBuiltinConfig('dark') as Record<string, unknown>;
    expect(cfg.securityLevel).toBe('strict');
    expect(cfg.htmlLabels).toBe(false);
    expect(cfg.startOnLoad).toBe(false);
  });
});
