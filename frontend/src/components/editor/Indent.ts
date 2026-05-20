import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

const MAX_LEVEL = 6;
const STEP = 2; // em

export const Indent = Extension.create({
  name: 'indent',

  addOptions() {
    return {
      types: ['paragraph', 'heading', 'blockquote'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => {
              const raw = (el as HTMLElement).getAttribute('data-indent');
              if (raw) {
                const n = parseInt(raw, 10);
                if (!Number.isNaN(n)) return Math.max(0, Math.min(MAX_LEVEL, n));
              }
              const padding = (el as HTMLElement).style.paddingLeft || '';
              const m = padding.match(/^([\d.]+)em$/);
              if (m) {
                const em = parseFloat(m[1]);
                return Math.max(0, Math.min(MAX_LEVEL, Math.round(em / STEP)));
              }
              return 0;
            },
            renderHTML: (attrs) => {
              const lv = (attrs.indent as number) || 0;
              if (!lv) return {};
              return {
                'data-indent': String(lv),
                style: `padding-left: ${lv * STEP}em`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      indent:
        () =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          let changed = false;
          state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (!this.options.types.includes(node.type.name)) return;
            const cur = (node.attrs.indent as number) || 0;
            const next = Math.min(MAX_LEVEL, cur + 1);
            if (next !== cur) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
              changed = true;
            }
          });
          if (changed && dispatch) dispatch(tr);
          return changed;
        },
      outdent:
        () =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          let changed = false;
          state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (!this.options.types.includes(node.type.name)) return;
            const cur = (node.attrs.indent as number) || 0;
            const next = Math.max(0, cur - 1);
            if (next !== cur) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
              changed = true;
            }
          });
          if (changed && dispatch) dispatch(tr);
          return changed;
        },
    };
  },

  addKeyboardShortcuts() {
    // Tab / Shift-Tab only when not in a list (list extension already takes Tab
    // for nesting). We yield to the list handler by returning false there.
    const isInListItem = (editor: import('@tiptap/core').Editor) =>
      editor.isActive('listItem') || editor.isActive('taskItem');
    return {
      Tab: ({ editor }) => {
        if (isInListItem(editor)) return false;
        return this.editor.commands.indent();
      },
      'Shift-Tab': ({ editor }) => {
        if (isInListItem(editor)) return false;
        return this.editor.commands.outdent();
      },
    };
  },
});
