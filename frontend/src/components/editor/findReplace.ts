/**
 * Tiptap 查找 / 替换扩展：在 ProseMirror 文档里全文匹配，把命中范围加上高亮
 * Decoration；通过命令切换当前匹配位 + 单条替换 + 全部替换。
 *
 * 不像 ``@tiptap-pro/extension-search-and-replace`` 是付费包，这里走 OSS 自实现。
 */
import { Editor, Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface FindMatch {
  from: number;
  to: number;
}

interface FindReplaceState {
  query: string;
  caseSensitive: boolean;
  matches: FindMatch[];
  current: number; // index into matches; -1 = none
}

const initial: FindReplaceState = {
  query: '',
  caseSensitive: false,
  matches: [],
  current: -1,
};

export const findReplaceKey = new PluginKey<FindReplaceState>('find-replace');

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    findReplace: {
      findInDoc: (query: string, opts?: { caseSensitive?: boolean }) => ReturnType;
      findNext: () => ReturnType;
      findPrev: () => ReturnType;
      replaceCurrent: (text: string) => ReturnType;
      replaceAllInDoc: (text: string) => ReturnType;
      clearFind: () => ReturnType;
    };
  }
}

export const FindReplace = Extension.create({
  name: 'findReplace',

  addProseMirrorPlugins() {
    return [
      new Plugin<FindReplaceState>({
        key: findReplaceKey,
        state: {
          init: () => ({ ...initial }),
          apply(tr, value) {
            const meta = tr.getMeta(findReplaceKey) as Partial<FindReplaceState> | undefined;
            if (meta) {
              return { ...value, ...meta };
            }
            // 文档变了，匹配位置可能失效 → 按新内容重新算
            if (tr.docChanged && value.query) {
              const matches = computeMatches(tr.doc, value.query, value.caseSensitive);
              const current = matches.length
                ? Math.min(value.current, matches.length - 1)
                : -1;
              return { ...value, matches, current };
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            const s = findReplaceKey.getState(state);
            if (!s || !s.matches.length) return null;
            const decos = s.matches.map((m, i) =>
              Decoration.inline(m.from, m.to, {
                class:
                  i === s.current ? 'jz-find-match jz-find-match-current' : 'jz-find-match',
              }),
            );
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      findInDoc:
        (query: string, opts) =>
        ({ tr, dispatch, state }) => {
          const caseSensitive = !!opts?.caseSensitive;
          const matches = query ? computeMatches(state.doc, query, caseSensitive) : [];
          const current = matches.length ? 0 : -1;
          if (dispatch) {
            tr.setMeta(findReplaceKey, { query, caseSensitive, matches, current });
            dispatch(tr);
          }
          return true;
        },
      findNext:
        () =>
        ({ tr, dispatch, state }) => {
          const s = findReplaceKey.getState(state);
          if (!s || s.matches.length === 0) return false;
          const next = (s.current + 1) % s.matches.length;
          if (dispatch) {
            tr.setMeta(findReplaceKey, { current: next });
            dispatch(tr);
          }
          return true;
        },
      findPrev:
        () =>
        ({ tr, dispatch, state }) => {
          const s = findReplaceKey.getState(state);
          if (!s || s.matches.length === 0) return false;
          const prev = (s.current - 1 + s.matches.length) % s.matches.length;
          if (dispatch) {
            tr.setMeta(findReplaceKey, { current: prev });
            dispatch(tr);
          }
          return true;
        },
      replaceCurrent:
        (text: string) =>
        ({ tr, dispatch, state }) => {
          const s = findReplaceKey.getState(state);
          if (!s || s.current < 0 || !s.matches[s.current]) return false;
          const m = s.matches[s.current];
          if (dispatch) {
            tr.insertText(text, m.from, m.to);
            // 替换后 matches 失效，让 apply() 那边在 docChanged 路径上重新算
            dispatch(tr);
          }
          return true;
        },
      replaceAllInDoc:
        (text: string) =>
        ({ tr, dispatch, state }) => {
          const s = findReplaceKey.getState(state);
          if (!s || s.matches.length === 0) return false;
          // 从后往前替换，避免前面的替换把后面的位移偏掉
          const ms = [...s.matches].sort((a, b) => b.from - a.from);
          if (dispatch) {
            for (const m of ms) tr.insertText(text, m.from, m.to);
            tr.setMeta(findReplaceKey, { matches: [], current: -1, query: '' });
            dispatch(tr);
          }
          return true;
        },
      clearFind:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(findReplaceKey, { ...initial });
            dispatch(tr);
          }
          return true;
        },
    };
  },
});

function computeMatches(doc: PMNode, query: string, caseSensitive: boolean): FindMatch[] {
  const out: FindMatch[] = [];
  if (!query) return out;
  const needle = caseSensitive ? query : query.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const hay = caseSensitive ? node.text : node.text.toLowerCase();
    let i = 0;
    while ((i = hay.indexOf(needle, i)) !== -1) {
      out.push({ from: pos + i, to: pos + i + query.length });
      i += Math.max(1, query.length);
    }
  });
  return out;
}

/** Read-only helper for the panel UI to render current/total counts. */
export function getFindState(editor: Editor): FindReplaceState | null {
  return findReplaceKey.getState(editor.state) ?? null;
}
