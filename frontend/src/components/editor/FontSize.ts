import { Extension } from '@tiptap/core';
import '@tiptap/extension-text-style';
import {
  FONT_STACK_KAI,
  FONT_STACK_MONO,
  FONT_STACK_SANS,
  FONT_STACK_SERIF,
  FONT_STACK_WENKAI,
} from '@/utils/fontStacks';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

export const FontSize = Extension.create({
  name: 'fontSize',

  addOptions() {
    return {
      types: ['textStyle'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
            renderHTML: (attrs) => {
              if (!attrs.fontSize) return {};
              return { style: `font-size: ${attrs.fontSize}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (size) =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

export const FONT_SIZE_PRESETS: Array<{ label: string; value: string }> = [
  { label: '12', value: '12px' },
  { label: '14', value: '14px' },
  { label: '15', value: '15px' },
  { label: '16', value: '16px' },
  { label: '18', value: '18px' },
  { label: '20', value: '20px' },
  { label: '24', value: '24px' },
  { label: '30', value: '30px' },
  { label: '36', value: '36px' },
];

/* 栈与阅读端 articleFont.ts 同源（fontStacks.ts）。这里的值会随 FontFamily
   mark 持久化进保存的富文本，故必须是实值栈而非 var() —— 导出的 HTML/PDF
   离开站点后 CSS 变量无法解析。存量文档内嵌的旧字面量栈不迁移（渲染无害）。 */
export const FONT_FAMILY_PRESETS: Array<{ label: string; value: string }> = [
  { label: '默认', value: '' },
  { label: '宋体 / Serif', value: FONT_STACK_SERIF },
  { label: '黑体 / Sans', value: FONT_STACK_SANS },
  { label: '楷体', value: FONT_STACK_KAI },
  { label: '文楷 · 屏显', value: FONT_STACK_WENKAI },
  { label: '等宽 / Mono', value: FONT_STACK_MONO },
];
