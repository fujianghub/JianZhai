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
  parse?: (source: string) => Promise<unknown> | unknown;
  render: (id: string, source: string) => Promise<{ svg: string }>;
};

let mermaidPromise: Promise<MermaidApi> | null = null;
let lastTheme: string | null = null;
let counter = 0;

/** Built-in Mermaid palettes a diagram can be pinned to, independent of the
 *  document theme. '' = 跟随文档 (the doc-derived palette in ``mermaidConfig``). */
export const MERMAID_GRAPHIC_THEMES: { id: string; label: string }[] = [
  { id: '', label: '跟随文档' },
  { id: 'default', label: '默认' },
  { id: 'neutral', label: '中性' },
  { id: 'forest', label: '森林' },
  { id: 'dark', label: '暗色' },
  { id: 'base', label: '素雅' },
];

const BUILTIN_THEMES = new Set(['default', 'base', 'dark', 'forest', 'neutral']);

/** True when ``t`` is a recognised built-in Mermaid theme we may pass to
 *  ``initialize``. Guards against injecting an arbitrary string. */
export function isBuiltinMermaidTheme(t: string): boolean {
  return BUILTIN_THEMES.has(t);
}

function currentTheme(): string {
  const t = typeof document !== 'undefined' ? document.documentElement.dataset.theme : '';
  return t || 'light';
}

/** Parse a CSS hex / rgb / rgba colour string to a normalised [r,g,b,a] tuple.
 *
 *  Mermaid's theme pipeline (and the colour-math library it uses internally)
 *  is not tolerant of weird input forms. The page's design tokens include
 *  half-transparent surface colours like ``rgba(255, 255, 255, 0.62)`` for
 *  glassmorphism, which broke an earlier DOM-probe based ``color-mix()``
 *  implementation: the probe returned the rgba string verbatim, which
 *  Mermaid then fed into ``lighten()/darken()`` and crashed on the alpha
 *  arithmetic. Doing the mix in JS and returning a plain ``#rrggbb`` is
 *  immune to that whole class of bug.
 *
 *  Returns ``null`` for inputs we don't understand (named colours, hsl(),
 *  oklch(), …) — callers fall back to the unmodified base colour, so a
 *  failed parse degrades gracefully rather than throwing. */
function parseColor(c: string): [number, number, number, number] | null {
  const s = (c || '').trim();
  if (!s) return null;
  // #rgb / #rrggbb / #rrggbbaa
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
        1,
      ];
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        1,
      ];
    }
    if (hex.length === 8) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        parseInt(hex.slice(6, 8), 16) / 255,
      ];
    }
    return null;
  }
  // rgb(r, g, b) / rgba(r, g, b, a) — also tolerates the modern
  // whitespace-separated ``rgb(r g b / a)`` form.
  const m = s.match(
    /^rgba?\(\s*([\d.]+)\s*[ ,]\s*([\d.]+)\s*[ ,]\s*([\d.]+)(?:\s*[ ,/]\s*([\d.]+%?))?\s*\)$/i,
  );
  if (m) {
    let a = 1;
    if (m[4] != null) {
      a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    }
    return [+m[1], +m[2], +m[3], a];
  }
  return null;
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Composite an [r,g,b,a] colour over an opaque backdrop, returning [r,g,b]. */
function compositeOver(
  c: [number, number, number, number],
  backdrop: [number, number, number],
): [number, number, number] {
  return [
    c[0] * c[3] + backdrop[0] * (1 - c[3]),
    c[1] * c[3] + backdrop[1] * (1 - c[3]),
    c[2] * c[3] + backdrop[2] * (1 - c[3]),
  ];
}

const WHITE: [number, number, number] = [255, 255, 255];

/** Mix two colour strings at a given mix percentage and return a flat
 *  ``#rrggbb`` result. Transparent or partially-transparent colours are
 *  composited over ``backdrop`` before mixing — Mermaid's internal palette
 *  derivation expects opaque inputs.
 *
 *  ``backdrop`` matters: dark / starry / deepsea glass tokens are white at
 *  very low alpha (e.g. ``--jz-surface: rgba(255,255,255,0.045)``) glazed
 *  over a dark page. Compositing those over white yields near-white — the
 *  exact bug that made sequence-diagram actor boxes pale-emerald with light
 *  grey text in dark mode — so callers pass the theme's real page
 *  background (``--jz-bg-app``).
 *
 *  Why JS, not CSS ``color-mix()``? Because Mermaid runs theme processing
 *  in pure JS and any value we hand it must be parseable by **its** colour
 *  lib, not the browser's. Doing the mix here means we control the output
 *  format precisely — always opaque ``#rrggbb``. */
function mixColors(
  base: string,
  with_: string,
  percent: number,
  backdrop: [number, number, number] = WHITE,
): string {
  const a = parseColor(base);
  const b = parseColor(with_);
  if (!a || !b) return base;
  const aOpaque = compositeOver(a, backdrop);
  const bOpaque = compositeOver(b, backdrop);
  const w = Math.max(0, Math.min(1, percent / 100));
  return toHex(
    aOpaque[0] * (1 - w) + bOpaque[0] * w,
    aOpaque[1] * (1 - w) + bOpaque[1] * w,
    aOpaque[2] * (1 - w) + bOpaque[2] * w,
  );
}

