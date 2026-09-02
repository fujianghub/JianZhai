import { keymap, type EditorView } from '@codemirror/view';
import { toggleWrap, makeLink, type EditInstruction } from '../pure/inlineFormat';
import { CM_KEYS } from '@/shortcuts/registry';

function applyInstruction(view: EditorView, ins: EditInstruction): boolean {
  view.dispatch({
    changes: { from: ins.from, to: ins.to, insert: ins.insert },
    selection: { anchor: ins.selFrom, head: ins.selTo },
    scrollIntoView: true,
    userEvent: 'input.format',
  });
  view.focus();
  return true;
}

function wrapCommand(marker: string, placeholder?: string) {
  return (view: EditorView): boolean => {
    const sel = view.state.selection.main;
    const doc = view.state.doc.toString();
    return applyInstruction(view, toggleWrap(doc, sel.from, sel.to, marker, placeholder));
  };
}

function linkCommand(view: EditorView): boolean {
  const sel = view.state.selection.main;
  const doc = view.state.doc.toString();
  return applyInstruction(view, makeLink(doc, sel.from, sel.to));
}

/**
 * 行内格式快捷键（语雀对齐）：
 *   Mod+B 加粗 / Mod+I 斜体 / Mod+Shift+X 删除线 / Mod+E 行内代码 / Mod+K 链接
 * （Mod+U 下划线在 React keydown 层处理 —— 包裹 HTML 标签，与本组同语义。）
 */
export const inlineFormatKeymap = keymap.of([
  { key: CM_KEYS['editor.markdown.bold'], run: wrapCommand('**', '加粗文本'), preventDefault: true },
  { key: CM_KEYS['editor.markdown.italic'], run: wrapCommand('*', '斜体文本'), preventDefault: true },
  { key: CM_KEYS['editor.markdown.strike'], run: wrapCommand('~~', '删除线'), preventDefault: true },
  { key: CM_KEYS['editor.markdown.code'], run: wrapCommand('`', '代码'), preventDefault: true },
  { key: CM_KEYS['editor.markdown.link'], run: linkCommand, preventDefault: true },
]);
