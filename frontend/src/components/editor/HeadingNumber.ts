import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { computeHeadingNumbers } from '@/utils/headingNumber';

/**
 * Yuque-style live heading numbering for the Tiptap rich-text editor.
 *
 * Display-only: numbers are ProseMirror *decorations* (a ``data-jz-num`` attr
 * on each heading node, surfaced via CSS ``::before``), never part of the
 * document — so the serialized Markdown stays clean. Numbers recompute on every
 * doc change and use the shared {@link computeHeadingNumbers} so the rich-text
 * editor agrees with the source editor, the reader and the outline.
 *
 * Enabled state is toggled with the ``setHeadingNumbering`` command (the React
 * wrapper syncs it from the document's ``heading_numbering`` flag) so no editor
 * re-creation is needed when the toggle flips.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    headingNumber: {
      setHeadingNumbering: (enabled: boolean) => ReturnType;
    };
  }
}

export const headingNumberPluginKey = new PluginKey<HeadingNumberState>('jzHeadingNumber');

interface HeadingNumberState {
  enabled: boolean;
  decorations: DecorationSet;
}

function buildDecorations(state: EditorState): DecorationSet {
  // Collect headings in document order, then number them in one pass.
  const headings: { pos: number; nodeSize: number; level: number }[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      headings.push({ pos, nodeSize: node.nodeSize, level: node.attrs.level as number });
    }
    return true;
  });
  if (headings.length === 0) return DecorationSet.empty;
  const numbers = computeHeadingNumbers(headings.map((h) => h.level));
  const decos: Decoration[] = [];
  headings.forEach((h, i) => {
    const number = numbers[i];
    if (!number) return;
    decos.push(
      Decoration.node(h.pos, h.pos + h.nodeSize, {
        'data-jz-num': number,
        class: 'jz-has-heading-num',
      }),
    );
  });
  return DecorationSet.create(state.doc, decos);
}

export const HeadingNumber = Extension.create<{ enabled: boolean }>({
  name: 'headingNumber',

  addOptions() {
    return { enabled: false };
  },

  addCommands() {
    return {
      setHeadingNumbering:
        (enabled: boolean) =>
        ({ state, dispatch }) => {
          if (dispatch) {
            dispatch(state.tr.setMeta(headingNumberPluginKey, { enabled }));
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const initialEnabled = this.options.enabled;
    return [
      new Plugin<HeadingNumberState>({
        key: headingNumberPluginKey,
        state: {
          init: (_config, state) => ({
            enabled: initialEnabled,
            decorations: initialEnabled ? buildDecorations(state) : DecorationSet.empty,
          }),
          apply: (tr: Transaction, value, _oldState, newState) => {
            const meta = tr.getMeta(headingNumberPluginKey) as { enabled: boolean } | undefined;
            const enabled = meta ? meta.enabled : value.enabled;
            if (!enabled) return { enabled, decorations: DecorationSet.empty };
            // Recompute when the doc changed or numbering was just switched on.
            if (meta || tr.docChanged || value.decorations === DecorationSet.empty) {
              return { enabled, decorations: buildDecorations(newState) };
            }
            return { enabled, decorations: value.decorations.map(tr.mapping, tr.doc) };
          },
        },
        props: {
          decorations(state) {
            return headingNumberPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
