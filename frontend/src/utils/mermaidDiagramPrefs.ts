/** Preferences for Mermaid / PlantUML diagram blocks in the editor (Yuque-style). */

export type DiagramViewMode = 'preview' | 'source' | 'split';

export interface MermaidDiagramPrefs {
  defaultViewMode: DiagramViewMode;
  defaultZoom: number;
}

// v2 storage key: drops any pre-v0.9.2 stored ``split`` preference so users
// who tried the diagram block before the Yuque-style redesign get the new
// preview-first default (a fresh choice persists normally from here on).
// The old v1 key is silently discarded — there's no useful migration since
// the prior default was wrong, and most users only had it set incidentally.
const STORAGE_KEY = 'jz-mermaid-diagram-prefs-v2';
const LEGACY_STORAGE_KEY = 'jz-mermaid-diagram-prefs';

const DEFAULTS: MermaidDiagramPrefs = {
  // Default to the rendered diagram — code is one click away (toolbar button,
  // Ctrl+Shift+P, or clicking the preview surface). Split view is opt-in for
  // power users editing the source side-by-side.
  defaultViewMode: 'preview',
  defaultZoom: 1,
};

export function loadMermaidDiagramPrefs(): MermaidDiagramPrefs {
  try {
    // One-shot: drop the legacy key the first time we see it so we don't
    // leak stale ``split`` values into a fresh sync.
    if (typeof localStorage !== 'undefined' && localStorage.getItem(LEGACY_STORAGE_KEY)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<MermaidDiagramPrefs>;
    const mode = parsed.defaultViewMode;
    const zoom = parsed.defaultZoom;
    return {
      defaultViewMode:
        mode === 'preview' || mode === 'source' || mode === 'split' ? mode : DEFAULTS.defaultViewMode,
      defaultZoom:
        typeof zoom === 'number' && zoom >= 0.25 && zoom <= 2 ? zoom : DEFAULTS.defaultZoom,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveMermaidDiagramPrefs(partial: Partial<MermaidDiagramPrefs>): void {
  const next = { ...loadMermaidDiagramPrefs(), ...partial };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function cycleDiagramViewMode(current: DiagramViewMode): DiagramViewMode {
  const order: DiagramViewMode[] = ['preview', 'split', 'source'];
  const i = order.indexOf(current);
  return order[(i + 1) % order.length];
}

/** Two-state toggle used by single-click on the rendered diagram surface. */
export function toggleDiagramSource(current: DiagramViewMode): DiagramViewMode {
  return current === 'source' ? 'preview' : 'source';
}

export const DIAGRAM_ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5] as const;
