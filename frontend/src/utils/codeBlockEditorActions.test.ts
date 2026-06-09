import { describe, it, expect } from 'vitest';
import {
  syncCodeBlockStyleToDocument,
  syncCodeBlockStyleAndLanguageToDocument,
} from './codeBlockEditorActions';

/** Minimal ProseMirror-ish editor stub: a doc with a few nodes, a transaction
 *  that records setNodeMarkup calls, and a view that captures the dispatch. */
function makeEditor(nodes: Array<{ type: { name: string }; attrs: Record<string, unknown> }>) {
  const markups: Array<{ pos: number; attrs: Record<string, unknown> }> = [];
  let dispatched = false;
  const tr = {
    setNodeMarkup(pos: number, _type: unknown, attrs: Record<string, unknown>) {
      markups.push({ pos, attrs });
      return tr;
    },
  };
  const editor = {
    state: {
      tr,
      doc: {
        descendants(cb: (node: (typeof nodes)[number], pos: number) => void) {
          nodes.forEach((n, i) => cb(n, i));
        },
      },
    },
    view: {
      dispatch() {
        dispatched = true;
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { editor: editor as any, markups, wasDispatched: () => dispatched };
}

function codeBlock(attrs: Record<string, unknown> = {}) {
  return { type: { name: 'codeBlock' }, attrs: { language: 'text', theme: '', ...attrs } };
}
const paragraph = { type: { name: 'paragraph' }, attrs: {} };

describe('syncCodeBlockStyleToDocument', () => {
  it('stamps the theme onto every code block, skipping non-code nodes', () => {
    const { editor, markups, wasDispatched } = makeEditor([
      codeBlock({ theme: 'one-dark-pro' }),
      paragraph,
      codeBlock({ theme: '' }),
    ]);
    syncCodeBlockStyleToDocument(editor, { theme: 'yuque-light' });
    expect(wasDispatched()).toBe(true);
    // Only the two code blocks (positions 0 and 2) get re-marked.
    expect(markups.map((m) => m.pos)).toEqual([0, 2]);
    expect(markups.every((m) => m.attrs.theme === 'yuque-light')).toBe(true);
  });

  it('does nothing to nodes when no theme is provided', () => {
    const { editor, markups } = makeEditor([codeBlock()]);
    syncCodeBlockStyleToDocument(editor, { wrap: true });
    expect(markups).toEqual([]);
  });
});

describe('syncCodeBlockStyleAndLanguageToDocument', () => {
  it('stamps BOTH language and theme onto every code block (bug: theme was dropped)', () => {
    const { editor, markups, wasDispatched } = makeEditor([
      codeBlock({ language: 'python', theme: 'darcula' }),
      paragraph,
      codeBlock({ language: 'js', theme: '' }),
    ]);
    syncCodeBlockStyleAndLanguageToDocument(editor, 'rust', 'night-owl');
    expect(wasDispatched()).toBe(true);
    expect(markups.map((m) => m.pos)).toEqual([0, 2]);
    for (const m of markups) {
      expect(m.attrs.language).toBe('rust');
      expect(m.attrs.theme).toBe('night-owl');
    }
  });

  it('still syncs language when no theme is passed (back-compat)', () => {
    const { editor, markups } = makeEditor([codeBlock({ language: 'python', theme: 'darcula' })]);
    syncCodeBlockStyleAndLanguageToDocument(editor, 'go');
    expect(markups[0].attrs.language).toBe('go');
    // Theme left untouched when not provided.
    expect(markups[0].attrs.theme).toBe('darcula');
  });
});
