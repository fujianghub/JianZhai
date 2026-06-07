import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tabs: {
      insertTabs: (count?: number) => ReturnType;
    };
  }
}

/**
 * Tabbed content container.
 *
 * Schema:
 *   tabs(activeIndex attr) { tabPanel+ }
 *   tabPanel(label attr) { block+ }
 *
 * In the editor we render the panels in sequence with their labels as
 * headings so the user can edit content without JS gymnastics. On the public
 * reader side a small script (added in markdown.ts) hides inactive panels
 * and wires the label buttons.
 */
export const TabPanel = Node.create({
  name: 'tabPanel',
  content: 'block+',
  isolating: true,
  defining: true,

  addAttributes() {
    return {
      label: {
        default: '标签页',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-label') || '标签页',
        renderHTML: (attrs) => ({ 'data-label': String(attrs.label ?? '标签页') }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-jz-tab-panel]',
        // Skip the non-editable label element when parsing the panel back —
        // without contentElement the label text was duplicated into the body
        // on every reload (the label itself lives in the data-label attr).
        contentElement: (el: HTMLElement) =>
          (el.querySelector(':scope > .jz-tab-panel-body') as HTMLElement | null) ?? el,
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-jz-tab-panel': '',
        class: 'jz-tab-panel',
      }),
      ['div', { class: 'jz-tab-panel-label', contenteditable: 'false' }, String(node.attrs.label ?? '标签页')],
      ['div', { class: 'jz-tab-panel-body' }, 0],
    ];
  },
});

export const Tabs = Node.create({
  name: 'tabs',
  group: 'block',
  content: 'tabPanel{1,8}',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-jz-tabs]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-jz-tabs': '', class: 'jz-tabs' }), 0];
  },

  addCommands() {
    return {
      insertTabs:
        (count = 2) =>
        ({ chain }) => {
          const panels = Array.from({ length: Math.max(1, Math.min(8, count)) }).map((_, i) => ({
            type: 'tabPanel',
            attrs: { label: `标签 ${i + 1}` },
            content: [{ type: 'paragraph' }],
          }));
          return chain().focus().insertContent({ type: 'tabs', content: panels }).run();
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
          node: { forEach: (cb: (child: { attrs: { label?: string } }) => void) => void }
        ) {
          state.write(':::tabs\n');
          node.forEach((panel) => {
            const label = panel.attrs.label || '标签页';
            state.write(`::tab ${label}\n`);
            state.renderContent(panel);
            state.ensureNewLine();
          });
          state.write(':::');
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});
