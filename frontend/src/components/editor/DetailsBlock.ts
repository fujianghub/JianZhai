import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    detailsBlock: {
      insertDetails: (summary?: string) => ReturnType;
    };
  }
}

/**
 * Collapsible "details / summary" block. Yuque calls this 折叠列表.
 *
 * Schema:
 *   detailsBlock(summary attr) { ... block content ... }
 *
 * Rendered HTML uses native <details><summary>…</summary>…</details> so it
 * works without JavaScript on the public reader side. In the editor we render
 * the same tags — Tiptap routes editing into the contenteditable details body.
 *
 * Markdown serialization uses the same `:::details Title` container syntax
 * the project already uses for callouts (markdown-it-container).
 */
export const DetailsBlock = Node.create({
  name: 'detailsBlock',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      summary: {
        default: '详细内容',
        parseHTML: (el) => {
          const sum = el.querySelector('summary');
          return sum?.textContent?.trim() || '详细内容';
        },
        renderHTML: () => ({}),
      },
      open: {
        default: false,
        parseHTML: (el) => (el as HTMLDetailsElement).hasAttribute('open'),
        renderHTML: (attrs) => (attrs.open ? { open: 'open' } : {}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'details',
        priority: 51,
        // Without contentElement, ProseMirror parses ALL children — including
        // the <summary> — into the body, duplicating the summary text on every
        // HTML paste / markdown reload. Prefer our own body wrapper; fall back
        // to the <details> element itself for foreign HTML (the summary attr
        // is still extracted separately above).
        contentElement: (el: HTMLElement) =>
          (el.querySelector(':scope > .jz-details-body') as HTMLElement | null) ?? el,
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const summary = (node.attrs.summary as string) || '详细内容';
    return [
      'details',
      mergeAttributes({ class: 'jz-details-block' }, HTMLAttributes),
      ['summary', {}, summary],
      ['div', { class: 'jz-details-body' }, 0],
    ];
  },

  addCommands() {
    return {
      insertDetails:
        (summary?: string) =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: { summary: summary || '详细内容' },
              content: [{ type: 'paragraph' }],
            })
            .run(),
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: {
            write: (s: string) => void;
            ensureNewLine: () => void;
            renderContent: (n: unknown) => void;
            closeBlock: (n: unknown) => void;
          },
          node: { attrs: { summary?: string } }
        ) {
          const summary = node.attrs.summary || '详细内容';
          state.write(`:::details ${summary}\n`);
          state.renderContent(node);
          state.ensureNewLine();
          state.write(':::');
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});
