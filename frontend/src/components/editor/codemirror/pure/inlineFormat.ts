/**
 * inlineFormat — 选区包裹/解包（加粗、斜体、删除线、行内代码）与
 * 行前缀切换（标题、引用、列表）的纯逻辑。
 */

export interface EditInstruction {
  from: number;
  to: number;
  insert: string;
  /** 编辑后的选区（绝对偏移） */
  selFrom: number;
  selTo: number;
}

/**
 * 对 [from,to) 选区做 marker 包裹切换：
 *  - 选区外侧紧贴 marker → 解包（删外侧）
 *  - 选区自身以 marker 开闭 → 解包（删内侧）
 *  - 否则包裹；空选区插入占位文本并选中
 */
export function toggleWrap(
  doc: string,
  from: number,
  to: number,
  marker: string,
  placeholder = '文本',
): EditInstruction {
  const m = marker.length;
  const selected = doc.slice(from, to);
  // 外侧解包
  if (from >= m && doc.slice(from - m, from) === marker && doc.slice(to, to + m) === marker) {
    return {
      from: from - m,
      to: to + m,
      insert: selected,
      selFrom: from - m,
      selTo: to - m,
    };
  }
  // 内侧解包
  if (selected.length >= 2 * m && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(m, selected.length - m);
    return { from, to, insert: inner, selFrom: from, selTo: from + inner.length };
  }
  const body = selected || placeholder;
  return {
    from,
    to,
    insert: marker + body + marker,
    selFrom: from + m,
    selTo: from + m + body.length,
  };
}

/** 链接：选区变 [text](url) 并选中 url 占位；已是链接文本时不解析（保持简单）。 */
export function makeLink(doc: string, from: number, to: number): EditInstruction {
  const text = doc.slice(from, to) || '链接文字';
  const url = 'https://';
  const insert = `[${text}](${url})`;
  const urlStart = from + 1 + text.length + 2;
  return { from, to, insert, selFrom: urlStart, selTo: urlStart + url.length };
}

/** 清除选区内的行内格式标记（**、*、~~、`、<u>、<span style>、高亮 ==）。 */
export function clearInlineFormat(doc: string, from: number, to: number): EditInstruction {
  let text = doc.slice(from, to);
  text = text
    .replace(/<\/?u>/gi, '')
    .replace(/<span\b[^>]*>/gi, '')
    .replace(/<\/span>/gi, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/==(.*?)==/g, '$1')
    .replace(/`([^`]*)`/g, '$1');
  return { from, to, insert: text, selFrom: from, selTo: from + text.length };
}

const HEADING_RE = /^(#{1,6})\s+/;
const PREFIX_RES: Record<string, RegExp> = {
  bullet: /^(\s*)[-*+]\s+/,
  ordered: /^(\s*)\d{1,9}[.)]\s+/,
  quote: /^(\s*)>\s+/,
};

/**
 * 行级命令：对 [from,to) 覆盖的整行做前缀切换。
 *  - heading-N：该级标题 ↔ 取消（不同级则替换）
 *  - bullet / ordered / quote：每行加/去前缀（首行已有则全部去除）
 * 输入输出均为整段文本替换指令（行边界由调用方给出）。
 */
export function toggleLinePrefix(
  blockText: string,
  command: 'heading-1' | 'heading-2' | 'heading-3' | 'bullet' | 'ordered' | 'quote',
): string {
  const lines = blockText.split('\n');
  if (command.startsWith('heading-')) {
    const level = Number(command.slice('heading-'.length));
    const mark = '#'.repeat(level) + ' ';
    return lines
      .map((line) => {
        const m = HEADING_RE.exec(line);
        if (m && m[1].length === level) return line.replace(HEADING_RE, '');
        if (m) return line.replace(HEADING_RE, mark);
        return mark + line;
      })
      .join('\n');
  }
  const re = PREFIX_RES[command];
  const firstHas = lines.length > 0 && re.test(lines[0]);
  if (firstHas) {
    return lines.map((line) => line.replace(re, '$1')).join('\n');
  }
  let n = 1;
  return lines
    .map((line) => {
      if (command === 'ordered') return `${n++}. ${line}`;
      if (command === 'quote') return `> ${line}`;
      return `- ${line}`;
    })
    .join('\n');
}
