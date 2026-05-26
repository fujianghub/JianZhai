/** Preferences for Mermaid / PlantUML diagram blocks in the editor (Yuque-style). */

export type DiagramViewMode = 'preview' | 'source' | 'split';

export interface MermaidDiagramPrefs {
  defaultViewMode: DiagramViewMode;
  defaultZoom: number;
}

const STORAGE_KEY = 'jz-mermaid-diagram-prefs';

const DEFAULTS: MermaidDiagramPrefs = {
  defaultViewMode: 'split',
  defaultZoom: 1,
};

export function loadMermaidDiagramPrefs(): MermaidDiagramPrefs {
  try {
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

export const DIAGRAM_ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5] as const;
