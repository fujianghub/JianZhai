/**
 * Lazy wrapper around the `mermaid` library.
 *
 * - Loaded on first use via dynamic ``import()`` so the ~600 KB bundle stays
 *   out of the main chunk for readers that never view a Mermaid diagram.
 * - Theme is read from the html ``data-theme`` attribute so diagrams adapt to
 *   亮色 / 暗色 / 星空 / 深海 backgrounds. We re-initialise mermaid whenever
 *   the theme changes so subsequent renders pick up the new palette.
 */

type MermaidApi = {
  initialize: (opts: object) => void;
  render: (id: string, source: string) => Promise<{ svg: string }>;
};

let mermaidPromise: Promise<MermaidApi> | null = null;
let lastTheme: string | null = null;
let counter = 0;

function currentTheme(): string {
  const t = typeof document !== 'undefined' ? document.documentElement.dataset.theme : '';
  return t || 'light';
}

function mermaidConfig(theme: string) {
  // ``base`` is the most malleable mermaid theme; we override the key colors
  // from CSS variables so diagrams sit naturally on any palette.
  if (typeof document === 'undefined') {
    return { startOnLoad: false, securityLevel: 'strict', theme: 'default' as const };
  }
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--jz-accent').trim() || '#b94a3b';
  const text = styles.getPropertyValue('--jz-text').trim() || '#2c2218';
  const surface = styles.getPropertyValue('--jz-surface').trim() || '#faf3e0';
  const border = styles.getPropertyValue('--jz-border').trim() || '#d4c4a0';
  const muted = styles.getPropertyValue('--jz-text-muted').trim() || '#8a7a5e';
  const isDark = theme === 'dark' || theme === 'starry' || theme === 'deepsea';
  return {
    startOnLoad: false,
    securityLevel: 'strict' as const,
    fontFamily:
      '"Noto Serif SC", "Songti SC", "PingFang SC", system-ui, -apple-system, sans-serif',
    /* Tighten the per-diagram spacings — mermaid's defaults leave a lot of
       vertical air between nodes that makes flowcharts look stretched in a
       notes app. These values bring the gaps in line with what 语雀 / Notion
       use for inline diagrams. */
    flowchart: {
      nodeSpacing: 30,
      rankSpacing: 40,
      curve: 'basis' as const,
      padding: 8,
    },
    sequence: {
      diagramMarginX: 32,
      diagramMarginY: 8,
      boxMargin: 8,
      messageMargin: 28,
      actorMargin: 60,
      noteMargin: 6,
    },
    gantt: {
      barGap: 2,
      topPadding: 24,
      leftPadding: 75,
      gridLineStartPadding: 35,
      fontSize: 11,
    },
    classDiagram: { padding: 8 },
    stateDiagram: { padding: 8 },
    journey: { boxMargin: 6, diagramMarginX: 32, diagramMarginY: 8 },
    themeVariables: {
      // primary = nodes; primaryBorderColor/primaryTextColor follow.
      primaryColor: surface,
      primaryBorderColor: accent,
      primaryTextColor: text,
      // secondary = "alternate" nodes (e.g. decision diamonds in older charts)
      secondaryColor: surface,
      secondaryBorderColor: border,
      secondaryTextColor: text,
      tertiaryColor: surface,
      tertiaryBorderColor: border,
      tertiaryTextColor: text,
      // edges + labels
      lineColor: muted,
      textColor: text,
      // Sequence / Gantt overrides — keep the same accent so they harmonise
      noteBkgColor: surface,
      noteBorderColor: accent,
      noteTextColor: text,
      // Background of the diagram canvas (kept transparent so the .jz-mermaid
      // canvas container colour shows through)
      background: 'transparent',
      mainBkg: surface,
    },
    theme: isDark ? ('dark' as const) : ('base' as const),
  };
}

async function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      const api = (m.default ?? m) as MermaidApi;
      api.initialize(mermaidConfig(currentTheme()));
      lastTheme = currentTheme();
      return api;
    });
  }
  const api = await mermaidPromise;
  if (lastTheme !== currentTheme()) {
    api.initialize(mermaidConfig(currentTheme()));
    lastTheme = currentTheme();
  }
  return api;
}

export async function renderMermaid(source: string): Promise<string> {
  const api = await loadMermaid();
  const id = 'jz-mermaid-' + ++counter + '-' + Math.random().toString(36).slice(2, 8);
  const { svg } = await api.render(id, source);
  return svg;
}
