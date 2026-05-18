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
}

export const CALLOUT_TEMPLATES: CalloutPreset[] = [
  { slug: 'tips', label: '💡 提示', hint: '友好的提示信息' },
  { slug: 'info', label: 'ⓘ  说明', hint: '中性补充说明' },
  { slug: 'note', label: '※  注意', hint: '需要留意的细节' },
  { slug: 'warning', label: '⚠  警告', hint: '潜在风险或不推荐做法' },
  { slug: 'danger', label: '✕  危险', hint: '严重风险或错误' },
  { slug: 'success', label: '✓  成功', hint: '完成 / 推荐做法' },
  { slug: 'color1', label: '🟦  专业术语', hint: '蓝色：术语定义' },
  { slug: 'color2', label: '🟪  类比讲解', hint: '紫色：类比 / 举例' },
  { slug: 'color3', label: '🟩  操作步骤', hint: '绿色：步骤清单' },
  { slug: 'color4', label: '🟧  深入理解', hint: '橙色：原理深挖' },
  { slug: 'color5', label: '🟥  关键要点', hint: '红色：核心结论' },
];

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