/** Convert any CSS colour string to a flat opaque ``#rrggbb`` representation
 *  suitable for Mermaid theme variables. Strips alpha (composites over
 *  ``backdrop``, default white) so downstream colour math doesn't trip on
 *  partially-transparent inputs. Returns the fallback if it can't be parsed. */
function normalizeForMermaid(
  c: string,
  fallback: string,
  backdrop: [number, number, number] = WHITE,
): string {
  const parsed = parseColor(c);
  if (!parsed) return fallback;
  const [r, g, b] = compositeOver(parsed, backdrop);
  return toHex(r, g, b);
}

/** Theme-independent layout / safety config shared by the doc-derived palette
 *  (``mermaidConfig``) and the pinned built-in palettes (``mermaidBuiltinConfig``).
 *  Pulled out so both paths keep identical spacing, fonts and the critical
 *  ``htmlLabels:false`` / ``securityLevel:'strict'`` hardening. */
const MERMAID_LAYOUT = {
  startOnLoad: false,
  securityLevel: 'strict' as const,
  /* Render every label as native SVG ``<text>`` instead of HTML inside
     ``<foreignObject>``. The reading side re-sanitises Mermaid's output
     with DOMPurify (CodeBlockEnhancer → sanitizeHtml), and DOMPurify ≥ 2
     unconditionally strips HTML elements nested in foreignObject as mXSS
     hardening — which silently deleted EVERY flowchart node / edge /
     subgraph label. SVG text survives sanitisation and ``<br/>`` still
     produces line breaks via tspans. */
  htmlLabels: false,
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
} as const;

/** Clean config for a diagram pinned to a built-in Mermaid palette. Deliberately
 *  carries NO custom ``themeVariables`` so the built-in theme's own colours win
 *  — the whole point of "独立图形配色" is to escape the doc-derived tints. */
function mermaidBuiltinConfig(graphicTheme: string) {
  return { ...MERMAID_LAYOUT, theme: graphicTheme };
}

