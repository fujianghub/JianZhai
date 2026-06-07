/**
 * 表格「最多显示行数」→ 滚动容器 maxHeight 的测量。
 * 纯核心 sumFirstN 便于 node 单测；computeMaxRowsHeight 包一层读 DOM rect。
 */

/** 前 n 行高度和；行数不足 n 返回 null（不限高）。 */
export function sumFirstN(rowHeights: number[], n: number): number | null {
  if (!n || n < 1) return null;
  if (rowHeights.length <= n) return null;
  let h = 0;
  for (let i = 0; i < n; i++) h += rowHeights[i] ?? 0;
  return Math.ceil(h) + 1; // +1 让第 n 行底边框完整可见
}

/** 测量表格前 maxRows 行（含表头行）高度和，作为滚动容器 maxHeight；不限/不足返回 null。 */
export function computeMaxRowsHeight(table: HTMLTableElement, maxRows: number): number | null {
  if (!maxRows || maxRows < 1) return null;
  const heights = Array.from(table.rows).map((r) => r.getBoundingClientRect().height);
  return sumFirstN(heights, maxRows);
}
