/**
 * Reader-side *layout* preferences for the blog post body: font scale,
 * line-height and content measure (max line width). Persists in
 * ``localStorage`` so the choice survives across pages and tabs — same
 * pattern as ``articleFont.ts`` / ``paper.ts``.
 *
 * Applied as CSS variables on the ``<article>`` element so they scope only
 * to the current reader's view and never touch the persisted document. Only
 * the Markdown reading path consumes them (the HTML reader lives in a sandbox
 * iframe we cannot restyle from the parent, and binary previews have no body
 * text to scale).
 */

export interface ReaderLayout {
  /** Body ``font-size`` multiplier (1 = design default). */
  fontScale: number;
  /** Unitless ``line-height`` for the body. */
  lineHeight: number;
  /** CSS ``max-width`` for the article card; ``'100%'`` means full column. */
  measure: string;
  /** 长图限高（cap 到 70vh + 极端长图折叠）总开关，默认开启。 */
  longImageLimit: boolean;
}

export interface LabeledOption<T> {
  key: string;
  label: string;
  value: T;
  hint?: string;
}

/** Discrete font-scale ladder the +/- stepper snaps onto. */
export const FONT_SCALE_STEPS = [0.875, 1, 1.125, 1.25, 1.4];

/**
 * Continuous font-scale bounds the slider spans (50%–150% of the design
 * default). The stepper ladder sits inside this range, so ➖/➕ walk the
 * discrete stops while the slider can reach the wider clamp ends.
 */
export const FONT_SCALE_MIN = 0.5;
export const FONT_SCALE_MAX = 1.5;

export const LINE_HEIGHT_OPTIONS: LabeledOption<number>[] = [
  { key: 'compact', label: '紧凑', value: 1.6 },
  { key: 'normal', label: '标准', value: 1.85 },
  { key: 'loose', label: '宽松', value: 2.15 },
];

export const MEASURE_OPTIONS: LabeledOption<string>[] = [
  { key: 'narrow', label: '窄', value: '720px', hint: '约 38 字/行' },
  { key: 'standard', label: '适中', value: '860px', hint: '约 45 字/行' },
  { key: 'wide', label: '满栏', value: '100%', hint: '铺满栏宽' },
];

export const DEFAULT_LAYOUT: ReaderLayout = {
  fontScale: 1,
  lineHeight: LINE_HEIGHT_OPTIONS[1].value, // 1.85
  measure: MEASURE_OPTIONS[2].value, // 100% (满栏，保持原满栏外观)
  longImageLimit: true,
};

const K_SCALE = 'jz-reader-font-scale';
const K_LH = 'jz-reader-line-height';
const K_MEASURE = 'jz-reader-measure';
const K_LONGIMG = 'jz-reader-longimg';

function num(raw: string | null, fallback: number): number {
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function clampScale(v: number): number {
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, v));
}

export function loadReaderLayout(): ReaderLayout {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_LAYOUT };
  try {
    return {
      fontScale: clampScale(num(localStorage.getItem(K_SCALE), DEFAULT_LAYOUT.fontScale)),
      lineHeight: num(localStorage.getItem(K_LH), DEFAULT_LAYOUT.lineHeight),
      measure: localStorage.getItem(K_MEASURE) || DEFAULT_LAYOUT.measure,
      longImageLimit: localStorage.getItem(K_LONGIMG) !== 'off',
    };
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

export function saveReaderLayout(layout: ReaderLayout): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(K_SCALE, String(layout.fontScale));
    localStorage.setItem(K_LH, String(layout.lineHeight));
    localStorage.setItem(K_MEASURE, layout.measure);
    localStorage.setItem(K_LONGIMG, layout.longImageLimit ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

export function clearReaderLayout(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(K_SCALE);
    localStorage.removeItem(K_LH);
    localStorage.removeItem(K_MEASURE);
    localStorage.removeItem(K_LONGIMG);
  } catch {
    /* ignore */
  }
}

/** Next/previous font-scale step, snapped onto {@link FONT_SCALE_STEPS}. */
export function stepFontScale(current: number, dir: 1 | -1): number {
  let idx = 0;
  let best = Infinity;
  FONT_SCALE_STEPS.forEach((s, i) => {
    const d = Math.abs(s - current);
    if (d < best) {
      best = d;
      idx = i;
    }
  });
  const next = Math.min(FONT_SCALE_STEPS.length - 1, Math.max(0, idx + dir));
  return FONT_SCALE_STEPS[next];
}
