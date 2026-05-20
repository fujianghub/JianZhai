import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columns: {
      insertColumns: (count?: 2 | 3) => ReturnType;
    };
  }
}

/**
 * Multi-column layout. Two-or-three column container with each column being
 * an independent block bucket.
 *
 * Schema:
 *   columns { column+ }
 *   column { block+ }
 *
 * Rendered as CSS Grid. Markdown serialization uses a `:::cols-N` container
 * with each column separated by a `::col` marker line — a convention chosen
 * to round-trip through the project's markdown-it-container setup.
 */
export const Column = Node.create({
  name: 'column',
  content: 'block+',
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-jz-column]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-jz-column': '', class: 'jz-column' }), 0];
  },
});

export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,4}',
  defining: true,

  addAttributes() {
    return {
      count: {
        default: 2,
        parseHTML: (el) => {
          const n = parseInt((el as HTMLElement).getAttribute('data-cols') || '2', 10);
          return Number.isNaN(n) ? 2 : Math.max(2, Math.min(4, n));
        },
        renderHTML: (attrs) => ({ 'data-cols': String(attrs.count ?? 2) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-jz-columns]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const count = (node.attrs.count as number) ?? 2;
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-jz-columns': '',
        class: `jz-columns jz-columns-${count}`,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      insertColumns:
        (count: 2 | 3 = 2) =>
        ({ chain }) => {
          const columns = Array.from({ length: count }).map(() => ({
            type: 'column',
            content: [{ type: 'paragraph' }],
          }));
          return chain()
            .focus()
            .insertContent({ type: 'columns', attrs: { count }, content: columns })
            .run();
        },
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
          node: { attrs: { count?: number }; forEach: (cb: (child: unknown) => void) => void }
        ) {
          const count = node.attrs.count ?? 2;
          state.write(`:::cols-${count}\n`);
          let first = true;
          node.forEach((child) => {
            if (!first) {
              state.ensureNewLine();
              state.write('::col\n');
            }
            first = false;
            state.renderContent(child);
          });
          state.ensureNewLine();
          state.write(':::');
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});
