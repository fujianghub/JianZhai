import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineToc: {
      /** Insert a whole-document table of contents (``[TOC]``). */
      insertToc: () => ReturnType;
      /** Insert a section table of contents (``[TOC:section]``) that lists only
       *  the headings under the enclosing heading. */
      insertSectionToc: () => ReturnType;
    };
  }
}

/**
 * Block-level "目录" placeholder. Its rendered representation is a small card
 * that the reader-side markdown renderer expands into an actual list of
 * headings. In the editor it shows as a placeholder so the writer knows the
 * TOC will appear there.
 *
 * ``scope`` = ``all`` → whole-document TOC (serialized as ``[TOC]``);
 * ``scope`` = ``section`` → only the subtree under the enclosing heading
 * (serialized as ``[TOC:section]``).
 */
export const InlineToc = Node.create({
  name: 'inlineToc',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      scope: {
        default: 'all',
        parseHTML: (el) => (el.getAttribute('data-jz-toc') === 'section' ? 'section' : 'all'),
        // Rendered via renderHTML below; not a plain HTML attribute mirror.
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-jz-toc]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const scope = node.attrs.scope === 'section' ? 'section' : '';
    const label = scope === 'section' ? '📑 本节目录占位' : '📑 目录占位';
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-jz-toc': scope,
        class: 'jz-inline-toc-placeholder',
      }),
      ['span', { class: 'jz-inline-toc-label' }, label],
      ['span', { class: 'jz-inline-toc-hint' }, '（渲染时根据标题自动生成）'],
    ];
  },

  addCommands() {
    return {
      insertToc:
        () =>
        ({ chain }) =>
          chain().focus().insertContent({ type: 'inlineToc', attrs: { scope: 'all' } }).run(),
      insertSectionToc:
        () =>
        ({ chain }) =>
          chain().focus().insertContent({ type: 'inlineToc', attrs: { scope: 'section' } }).run(),
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write: (s: string) => void; closeBlock: (n: unknown) => void },
          node: { attrs: { scope?: string } },
        ) {
          state.write(node.attrs.scope === 'section' ? '[TOC:section]' : '[TOC]');
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});
