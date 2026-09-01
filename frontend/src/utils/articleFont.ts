/**
 * Reader-side font preference for article body text. Persists in
 * ``localStorage`` so the choice survives across pages and tabs.
 *
 * Each preset ships a *stack* with sane CJK fallbacks — never just the
 * Latin face alone — so Chinese text always finds a usable glyph even when
 * the user picks an English-only family.
 */

import { useEffect, useState } from 'react';
import {
  FONT_STACK_GEORGIA_READER,
  FONT_STACK_KAI,
  FONT_STACK_MONO,
  FONT_STACK_NOTO_SANS_READER,
  FONT_STACK_SANS,
  FONT_STACK_XIAOWEI_READER,
  FONT_STACK_SERIF,
  FONT_STACK_VERDANA_READER,
  FONT_STACK_WENKAI,
} from './fontStacks';
import { detectLocalFonts, isLocalFontKey, localFontStack } from './localFonts';

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
  // Stacks are shared with the token layer via fontStacks.ts（自托管字体）.
  {
    key: 'songti',
    label: '宋体 · 古风（默认）',
    stack: FONT_STACK_SERIF,
  },
  {
    key: 'verdana',
    label: 'Verdana',
    stack: FONT_STACK_VERDANA_READER,
  },
  {
    key: 'system',
    label: '系统无衬线',
    stack: FONT_STACK_SANS,
  },
  {
    key: 'kaiti',
    label: '楷体 · 手书',
    stack: FONT_STACK_KAI,
  },
  {
    key: 'wenkai',
    label: '文楷 · 屏显',
    stack: FONT_STACK_WENKAI,
  },
  {
    key: 'mono',
    label: '等宽 · JetBrains Mono',
    stack: FONT_STACK_MONO,
  },
  {
    key: 'georgia',
    label: 'Georgia · 西文衬线',
    stack: FONT_STACK_GEORGIA_READER,
  },
  {
    key: 'notosans',
    label: '思源黑体 · 现代',
    stack: FONT_STACK_NOTO_SANS_READER,
  },
  {
    key: 'xiaowei',
    label: '站酷小薇 · 秀丽',
    stack: FONT_STACK_XIAOWEI_READER,
  },
];

/**
 * Bundled presets plus the device fonts detected on this machine (``local:``
 * keys, see ``localFonts.ts``). Shared by the Markdown reader's font picker and
 * the EPUB reader so both offer the same list and the same stored choice.
 */
export function getArticleFontPresets(): ArticleFontPreset[] {
  return [...ARTICLE_FONT_PRESETS, ...detectLocalFonts()];
}

/** React hook: presets including device fonts (detection runs after mount). */
export function useArticleFontPresets(): ArticleFontPreset[] {
  const [presets, setPresets] = useState<ArticleFontPreset[]>(ARTICLE_FONT_PRESETS);
  useEffect(() => {
    setPresets(getArticleFontPresets());
  }, []);
  return presets;
}

const STORAGE_KEY = 'jz-article-font';

export function loadArticleFont(): string {
  try {
    const k = localStorage.getItem(STORAGE_KEY);
    if (k && (ARTICLE_FONT_PRESETS.some((p) => p.key === k) || (isLocalFontKey(k) && localFontStack(k)))) return k;
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
    (isLocalFontKey(key) ? localFontStack(key) : null) ??
    ARTICLE_FONT_PRESETS[0].stack
  );
}
