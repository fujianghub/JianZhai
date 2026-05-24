import type { Editor } from '@tiptap/react';
import type { Node as PmNode } from '@tiptap/pm/model';
import {
  broadcastPrefsChange,
  loadCodeBlockPrefs,
  saveCodeBlockPrefs,
  type CodeBlockPrefs,
  type IndentMode,
} from './codeBlockPrefs';

export function autoIndentCodeBlock(
  editor: Editor,
  getPos: (() => number | undefined) | undefined,
  node: PmNode,
  indentMode: IndentMode,
  indentWidth: number
) {
  if (!getPos) return;
  const pos = getPos();
  if (pos === undefined) return;
  const prefix = indentMode === 'tab' ? '\t' : ' '.repeat(indentWidth);
  const text = node.textContent;
  const lines = text.split('\n');
  const indented = lines.map((line) => (line.length === 0 ? line : prefix + line)).join('\n');
  if (indented === text) return;
  const from = pos + 1;
  const to = pos + node.nodeSize - 1;
  editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      tr.replaceWith(from, to, state.schema.text(indented));
      return true;
    })
    .run();
}

export function syncCodeBlockStyleToDocument(_editor: Editor, prefs: Partial<CodeBlockPrefs>) {
  saveCodeBlockPrefs(prefs);
  broadcastPrefsChange();
}

export function syncCodeBlockStyleAndLanguageToDocument(editor: Editor, language: string) {
  const prefs = loadCodeBlockPrefs();
  saveCodeBlockPrefs(prefs);
  broadcastPrefsChange();

  const { state, view } = editor;
  const tr = state.tr;
  let changed = false;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, language });
    changed = true;
  });
  if (changed) view.dispatch(tr);
}
