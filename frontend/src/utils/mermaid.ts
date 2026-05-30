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

/** Mix two colour strings at a given mix percentage and return a flat
 *  ``#rrggbb`` result. Transparent or partially-transparent base colours
 *  are composited over white before mixing — Mermaid's internal palette
 *  derivation expects opaque inputs.
 *
 *  Why JS, not CSS ``color-mix()``? Because Mermaid runs theme processing
 *  in pure JS and any value we hand it must be parseable by **its** colour
 *  lib, not the browser's. Doing the mix here means we control the output
 *  format precisely — always opaque ``#rrggbb``. */
function mixColors(base: string, with_: string, percent: number): string {
  const a = parseColor(base);
  const b = parseColor(with_);
  if (!a || !b) return base;
  // Composite ``a`` over white so transparent surface tokens behave as
  // their visual equivalent on a page background. Mermaid SVG sits on
  // ``--jz-diagram-surface`` (also a tint of white) so this is the right
  // reference plane.
  const aOpaque: [number, number, number] = [
    a[0] * a[3] + 255 * (1 - a[3]),
    a[1] * a[3] + 255 * (1 - a[3]),
    a[2] * a[3] + 255 * (1 - a[3]),
  ];
  const bOpaque: [number, number, number] = [
    b[0] * b[3] + 255 * (1 - b[3]),
    b[1] * b[3] + 255 * (1 - b[3]),
    b[2] * b[3] + 255 * (1 - b[3]),
  ];
  const w = Math.max(0, Math.min(1, percent / 100));
  return toHex(
    aOpaque[0] * (1 - w) + bOpaque[0] * w,
    aOpaque[1] * (1 - w) + bOpaque[1] * w,
    aOpaque[2] * (1 - w) + bOpaque[2] * w,
  );
}

/** Convert any CSS colour string to a flat opaque ``#rrggbb`` representation
 *  suitable for Mermaid theme variables. Strips alpha (composites over
 *  white) so downstream colour math doesn't trip on partially-transparent
 *  inputs. Returns the input unchanged if it can't be parsed. */
function normalizeForMermaid(c: string, fallback: string): string {
  const parsed = parseColor(c);
  if (!parsed) return fallback;
  return toHex(
    parsed[0] * parsed[3] + 255 * (1 - parsed[3]),
    parsed[1] * parsed[3] + 255 * (1 - parsed[3]),
    parsed[2] * parsed[3] + 255 * (1 - parsed[3]),
  );
}

function mermaidConfig(theme: string) {
  // ``base`` is the most malleable mermaid theme; we override the key colors
  // from CSS variables so diagrams sit naturally on any palette.
  if (typeof document === 'undefined') {
    return { startOnLoad: false, securityLevel: 'strict', theme: 'default' as const };
  }
  const styles = getComputedStyle(document.documentElement);
  // Read raw CSS values, then normalise every one of them to an opaque
  // ``#rrggbb`` before they touch Mermaid. The page tokens use semi-
  // transparent ``rgba(...)`` for glass surfaces, which Mermaid's colour
  // library rejects with NaN-laden lighten/darken math. Composing over
  // white inside ``normalizeForMermaid`` produces the visual equivalent
  // without the alpha hazard.
  const accent = normalizeForMermaid(styles.getPropertyValue('--jz-accent'), '#b94a3b');
  const text = normalizeForMermaid(styles.getPropertyValue('--jz-text'), '#2c2218');
  const surface = normalizeForMermaid(styles.getPropertyValue('--jz-surface'), '#faf3e0');
  const border = normalizeForMermaid(styles.getPropertyValue('--jz-border'), '#d4c4a0');
  const muted = normalizeForMermaid(styles.getPropertyValue('--jz-text-muted'), '#8a7a5e');
  const isDark = theme === 'dark' || theme === 'starry' || theme === 'deepsea';

  // "Node surface" — surface tinted toward accent so nodes stand out from
  // the diagram canvas (which itself uses ``--jz-surface``). Higher mix on
  // dark palettes because the bare surface is already dim, and a 4 % accent
  // bump is barely perceptible there. We also offset borders so they always
  // have ≥ 30 % contrast against the node fill, regardless of palette.
  const nodeFill = mixColors(surface, accent, isDark ? 14 : 8);
  const nodeAltFill = mixColors(surface, accent, isDark ? 24 : 14);
  const edgeLabel = mixColors(surface, isDark ? '#ffffff' : '#000000', 6);
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
  const api = await mermaidPromise;
  if (lastTheme !== currentTheme()) {
    api.initialize(mermaidConfig(currentTheme()));
    lastTheme = currentTheme();
  }
  return api;
}

/** @internal — exposed only for unit tests; do not import elsewhere. */
export const __test__ = { parseColor, mixColors, normalizeForMermaid };

export async function renderMermaid(source: string): Promise<string> {
  const api = await loadMermaid();
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
