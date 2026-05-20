import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineToc: {
      insertToc: () => ReturnType;
    };
  }
}

/**
 * Block-level "目录" placeholder. Its rendered representation is a small card
 * that the reader-side markdown renderer expands into an actual list of
 * headings. In the editor it shows as a placeholder so the writer knows the
 * TOC will appear there.
 *
 * Markdown serialization: emits `[TOC]` on its own line — a convention shared
 * by Hexo, Hugo and many static-site generators.
 */
export const InlineToc = Node.create({
  name: 'inlineToc',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  parseHTML() {
    return [{ tag: 'div[data-jz-toc]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-jz-toc': '',
        class: 'jz-inline-toc-placeholder',
      }),
      ['span', { class: 'jz-inline-toc-label' }, '📑 目录占位'],
      ['span', { class: 'jz-inline-toc-hint' }, '（渲染时根据标题自动生成）'],
    ];
  },

  addCommands() {
    return {
      insertToc:
        () =>
        ({ chain }) =>
          chain().focus().insertContent({ type: 'inlineToc' }).run(),
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (s: string) => void; closeBlock: (n: unknown) => void }, node: unknown) {
          state.write('[TOC]');
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});
