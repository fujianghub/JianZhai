/**
 * tableFormat — 管道表格的解析 / 对齐格式化 / 行列操作 / 单元格导航。
 * 纯字符串运算，node 环境可单测；视图层（tableAssist）只做 dispatch。
 */

export function isTableLine(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line);
}

export function isSeparatorLine(line: string): boolean {
  return /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(line);
}

/** 在行数组中找包含 lineIdx 的连续表格块；不在表格内返回 null。 */
export function findTableRange(
  lines: string[],
  lineIdx: number,
): { start: number; end: number } | null {
  if (lineIdx < 0 || lineIdx >= lines.length || !isTableLine(lines[lineIdx])) return null;
  let start = lineIdx;
  let end = lineIdx;
  while (start > 0 && isTableLine(lines[start - 1])) start--;
  while (end < lines.length - 1 && isTableLine(lines[end + 1])) end++;
  return { start, end };
}

/** 拆一行为单元格文本数组（不含首尾管道；转义 \| 不拆）。 */
export function splitCells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let buf = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '\\' && inner[i + 1] === '|') {
      buf += '\\|';
      i++;
    } else if (ch === '|') {
      cells.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  cells.push(buf);
  return cells;
}

/** 显示宽度：CJK 宽字符按 2 计，使中英混排表格对得整齐。 */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    w +=
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x3fffd)
        ? 2
        : 1;
  }
  return w;
}

type Align = 'left' | 'center' | 'right' | 'none';

function parseAlign(sep: string): Align {
  const t = sep.trim();
  const left = t.startsWith(':');
  const right = t.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return 'none';
}

function alignMarker(a: Align, width: number): string {
  const w = Math.max(3, width);
  switch (a) {
    case 'center':
      return ':' + '-'.repeat(w - 2) + ':';
    case 'right':
      return '-'.repeat(w - 1) + ':';
    case 'left':
      return ':' + '-'.repeat(w - 1);
    default:
      return '-'.repeat(w);
  }
}

function pad(s: string, width: number, align: Align): string {
  const gap = Math.max(0, width - displayWidth(s));
  if (align === 'right') return ' '.repeat(gap) + s;
  if (align === 'center') {
    const l = Math.floor(gap / 2);
    return ' '.repeat(l) + s + ' '.repeat(gap - l);
  }
  return s + ' '.repeat(gap);
}

/**
 * 一键格式化：所有列按内容最大显示宽度对齐，分隔行保留对齐标记。
 * 列数不齐的行补空单元格到全表最大列数。
 */
export function formatTable(blockText: string): string {
  const lines = blockText.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return blockText;
  const rows = lines.map(splitCells);
  const sepIdx = lines.findIndex(isSeparatorLine);
  const colCount = Math.max(...rows.map((r) => r.length));
  const aligns: Align[] = Array.from({ length: colCount }, (_, c) =>
    sepIdx >= 0 ? parseAlign(rows[sepIdx][c] ?? '') : 'none',
  );
  // 每列宽度 = 非分隔行内容的最大显示宽度（至少 3，容纳 ---）
  const widths = Array.from({ length: colCount }, (_, c) => {
    let w = 3;
    rows.forEach((r, ri) => {
      if (ri === sepIdx) return;
      w = Math.max(w, displayWidth((r[c] ?? '').trim()));
    });
    return w;
  });
  const out = rows.map((r, ri) => {
    if (ri === sepIdx) {
      return '| ' + widths.map((w, c) => alignMarker(aligns[c], w)).join(' | ') + ' |';
    }
    return (
      '| ' +
      widths.map((w, c) => pad((r[c] ?? '').trim(), w, aligns[c])).join(' | ') +
      ' |'
    );
  });
  return out.join('\n');
}

/** 生成与表格列数一致的空行。 */
export function emptyRow(colCount: number): string {
  return '|' + '  |'.repeat(Math.max(1, colCount));
}

/** 在 rowIdx（块内行号）之后插入空行；rowIdx 为表头(0)时插在分隔行后。 */
export function addRowAfter(blockText: string, rowIdx: number): string {
  const lines = blockText.split('\n');
  const cols = splitCells(lines[0] ?? '|  |').length;
  const sepIdx = lines.findIndex(isSeparatorLine);
  const insertAt = Math.max(rowIdx, sepIdx >= 0 ? sepIdx : 0) + 1;
  lines.splice(insertAt, 0, emptyRow(cols));
  return lines.join('\n');
}

/** 删除 rowIdx 行（分隔行与表头拒删）。 */
export function deleteRow(blockText: string, rowIdx: number): string | null {
  const lines = blockText.split('\n');
  if (rowIdx <= 0 || isSeparatorLine(lines[rowIdx] ?? '')) return null;
  if (lines.length <= 3) return null; // 只剩表头+分隔+一行时不再删
  lines.splice(rowIdx, 1);
  return lines.join('\n');
}

/** 在 colIdx 后插一列（-1 = 行首）。 */
export function addColumnAfter(blockText: string, colIdx: number): string {
  const lines = blockText.split('\n');
  return lines
    .map((line) => {
      if (!isTableLine(line)) return line;
      const cells = splitCells(line);
      const filler = isSeparatorLine(line) ? ' --- ' : '  ';
      cells.splice(colIdx + 1, 0, filler);
      return '|' + cells.join('|') + '|';
    })
    .join('\n');
}

/** 删除 colIdx 列；只剩一列时拒删。 */
export function deleteColumn(blockText: string, colIdx: number): string | null {
  const lines = blockText.split('\n');
  const first = lines.find(isTableLine);
  if (!first || splitCells(first).length <= 1) return null;
  return lines
    .map((line) => {
      if (!isTableLine(line)) return line;
      const cells = splitCells(line);
      if (colIdx < cells.length) cells.splice(colIdx, 1);
      return '|' + cells.join('|') + '|';
    })
    .join('\n');
}

/** 行内第 cellIdx 个单元格的内容范围（相对行首；含两侧空白裁剪）。 */
export function cellContentRange(
  line: string,
  cellIdx: number,
): { from: number; to: number } | null {
  // 找各 | 的位置（跳过 \|）
  const pipes: number[] = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && line[i + 1] === '|') {
      i++;
    } else if (line[i] === '|') {
      pipes.push(i);
    }
  }
  if (pipes.length < 2 || cellIdx < 0 || cellIdx >= pipes.length - 1) return null;
  const rawFrom = pipes[cellIdx] + 1;
  const rawTo = pipes[cellIdx + 1];
  const seg = line.slice(rawFrom, rawTo);
  if (seg.trim() === '') {
    // 空单元格：光标落在格子中间（lead/trail 同时裁剪会得到反转区间）
    const mid = rawFrom + Math.ceil(seg.length / 2);
    return { from: mid, to: mid };
  }
  const lead = seg.length - seg.trimStart().length;
  const trail = seg.length - seg.trimEnd().length;
  return { from: rawFrom + lead, to: rawTo - trail };
}

/** 光标列所在的单元格下标；在表格行外返回 null。 */
export function cellIndexAt(line: string, col: number): number | null {
  if (!isTableLine(line)) return null;
  let idx = -1;
  for (let i = 0; i < Math.min(col, line.length); i++) {
    if (line[i] === '\\' && line[i + 1] === '|') i++;
    else if (line[i] === '|') idx++;
  }
  const total = splitCells(line).length;
  return Math.max(0, Math.min(idx, total - 1));
}
