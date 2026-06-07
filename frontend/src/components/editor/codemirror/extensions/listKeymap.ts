import { keymap, type EditorView } from '@codemirror/view';
import { enterListAction, indentListLine, dedentListLine } from '../pure/listRules';

/** 回车续列表 / 空项退出。IME 组合期间放行给 CM 默认处理。 */
function handleEnter(view: EditorView): boolean {
  if (view.composing) return false;
  const sel = view.state.selection.main;
  if (!sel.empty) return false;
  const line = view.state.doc.lineAt(sel.head);
  const action = enterListAction(line.text, sel.head - line.from);
  if (action.kind === 'continue') {
    view.dispatch({
      changes: { from: sel.head, insert: '\n' + action.prefix },
      selection: { anchor: sel.head + 1 + action.prefix.length },
      scrollIntoView: true,
      userEvent: 'input',
    });
    return true;
  }
  if (action.kind === 'exit') {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: action.newLineText },
      selection: { anchor: line.from + action.newLineText.length },
      userEvent: 'delete',
    });
    return true;
  }
  return false;
}

/** Tab：列表行缩进一级；普通行插入 2 空格（MD 源码习惯）。 */
function handleTab(view: EditorView): boolean {
  if (view.composing) return false;
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.head);
  if (sel.empty || (sel.from >= line.from && sel.to <= line.to)) {
    const action = indentListLine(line.text);
    if (action) {
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: action.newLineText },
        selection: {
          anchor: Math.max(line.from, sel.anchor + action.colDelta),
          head: Math.max(line.from, sel.head + action.colDelta),
        },
        userEvent: 'input.indent',
      });
      return true;
    }
  }
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: '  ' },
    selection: { anchor: sel.from + 2 },
    userEvent: 'input',
  });
  return true;
}

/** Shift+Tab：列表行减一级缩进；其余不消费。 */
function handleShiftTab(view: EditorView): boolean {
  if (view.composing) return false;
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.head);
  const action = dedentListLine(line.text);
  if (!action) return false;
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: action.newLineText },
    selection: {
      anchor: Math.max(line.from, sel.anchor + action.colDelta),
      head: Math.max(line.from, sel.head + action.colDelta),
    },
    userEvent: 'delete.dedent',
  });
  return true;
}

export const listKeymap = keymap.of([
  { key: 'Enter', run: handleEnter },
  { key: 'Tab', run: handleTab },
  { key: 'Shift-Tab', run: handleShiftTab },
]);
