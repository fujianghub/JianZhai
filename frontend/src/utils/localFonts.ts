/**
 * Device-installed Chinese fonts as reader presets, at zero download cost.
 *
 * Detection measures a test string on a canvas with the candidate family
 * falling back to two *different* generic families: when the candidate is
 * installed both renders use it and agree; when it is missing they fall back
 * to monospace vs. serif and disagree. ``document.fonts.check`` is useless for
 * this — it reports ``true`` for any family without a matching ``@font-face``.
 *
 * Only families that commonly ship with Windows / macOS / iOS / Android are
 * probed, so the list stays short and every entry is genuinely renderable.
 */

export interface LocalFontCandidate {
  /** Preset key, ``local:`` prefixed so storage / pickers can tell it apart. */
  key: string;
  label: string;
  /** Family names to try, most specific first (Windows + macOS spellings). */
  families: string[];
  /** Generic fallback appended to the stack. */
  generic: 'serif' | 'sans-serif';
}

export const LOCAL_FONT_CANDIDATES: LocalFontCandidate[] = [
  { key: 'local:fangsong', label: '仿宋 · 本机', families: ['FangSong', '仿宋', 'STFangsong', '华文仿宋', 'FangSong_GB2312'], generic: 'serif' },
  { key: 'local:kaiti', label: '楷体 · 本机', families: ['KaiTi', '楷体', 'STKaiti', '华文楷体', 'Kaiti SC'], generic: 'serif' },
  { key: 'local:songti', label: '宋体 · 本机', families: ['SimSun', '宋体', 'Songti SC', 'STSong', '华文宋体'], generic: 'serif' },
  { key: 'local:heiti', label: '黑体 · 本机', families: ['SimHei', '黑体', 'Heiti SC', 'STHeiti', '华文黑体'], generic: 'sans-serif' },
  { key: 'local:yahei', label: '微软雅黑 · 本机', families: ['Microsoft YaHei', '微软雅黑'], generic: 'sans-serif' },
  { key: 'local:pingfang', label: '苹方 · 本机', families: ['PingFang SC', '苹方-简'], generic: 'sans-serif' },
  { key: 'local:yuanti', label: '圆体 · 本机', families: ['Yuanti SC', 'YouYuan', '幼圆', 'HYQiHei'], generic: 'sans-serif' },
];

const TEST_TEXT = '中文字体检测 The quick brown fox 0123';

function measurer(): ((font: string) => number) | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    return (font: string) => {
      ctx.font = `48px ${font}`;
      return ctx.measureText(TEST_TEXT).width;
    };
  } catch {
    return null;
  }
}

/** Whether ``family`` is installed on this device (false when undeterminable). */
export function isLocalFontAvailable(family: string, measure = measurer()): boolean {
  if (!measure) return false;
  const q = `"${family.replace(/"/g, '')}"`;
  const withMono = measure(`${q}, monospace`);
  const withSerif = measure(`${q}, serif`);
  const mono = measure('monospace');
  const serif = measure('serif');
  // Present: both probes render in `family` and agree. Absent: each probe
  // equals its own fallback.
  return withMono === withSerif && (withMono !== mono || withSerif !== serif);
}

export interface LocalFontPreset {
  key: string;
  label: string;
  stack: string;
}

let cached: LocalFontPreset[] | null = null;

/** Presets for the candidates actually installed here (memoised per page). */
export function detectLocalFonts(force = false): LocalFontPreset[] {
  if (cached && !force) return cached;
  const measure = measurer();
  const out: LocalFontPreset[] = [];
  if (measure) {
    for (const c of LOCAL_FONT_CANDIDATES) {
      const hit = c.families.find((f) => isLocalFontAvailable(f, measure));
      if (hit) {
        const quoted = c.families.map((f) => (/[\s一-鿿]/.test(f) ? `"${f}"` : f));
        out.push({ key: c.key, label: c.label, stack: `${quoted.join(', ')}, ${c.generic}` });
      }
    }
  }
  cached = out;
  return out;
}

/** Stack for a ``local:`` key even before detection ran (storage may hold one). */
export function localFontStack(key: string): string | null {
  const c = LOCAL_FONT_CANDIDATES.find((x) => x.key === key);
  if (!c) return null;
  const quoted = c.families.map((f) => (/[\s一-鿿]/.test(f) ? `"${f}"` : f));
  return `${quoted.join(', ')}, ${c.generic}`;
}

export function isLocalFontKey(key: string | null | undefined): boolean {
  return !!key && key.startsWith('local:');
}
