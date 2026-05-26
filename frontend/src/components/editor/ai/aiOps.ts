import { createElement, type ReactNode } from 'react';
import type { AIOperation } from '@/api/ai';
import {
  JzAiContinueIcon,
  JzAiPolishIcon,
  JzAiExpandIcon,
  JzAiFixIcon,
  JzAiSummarizeIcon,
  JzAiGenOutlineIcon,
  JzAiTranslateEnIcon,
  JzAiTranslateZhIcon,
} from '@/components/common/JzIcon';

export interface AIOpDef {
  key: AIOperation;
  label: string;
  hint: string;
  icon: ReactNode;
  /** When true, replace the selection with the result. When false, insert after. */
  replace: boolean;
}

const ICON_SIZE = 18;

export const AI_OPS: AIOpDef[] = [
  {
    key: 'continue',
    label: '续写',
    hint: '基于当前段落延展',
    icon: createElement(JzAiContinueIcon, { size: ICON_SIZE }),
    replace: false,
  },
  {
    key: 'polish',
    label: '润色',
    hint: '让文字更流畅',
    icon: createElement(JzAiPolishIcon, { size: ICON_SIZE }),
    replace: true,
  },
  {
    key: 'expand',
    label: '扩写',
    hint: '补充细节与例子',
    icon: createElement(JzAiExpandIcon, { size: ICON_SIZE }),
    replace: true,
  },
  {
    key: 'fix',
    label: '纠错',
    hint: '修正错别字 / 语法',
    icon: createElement(JzAiFixIcon, { size: ICON_SIZE }),
    replace: true,
  },
  {
    key: 'summarize',
    label: '总结',
    hint: '提炼 3-5 句要点',
    icon: createElement(JzAiSummarizeIcon, { size: ICON_SIZE }),
    replace: false,
  },
  {
    key: 'outline',
    label: '生成大纲',
    hint: 'H2/H3 结构',
    icon: createElement(JzAiGenOutlineIcon, { size: ICON_SIZE }),
    replace: false,
  },
  {
    key: 'translate_en',
    label: '翻译为英文',
    hint: 'EN',
    icon: createElement(JzAiTranslateEnIcon, { size: ICON_SIZE }),
    replace: false,
  },
  {
    key: 'translate_zh',
    label: '翻译为中文',
    hint: 'ZH',
    icon: createElement(JzAiTranslateZhIcon, { size: ICON_SIZE }),
    replace: false,
  },
];

export const AI_PRESETS_DOC: Array<{ key: AIOperation; label: string; hint: string }> = [
  { key: 'summarize', label: '总结全文', hint: '提炼 3-5 句要点' },
  { key: 'outline', label: '生成大纲', hint: 'H2/H3 树状结构' },
  { key: 'translate_en', label: '翻译为英文', hint: '保留 Markdown' },
];
