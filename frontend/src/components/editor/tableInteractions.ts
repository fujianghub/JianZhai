import { Extension, type Editor } from '@tiptap/core';
import {
  CellSelection,
  TableMap,
  findTable,
  moveTableColumn,
  moveTableRow,
  selectedRect,
} from '@tiptap/pm/tables';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';

/**
 * 表格交互命令（语雀级）：整行/整列选中 + 行列拖动重排。
 * 重排直接用 prosemirror-tables 1.8 自带的 moveTableRow/moveTableColumn
 * Command（含 span 处理），无需自写事务。
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableInteractions: {
      /** 选中整行（rowIndex 0-based；pos 缺省用当前选区所在表）。 */
      selectTableRow: (rowIndex: number, pos?: number) => ReturnType;
      /** 选中整列。 */
      selectTableColumn: (colIndex: number, pos?: number) => ReturnType;
      /** 行重排（库命令包装）。 */
      moveTableRowTo: (from: number, to: number, pos?: number) => ReturnType;
      /** 列重排。 */
      moveTableColumnTo: (from: number, to: number, pos?: number) => ReturnType;
      /** 全选整表（CellSelection 覆盖所有单元格，像语雀）。 */
      selectTableAll: (pos?: number) => ReturnType;
      /** 设表级「最多显示行数」（null = 不限）。 */
      setTableMaxRows: (n: number | null) => ReturnType;
      /** 设表级密度预设（清除自定义间距）。 */
      setTableDensity: (d: 'compact' | 'normal' | 'loose' | null) => ReturnType;
      /** 设表级自定义间距（行间距 v / 列间距 h，px）。 */
      setTableCellPadding: (v: number | null, h: number | null) => ReturnType;
    };
  }
}

/** 解析表格：优先 pos 所在位置，否则当前选区。返回 node 与正文起点。 */
function resolveTable(
  state: EditorState,
  pos?: number,
): { node: PMNode; start: number } | null {
  if (typeof pos === 'number') {
    const $pos = state.doc.resolve(Math.max(0, Math.min(pos, state.doc.content.size)));
    for (let d = $pos.depth; d >= 0; d--) {
      if ($pos.node(d).type.name === 'table') {
        return { node: $pos.node(d), start: $pos.start(d) };
      }
    }
    return null;
  }
  const found = findTable(state.selection.$from);
  return found ? { node: found.node, start: found.start } : null;
}

/** 构造选中整行/整列的 CellSelection 事务。 */
function makeLineSelection(
  state: EditorState,
  kind: 'row' | 'col',
  index: number,
  pos?: number,
): Transaction | null {
  const table = resolveTable(state, pos);
  if (!table) return null;
  const map = TableMap.get(table.node);
  if (kind === 'row' && (index < 0 || index >= map.height)) return null;
  if (kind === 'col' && (index < 0 || index >= map.width)) return null;
  const cellPos =
    kind === 'row'
      ? map.positionAt(index, 0, table.node)
      : map.positionAt(0, index, table.node);
  const $cell = state.doc.resolve(table.start + cellPos);
  const sel =
    kind === 'row' ? CellSelection.rowSelection($cell) : CellSelection.colSelection($cell);
  return state.tr.setSelection(sel);
}

export const TableInteractions = Extension.create({
  name: 'tableInteractions',

  addCommands() {
    return {
      selectTableRow:
        (rowIndex: number, pos?: number) =>
        ({ state, dispatch }) => {
          const tr = makeLineSelection(state, 'row', rowIndex, pos);
          if (!tr) return false;
          if (dispatch) dispatch(tr.scrollIntoView());
          return true;
        },
      selectTableColumn:
        (colIndex: number, pos?: number) =>
        ({ state, dispatch }) => {
          const tr = makeLineSelection(state, 'col', colIndex, pos);
          if (!tr) return false;
          if (dispatch) dispatch(tr.scrollIntoView());
          return true;
        },
      moveTableRowTo:
        (from: number, to: number, pos?: number) =>
        ({ state, dispatch }) =>
          moveTableRow({ from, to, pos, select: true })(state, dispatch),
      moveTableColumnTo:
        (from: number, to: number, pos?: number) =>
        ({ state, dispatch }) =>
          moveTableColumn({ from, to, pos, select: true })(state, dispatch),
      selectTableAll:
        (pos?: number) =>
        ({ state, dispatch }) => {
          const table = resolveTable(state, pos);
          if (!table) return false;
          const map = TableMap.get(table.node);
          const topLeft = table.start + map.positionAt(0, 0, table.node);
          const botRight = table.start + map.positionAt(map.height - 1, map.width - 1, table.node);
          const sel = CellSelection.create(state.doc, topLeft, botRight);
          if (dispatch) dispatch(state.tr.setSelection(sel).scrollIntoView());
          return true;
        },
      setTableMaxRows:
        (n: number | null) =>
        ({ commands }) =>
          commands.updateAttributes('table', { maxRows: n }),
      setTableDensity:
        (d: 'compact' | 'normal' | 'loose' | null) =>
        ({ commands }) =>
          commands.updateAttributes('table', { density: d, cellPadV: null, cellPadH: null }),
      setTableCellPadding:
        (v: number | null, h: number | null) =>
        ({ commands }) =>
          commands.updateAttributes('table', { cellPadV: v, cellPadH: h }),
    };
  },
});

export { resolveTable };

/** 当前选区所在行号（0-based）；不在表内返回 0。 */
export function currentRowIndex(editor: Editor): number {
  try {
    return selectedRect(editor.state).top;
  } catch {
    return 0;
  }
}

/** 当前选区所在列号。 */
export function currentColIndex(editor: Editor): number {
  try {
    return selectedRect(editor.state).left;
  } catch {
    return 0;
  }
}
