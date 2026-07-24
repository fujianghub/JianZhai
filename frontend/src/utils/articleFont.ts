/**
 * Reader-side font preference for article body text. Persists in
 * ``localStorage`` so the choice survives across pages and tabs.
 *
 * Each preset ships a *stack* with sane CJK fallbacks — never just the
 * Latin face alone — so Chinese text always finds a usable glyph even when
 * the user picks an English-only family.
 */

export interface ArticleFontPreset {
  key: string;
  label: string;
  /** CSS ``font-family`` value applied to the article body. */
  stack: string;
}

export const ARTICLE_FONT_PRESETS: ArticleFontPreset[] = [
  // Songti leads: the serif face matches the rice-paper/cinnabar identity,
  // and Verdana (no CJK glyphs) produced a mismatched Latin/苹方 hybrid as
  // the old default. First preset = default for visitors with no saved pick.
  {
    key: 'songti',
    label: '宋体 · 古风（默认）',
    stack:
      '"Noto Serif SC", "Songti SC", "STSong", "SimSun", "Cormorant Garamond", Georgia, serif',
  },
  {
    key: 'verdana',
    label: 'Verdana',
    stack:
      'Verdana, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
  },
  {
    key: 'system',
    label: '系统无衬线',
    stack:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  },
  {
    key: 'kaiti',
    label: '楷体 · 手书',
    stack: '"KaiTi", "STKaiti", "Kaiti SC", "Ma Shan Zheng", serif',
  },
  {
    key: 'mono',
    label: '等宽 · JetBrains Mono',
    stack: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  {
    key: 'georgia',
    label: 'Georgia · 西文衬线',
    stack:
      'Georgia, "Cormorant Garamond", "EB Garamond", "Noto Serif SC", "Songti SC", serif',
  },
];

const STORAGE_KEY = 'jz-article-font';

export function loadArticleFont(): string {
  try {
    const k = localStorage.getItem(STORAGE_KEY);
    if (k && ARTICLE_FONT_PRESETS.some((p) => p.key === k)) return k;
  } catch {
    /* ignore */
  }
  return ARTICLE_FONT_PRESETS[0].key;
}

export function saveArticleFont(key: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* ignore */
  }
}

export function stackFor(key: string): string {
  return (
    ARTICLE_FONT_PRESETS.find((p) => p.key === key)?.stack ??
    ARTICLE_FONT_PRESETS[0].stack
  );
}