function mermaidConfig(theme: string) {
  // ``base`` is the most malleable mermaid theme; we override the key colors
  // from CSS variables so diagrams sit naturally on any palette.
  if (typeof document === 'undefined') {
    return { startOnLoad: false, securityLevel: 'strict', theme: 'default' as const };
  }
  const styles = getComputedStyle(document.documentElement);
  const isDark = theme === 'dark' || theme === 'starry' || theme === 'deepsea';
  // Read raw CSS values, then normalise every one of them to an opaque
  // ``#rrggbb`` before they touch Mermaid. The page tokens use semi-
  // transparent ``rgba(...)`` for glass surfaces, which Mermaid's colour
  // library rejects with NaN-laden lighten/darken math.
  //
  // Crucially, alpha is composited over the theme's REAL page background
  // (``--jz-bg-app``), not over white: the dark glass token is white at
  // ~4.5 % alpha, which over white flattens to near-white and produced
  // pale boxes with unreadable light text in dark mode.
  const bgParsed = parseColor(styles.getPropertyValue('--jz-bg-app').trim());
  const backdrop: [number, number, number] = bgParsed
    ? compositeOver(bgParsed, isDark ? [10, 10, 14] : WHITE)
    : isDark
      ? [10, 10, 14]
      : WHITE;
  const accent = normalizeForMermaid(styles.getPropertyValue('--jz-accent'), '#b94a3b', backdrop);
  const text = normalizeForMermaid(
    styles.getPropertyValue('--jz-text'),
    isDark ? '#e8e6e3' : '#2c2218',
    backdrop,
  );
  const surface = normalizeForMermaid(
    styles.getPropertyValue('--jz-surface'),
    isDark ? '#1c1c22' : '#faf3e0',
    backdrop,
  );
  const border = normalizeForMermaid(
    styles.getPropertyValue('--jz-border'),
    isDark ? '#4a4a52' : '#d4c4a0',
    backdrop,
  );
  const muted = normalizeForMermaid(
    styles.getPropertyValue('--jz-text-muted'),
    isDark ? '#9a988f' : '#8a7a5e',
    backdrop,
  );

  // "Node surface" — surface tinted toward accent so nodes stand out from
  // the diagram canvas (which itself uses ``--jz-surface``). Higher mix on
  // dark palettes because the bare surface is already dim, and a 4 % accent
  // bump is barely perceptible there. We also offset borders so they always
  // have ≥ 30 % contrast against the node fill, regardless of palette.
  const nodeFill = mixColors(surface, accent, isDark ? 14 : 8, backdrop);
  const nodeAltFill = mixColors(surface, accent, isDark ? 24 : 14, backdrop);
  const edgeLabel = mixColors(surface, isDark ? '#ffffff' : '#000000', 6, backdrop);
  const clusterFill = mixColors(surface, accent, isDark ? 7 : 4, backdrop);
  return {
    ...MERMAID_LAYOUT,
    themeVariables: {
      // primary = nodes; primaryBorderColor/primaryTextColor follow.
      primaryColor: nodeFill,
      primaryBorderColor: accent,
      primaryTextColor: text,
      // secondary = "alternate" nodes (e.g. decision diamonds in older charts)
      secondaryColor: nodeAltFill,
      secondaryBorderColor: border,
      secondaryTextColor: text,
      tertiaryColor: nodeAltFill,
      tertiaryBorderColor: border,
      tertiaryTextColor: text,
      // edges + labels — opaque label background prevents edges crossing
      // labels in starry / deepsea where the canvas is dark and translucent
      // text on top of the connector becomes unreadable.
      lineColor: muted,
      textColor: text,
      edgeLabelBackground: edgeLabel,
      // flowchart subgraph (cluster) container + title
      clusterBkg: clusterFill,
      clusterBorder: border,
      titleColor: text,
      // Sequence diagram — set every text/box colour explicitly instead of
      // trusting the built-in ``dark`` theme's derivations (it hardcodes
      // ``lightgrey`` actor text and lightens our boxes, which is exactly
      // what made actors unreadable in dark mode).
      actorBkg: nodeFill,
      actorBorder: accent,
      actorTextColor: text,
      actorLineColor: muted,
      signalColor: muted,
      signalTextColor: text,
      labelBoxBkgColor: nodeAltFill,
      labelBoxBorderColor: border,
      labelTextColor: text,
      loopTextColor: text,
      activationBkgColor: nodeAltFill,
      activationBorderColor: accent,
      // Sequence / Gantt overrides — keep the same accent so they harmonise
      noteBkgColor: nodeFill,
      noteBorderColor: accent,
      noteTextColor: text,
      // Background of the diagram canvas (kept transparent so the .jz-mermaid
      // canvas container colour shows through)
      background: 'transparent',
      mainBkg: nodeFill,
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
  return mermaidPromise;
}

/** Serialise the (initialize → render) critical section. Mermaid keeps a SINGLE
 *  global config, so a per-diagram theme switch must re-initialise before that
 *  diagram renders. Without a lock, two concurrent renders with different themes
 *  could interleave their initialize/render calls and bleed one palette into the
 *  other. Diagrams are small and few, so sequential rendering is imperceptible. */
let renderChain: Promise<unknown> = Promise.resolve();

/** @internal — exposed only for unit tests; do not import elsewhere. */
export const __test__ = {
  parseColor,
  mixColors,
  normalizeForMermaid,
  compositeOver,
  mermaidConfig,
  mermaidBuiltinConfig,
};

/**
 * Render a Mermaid source to SVG.
 *
 * @param graphicTheme  Optional built-in palette to pin this diagram to
 *   (``default`` / ``neutral`` / ``forest`` / ``dark`` / ``base``). When empty
 *   or unrecognised, the diagram follows the document theme (doc-derived
 *   palette). The choice is per-diagram and isolated — it never affects other
 *   diagrams on the page.
 */
export async function renderMermaid(source: string, graphicTheme = ''): Promise<string> {
  const api = await loadMermaid();
  const run = renderChain.then(() => renderMermaidLocked(api, source, graphicTheme));
  // Keep the chain alive even if this render rejects, so one failed diagram
  // doesn't wedge every subsequent render.
  renderChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function renderMermaidLocked(
  api: MermaidApi,
  source: string,
  graphicTheme: string,
): Promise<string> {
  const pinned = graphicTheme && isBuiltinMermaidTheme(graphicTheme);
  if (pinned) {
    // Pin to a clean built-in palette; force the next doc-themed render to
    // re-initialise (lastTheme = null) since we just clobbered the global config.
    api.initialize(mermaidBuiltinConfig(graphicTheme));
    lastTheme = null;
  } else if (lastTheme !== currentTheme()) {
    api.initialize(mermaidConfig(currentTheme()));
    lastTheme = currentTheme();
  }
  // Probe-parse first so syntax errors throw cleanly without mermaid injecting
  // its "bomb" error SVG into the DOM as a side effect — we'd rather surface
  // the message in our own UI than leave orphan error nodes hanging in body.
  if (typeof api.parse === 'function') {
    await api.parse(source);
  }
  const id = 'jz-mermaid-' + ++counter + '-' + Math.random().toString(36).slice(2, 8);
  try {
    const { svg } = await api.render(id, source);
    return svg;
  } finally {
    // Mermaid v11 leaves the temporary measurement container in body; sweep
    // any nodes whose id starts with our prefix or mermaid's internal "dmm-".
    if (typeof document !== 'undefined') {
      document
        .querySelectorAll(`#${CSS.escape(id)}, [id^="dmm-"][id$="${id}"]`)
        .forEach((n) => n.remove());
    }
  }
}
