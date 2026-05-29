/**
 * Diagram view-mode preferences.
 *
 * Default must be ``preview`` (render the picture first; source is one click
 * away) to match the documented user expectation. ``toggleDiagramSource``
 * powers the single-click affordance on the rendered diagram canvas in
 * editor + blog reader.
 *
 * Uses a minimal in-memory ``localStorage`` stub so the test stays under the
 * repo's default ``node`` vitest env (no jsdom dep).
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cycleDiagramViewMode,
  loadMermaidDiagramPrefs,
  saveMermaidDiagramPrefs,
  toggleDiagramSource,
  type DiagramViewMode,
} from './mermaidDiagramPrefs';

beforeAll(() => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  } as Storage;
});

beforeEach(() => {
  localStorage.clear();
});

describe('mermaidDiagramPrefs', () => {
  it('defaults to preview mode when no preference is stored', () => {
    expect(loadMermaidDiagramPrefs().defaultViewMode).toBe('preview');
  });

  it('round-trips a stored preference through localStorage', () => {
    saveMermaidDiagramPrefs({ defaultViewMode: 'split' });
    expect(loadMermaidDiagramPrefs().defaultViewMode).toBe('split');
  });

  it('clamps invalid stored modes back to the default', () => {
    localStorage.setItem(
      'jz-mermaid-diagram-prefs',
      JSON.stringify({ defaultViewMode: 'gibberish' }),
    );
    expect(loadMermaidDiagramPrefs().defaultViewMode).toBe('preview');
  });

  it('cycles preview → split → source → preview', () => {
    const order: DiagramViewMode[] = ['preview', 'split', 'source', 'preview'];
    let cur: DiagramViewMode = 'preview';
    for (let i = 1; i < order.length; i++) {
      cur = cycleDiagramViewMode(cur);
      expect(cur).toBe(order[i]);
    }
  });

  it('toggleDiagramSource flips preview ↔ source and ignores split', () => {
    expect(toggleDiagramSource('preview')).toBe('source');
    expect(toggleDiagramSource('source')).toBe('preview');
    // From split, single-click on the picture should still expose source.
    expect(toggleDiagramSource('split')).toBe('source');
  });
});
