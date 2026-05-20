import { Extension } from '@tiptap/core';
import '@tiptap/extension-text-style';

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

export const FONT_FAMILY_PRESETS: Array<{ label: string; value: string }> = [
  { label: '默认', value: '' },
  { label: '宋体 / Serif', value: '"Noto Serif SC", "Songti SC", "SimSun", serif' },
  { label: '黑体 / Sans', value: '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif' },
  { label: '楷体', value: '"Kaiti SC", "STKaiti", "KaiTi", cursive' },
  { label: '等宽 / Mono', value: '"JetBrains Mono", "Fira Code", "Source Code Pro", monospace' },
];
