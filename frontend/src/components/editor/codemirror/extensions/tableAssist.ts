import { keymap, type EditorView } from '@codemirror/view';
import {
  isTableLine,
  isSeparatorLine,
  splitCells,
  cellIndexAt,
  cellContentRange,
  emptyRow,
} from '../pure/tableFormat';

/**
 * 表格辅助（语雀对齐）：
 *  - Tab / Shift+Tab：跳到下/上一个单元格并选中内容；最后一格 Tab 自动加行
 *  - Enter：当前行下方插入同列数空行；整行为空时删行退出表格
 * 必须注册在 listKeymap 之前（表格行优先于列表逻辑）。
 */

interface Ctx {
  view: EditorView;
  lineNo: number; // 1-based
  lineText: string;
  col: number; // 光标在行内的列
}

function ctxAt(view: EditorView): Ctx | null {
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.head);
  if (!isTableLine(line.text)) return null;
  return { view, lineNo: line.number, lineText: line.text, col: sel.head - line.from };
}

/**
 * 表格块内分隔行的行号；无分隔行（半成品表格）返回 null。
 * 半成品表格不能劫持 Enter/Tab —— 否则插入的空行会吞掉用户的按行输入。
 */
function separatorLineNo(view: EditorView, lineNo: number): number | null {
  const doc = view.state.doc;
  for (let n = lineNo; n >= 1; n--) {
    const t = doc.line(n).text;
    if (!isTableLine(t)) break;
    if (isSeparatorLine(t)) return n;
  }
  for (let n = lineNo + 1; n <= doc.lines; n++) {
    const t = doc.line(n).text;
    if (!isTableLine(t)) break;
    if (isSeparatorLine(t)) return n;
  }
  return null;
}

function blockComplete(view: EditorView, lineNo: number): boolean {
  return separatorLineNo(view, lineNo) !== null;
}

/** 选中 lineNo 行第 cellIdx 格内容。 */
function selectCell(view: EditorView, lineNo: number, cellIdx: number): boolean {
  const line = view.state.doc.line(lineNo);
  const range = cellContentRange(line.text, cellIdx);
  if (!range) return false;
  view.dispatch({
    selection: { anchor: line.from + range.from, head: line.from + range.to },
    scrollIntoView: true,
  });
  return true;
}

function moveCell(view: EditorView, dir: 1 | -1): boolean {
  const ctx = ctxAt(view);
  if (!ctx) return false;
  const cells = splitCells(ctx.lineText).length;
  let cell = cellIndexAt(ctx.lineText, ctx.col) ?? 0;
  let lineNo = ctx.lineNo;
  cell += dir;
  // 跨行（跳过分隔行）
  while (true) {
    if (cell >= cells) {
      const isLastDocLine = lineNo >= view.state.doc.lines;
      const nextText = isLastDocLine ? null : view.state.doc.line(lineNo + 1).text;
      if (isLastDocLine || !isTableLine(nextText!)) {
        // 表格最后一格 Tab → 追加新行（仅完整表格；文档末行同样适用）
        if (dir === 1 && blockComplete(view, lineNo)) {
          const cur = view.state.doc.line(lineNo);
          const row = emptyRow(cells);
          view.dispatch({
            changes: { from: cur.to, insert: '\n' + row },
            userEvent: 'input',
          });
          return selectCell(view, lineNo + 1, 0);
        }
        break;
      }
      lineNo++;
      cell = 0;
      if (isSeparatorLine(nextText!)) continue;
    } else if (cell < 0) {
      if (lineNo <= 1) break;
      const prevText = view.state.doc.line(lineNo - 1).text;
      if (!isTableLine(prevText)) break;
      lineNo--;
      cell = splitCells(prevText).length - 1;
      if (isSeparatorLine(prevText)) continue;
    }
    const text = view.state.doc.line(lineNo).text;
    if (isSeparatorLine(text)) {
      cell += dir;
      continue;
    }
    return selectCell(view, lineNo, Math.max(0, cell));
  }
  return true; // 在表格内但到边界：仍消费按键，避免焦点跳走
}

function handleEnter(view: EditorView): boolean {
  if (view.composing) return false;
  const ctx = ctxAt(view);
  if (!ctx) return false;
  // 只在「分隔行之下的数据行」启用回车加行：表头/分隔行/半成品表格一律
  // 放行默认回车 —— 逐行手打或整表粘贴时不能被插行+选格打断。
  const sepNo = separatorLineNo(view, ctx.lineNo);
  if (sepNo === null || ctx.lineNo <= sepNo) return false;
  const line = view.state.doc.line(ctx.lineNo);
  const cells = splitCells(ctx.lineText);
  const rowEmpty = cells.every((c) => c.trim() === '') && !isSeparatorLine(ctx.lineText);
  if (rowEmpty) {
    // 空行回车 → 删掉这行并退出表格（光标落到表格后的新空行）
    view.dispatch({
      changes: { from: line.from, to: Math.min(line.to + 1, view.state.doc.length), insert: '' },
      userEvent: 'delete',
    });
    const after = view.state.doc.lineAt(Math.min(line.from, view.state.doc.length));
    view.dispatch({
      changes: { from: after.from, insert: '\n' },
      selection: { anchor: after.from },
      userEvent: 'input',
    });
    return true;
  }
  // 普通回车 → 下方插入同列数空行，光标进第一格
  const row = emptyRow(cells.length);
  view.dispatch({
    changes: { from: line.to, insert: '\n' + row },
    userEvent: 'input',
  });
  return selectCell(view, ctx.lineNo + 1, 0);
}

export const tableAssistKeymap = keymap.of([
  { key: 'Tab', run: (v) => !v.composing && moveCell(v, 1) },
  { key: 'Shift-Tab', run: (v) => !v.composing && moveCell(v, -1) },
  { key: 'Enter', run: handleEnter },
]);
