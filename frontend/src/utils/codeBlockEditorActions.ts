import type { Editor } from '@tiptap/react';
import type { Node as PmNode } from '@tiptap/pm/model';
import {
  broadcastPrefsChange,
  loadCodeBlockPrefs,
  saveCodeBlockPrefs,
  type CodeBlockPrefs,
  type IndentMode,
} from './codeBlockPrefs';
import { isDiagramLanguage } from './codeBlocks';

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

export function syncCodeBlockStyleToDocument(editor: Editor, prefs: Partial<CodeBlockPrefs>) {
  // Global prefs (font / line-height / wrap / line-numbers) + the new default
  // theme for future blocks.
  saveCodeBlockPrefs(prefs);
  broadcastPrefsChange();

  // Theme is a per-block node attribute, so push it explicitly onto every
  // existing code block — otherwise blocks that already carry their own theme
  // would keep it and "同步到全文" would appear to do nothing.
  const theme = prefs.theme;
  if (!theme) return;
  const { state, view } = editor;
  const tr = state.tr;
  let changed = false;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return;
    // Diagram blocks (Mermaid / PlantUML) keep their own appearance — never
    // overwrite their theme from a "同步到全文".
    if (isDiagramLanguage(node.attrs.language as string)) return;
    if (node.attrs.theme === theme) return;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, theme });
    changed = true;
  });
  if (changed) view.dispatch(tr);
}

export function syncCodeBlockStyleAndLanguageToDocument(
  editor: Editor,
  language: string,
  theme?: string,
) {
  const prefs = loadCodeBlockPrefs();
  // Promote the source block's theme to the global default (for new blocks),
  // alongside the other global style prefs.
  saveCodeBlockPrefs(theme ? { ...prefs, theme: theme as CodeBlockPrefs['theme'] } : prefs);
  broadcastPrefsChange();

  const { state, view } = editor;
  const tr = state.tr;
  let changed = false;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return;
    // Diagram blocks stay independent — don't rewrite their language (you'd
    // never want a Mermaid block turned into the synced language) or theme.
    if (isDiagramLanguage(node.attrs.language as string)) return;
    // Stamp language AND (per-block) theme onto every code block. Theme is a
    // node attribute now, so without this the "样式" half would no-op.
    const attrs: Record<string, unknown> = { ...node.attrs, language };
    if (theme) attrs.theme = theme;
    tr.setNodeMarkup(pos, undefined, attrs);
    changed = true;
  });
  if (changed) view.dispatch(tr);
}
