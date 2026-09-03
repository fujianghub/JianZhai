import { createElement, type CSSProperties, type ReactNode } from 'react';
import { calloutGlyphUrl } from './calloutGlyphs';
/**
 * Shared catalogue of callout (色块) presets — the same metadata drives both
 * editor flavors (Markdown source and Tiptap rich-text) plus the slash menu.
 */
export interface CalloutPreset {
  /** Markdown container slug — written as ``:::${slug}``. */
  slug: string;
  /** Menu label shown to the user. */
  label: string;
  /** Tooltip / description; also seeds the default body when inserting. */
  hint: string;
  /** 阅读端 markdown.css `.jz-callout-<slug>` 的 --c / --c-icon 镜像：菜单色点与
   *  正文渲染保持同一颜色与同一字形（此前菜单 🟦 / 正文 ① 两套不对应）。 */
  color: string;
  icon: string;
}

export const CALLOUT_TEMPLATES: CalloutPreset[] = [
  { slug: 'tips', label: '提示', hint: '友好的提示信息', color: '#3b82f6', icon: '💡' },
  { slug: 'info', label: '说明', hint: '中性补充说明', color: '#6366f1', icon: 'i' },
  { slug: 'note', label: '注意', hint: '需要留意的细节', color: '#d97706', icon: '⌖' },
  { slug: 'warning', label: '警告', hint: '潜在风险或不推荐做法', color: '#f59e0b', icon: '!' },
  { slug: 'danger', label: '危险', hint: '严重风险或错误', color: '#ef4444', icon: '✕' },
  { slug: 'success', label: '成功', hint: '完成 / 推荐做法', color: '#10b981', icon: '✓' },
  { slug: 'color1', label: '专业术语', hint: '蓝色：术语定义', color: '#2f8ef4', icon: '①' },
  { slug: 'color2', label: '类比讲解', hint: '紫色：类比 / 举例', color: '#a78bfa', icon: '②' },
  { slug: 'color3', label: '操作步骤', hint: '绿色：步骤清单', color: '#22c55e', icon: '③' },
  { slug: 'color4', label: '深入理解', hint: '橙色：原理深挖', color: '#f97316', icon: '④' },
  { slug: 'color5', label: '关键要点', hint: '红色：核心结论', color: '#ef4444', icon: '⑤' },
];

/** 菜单里的色点：与阅读端 `.jz-callout::before` 同色同字形（calloutGlyphs 白色线稿），20px 圆角实心块。 */
export function calloutSwatch(preset: Pick<CalloutPreset, 'color' | 'icon' | 'slug'>): ReactNode {
  return createElement('span', {
    className: 'jz-callout-swatch',
    style: { '--c': preset.color, backgroundImage: calloutGlyphUrl(preset.slug) } as CSSProperties,
    'aria-hidden': true,
  });
}

/** Markdown body shipped when the user inserts a fresh empty callout. */
export function calloutMarkdownTemplate(slug: string): string {
  return `:::${slug}\n在此输入内容…\n:::`;
}

/** Preset palette for the inline text-colour pickers in both editors.
 *  Shared so the Markdown editor's HTML inserts and the Tiptap colour
 *  picker offer the same swatches. */
export const TEXT_COLOR_PRESETS: Array<{ label: string; value: string }> = [
  { label: '朱砂', value: '#b94a3b' },
  { label: '橙', value: '#ED740C' },
  { label: '金', value: '#b8895f' },
  { label: '蓝', value: '#2f8ef4' },
  { label: '青绿', value: '#10b981' },
  { label: '紫', value: '#a78bfa' },
  { label: '灰', value: '#8a7a5e' },
];
