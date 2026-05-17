/** Paper-style presets for the blog post reader background. */

export interface PaperStyle {
  key: string;
  label: string;
  className: string;
  hint?: string;
}

export const PAPER_STYLES: PaperStyle[] = [
  { key: '', label: '默认', className: 'paper-default', hint: '纯色（跟随主题）' },
  { key: 'rice-paper', label: '宣纸', className: 'paper-rice', hint: '米色细纹，偏古风' },
  { key: 'letter-grid', label: '信笺方格', className: 'paper-letter', hint: '浅蓝方格' },
  { key: 'lines', label: '横线本', className: 'paper-lines', hint: '横线笔记本' },
  { key: 'dots', label: '点阵', className: 'paper-dots', hint: '点阵纸' },
  { key: 'marble', label: '大理石', className: 'paper-marble', hint: '低调云纹' },
  { key: 'kraft', label: '牛皮纸', className: 'paper-kraft', hint: '温暖偏黄' },
  { key: 'parchment', label: '羊皮卷', className: 'paper-parchment', hint: '古朴米色' },
];

export function paperClassName(key: string | undefined | null): string {
  return PAPER_STYLES.find((p) => p.key === (key || ''))?.className ?? 'paper-default';
}

const READER_OVERRIDE_KEY = 'jianzhai:readerPaper';

export function getReaderOverride(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(READER_OVERRIDE_KEY);
}

export function setReaderOverride(key: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (key === null) localStorage.removeItem(READER_OVERRIDE_KEY);
  else localStorage.setItem(READER_OVERRIDE_KEY, key);
}
