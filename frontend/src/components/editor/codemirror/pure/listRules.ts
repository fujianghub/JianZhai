/**
 * listRules — 回车续列表 / 空项退出 / Tab 缩进的纯逻辑（node 可单测）。
 * 视图层（keymap）只负责把这里的指令翻译成 CM dispatch。
 */

/** 列表/引用行结构：缩进 + 标记 + （可选任务框）+ 内容。 */
export interface ListLineInfo {
  indent: string;
  /** '-' / '*' / '+' / '>' / 有序数字（不含分隔符） */
  marker: string;
  /** 有序列表分隔符 '.' 或 ')'，无序/引用为 '' */
  delimiter: string;
  /** 任务列表的 '[ ] ' / '[x] '，无则 '' */
  task: string;
  /** 标记区总长度（= 内容起始列） */
  contentStart: number;
  /** 标记后的实际内容 */
  content: string;
  kind: 'bullet' | 'ordered' | 'quote';
}

const LIST_RE = /^(\s*)(?:([-*+])|(\d{1,9})([.)])|(>))\s(\[[ xX]\]\s)?/;

export function parseListLine(lineText: string): ListLineInfo | null {
  const m = LIST_RE.exec(lineText);
  if (!m) return null;
  const [whole, indent, bullet, num, delim, quote, task] = m;
  const kind = bullet ? 'bullet' : num ? 'ordered' : 'quote';
  return {
    indent: indent ?? '',
    marker: bullet ?? num ?? quote ?? '',
    delimiter: delim ?? '',
    task: task ?? '',
    contentStart: whole.length,
    content: lineText.slice(whole.length),
    kind,
  };
}

export type EnterAction =
  | { kind: 'continue'; prefix: string } // 在换行后插入的标记前缀
  | { kind: 'exit'; newLineText: string } // 空项：当前行改写为该文本（去标记）
  | { kind: 'default' };

/**
 * 回车时的列表行为：
 *  - 空项（标记后无内容）→ 退出：清掉标记，光标留在该行
 *  - 非空项且光标在标记之后 → 续行：换行 + 同款标记（有序号自增，任务框复位）
 *  - 其他（光标在标记区内 / 非列表行）→ 默认回车
 */
export function enterListAction(lineText: string, col: number): EnterAction {
  const info = parseListLine(lineText);
  if (!info) return { kind: 'default' };
  if (col < info.contentStart) return { kind: 'default' };
  if (info.content.trim() === '') {
    // 空项退出：保留缩进会让用户以为还在列表里，干脆清空整行
    return { kind: 'exit', newLineText: '' };
  }
  let marker: string;
  if (info.kind === 'ordered') {
    marker = `${Number(info.marker) + 1}${info.delimiter} `;
  } else if (info.kind === 'quote') {
    marker = '> ';
  } else {
    marker = `${info.marker} `;
  }
  const task = info.task ? '[ ] ' : '';
  return { kind: 'continue', prefix: info.indent + marker + task };
}

export type IndentAction = { kind: 'replace-line'; newLineText: string; colDelta: number } | null;

const INDENT_UNIT = '  ';

/** Tab：列表行整行缩进一级。非列表行返回 null（由调用方插空格）。 */
export function indentListLine(lineText: string): IndentAction {
  if (!parseListLine(lineText)) return null;
  return { kind: 'replace-line', newLineText: INDENT_UNIT + lineText, colDelta: INDENT_UNIT.length };
}

/** Shift+Tab：列表行减一级缩进；无缩进或非列表返回 null。 */
export function dedentListLine(lineText: string): IndentAction {
  if (!parseListLine(lineText)) return null;
  if (lineText.startsWith(INDENT_UNIT)) {
    return { kind: 'replace-line', newLineText: lineText.slice(2), colDelta: -2 };
  }
  if (lineText.startsWith(' ')) {
    return { kind: 'replace-line', newLineText: lineText.slice(1), colDelta: -1 };
  }
  return null;
}
