/**
 * lineMap — 「原始 Markdown ↔ 预处理后文本」的行号映射。
 *
 * 预览渲染走 `preprocessMarkdown`（剥注释 / Yuque 兼容 / 管道表格转 HTML），
 * 会增删行，导致 markdown-it token.map 的行号是**预处理后**的行号；
 * 而编辑器里的滚动位置是**原文**行号。本模块用「唯一行锚点 + LIS」
 * 建立分段线性映射（patience-diff 思路）：在两侧都恰好出现一次且内容
 * 相同的行做锚点，锚点之间线性插值。
 */

export interface LineMap {
  /** 原文行号(0-based) → 预处理后行号（可为小数，便于插值滚动）。 */
  origToTrans(line: number): number;
  /** 预处理后行号 → 原文行号。 */
  transToOrig(line: number): number;
  origLineCount: number;
  transLineCount: number;
}

/** 收集两侧均唯一且相同的行作锚点对 (origIdx, transIdx)。 */
function uniqueAnchors(a: string[], b: string[]): Array<[number, number]> {
  const countA = new Map<string, number>();
  const countB = new Map<string, number>();
  const posA = new Map<string, number>();
  const posB = new Map<string, number>();
  a.forEach((line, i) => {
    const t = line.trim();
    if (!t) return; // 空行不做锚点（太常见，无判别力）
    countA.set(t, (countA.get(t) ?? 0) + 1);
    posA.set(t, i);
  });
  b.forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    countB.set(t, (countB.get(t) ?? 0) + 1);
    posB.set(t, i);
  });
  const pairs: Array<[number, number]> = [];
  for (const [text, c] of countA) {
    if (c === 1 && countB.get(text) === 1) {
      pairs.push([posA.get(text)!, posB.get(text)!]);
    }
  }
  pairs.sort((x, y) => x[0] - y[0]);
  return pairs;
}

/** 最长递增子序列（按 transIdx），保证锚点单调，丢弃乱序匹配。 */
function lisBySecond(pairs: Array<[number, number]>): Array<[number, number]> {
  if (pairs.length === 0) return [];
  const tails: number[] = []; // tails[k] = 长度 k+1 的 LIS 的最小结尾值在 pairs 中的下标
  const prev = new Array<number>(pairs.length).fill(-1);
  for (let i = 0; i < pairs.length; i++) {
    const v = pairs[i][1];
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pairs[tails[mid]][1] < v) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const out: Array<[number, number]> = [];
  let k = tails.length > 0 ? tails[tails.length - 1] : -1;
  while (k >= 0) {
    out.push(pairs[k]);
    k = prev[k];
  }
  out.reverse();
  return out;
}

/** 在单调锚点序列上做分段线性插值。 */
function interpolate(anchors: Array<[number, number]>, line: number, dir: 0 | 1): number {
  const from = dir; // 0: orig→trans 用 [0]，1: trans→orig 用 [1]
  const to = dir === 0 ? 1 : 0;
  if (anchors.length === 0) return line;
  // 边界外：按最近锚点平移
  if (line <= anchors[0][from]) {
    return anchors[0][to] + (line - anchors[0][from]);
  }
  const last = anchors[anchors.length - 1];
  if (line >= last[from]) {
    return last[to] + (line - last[from]);
  }
  // 二分找包围锚点对
  let lo = 0;
  let hi = anchors.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid][from] <= line) lo = mid;
    else hi = mid;
  }
  const a = anchors[lo];
  const b = anchors[hi];
  const span = b[from] - a[from];
  const frac = span > 0 ? (line - a[from]) / span : 0;
  return a[to] + frac * (b[to] - a[to]);
}

export function buildLineMap(original: string, transformed: string): LineMap {
  const a = original.split('\n');
  const b = transformed.split('\n');
  const anchors = lisBySecond(uniqueAnchors(a, b));
  return {
    origToTrans: (line) => Math.max(0, Math.min(interpolate(anchors, line, 0), b.length - 1)),
    transToOrig: (line) => Math.max(0, Math.min(interpolate(anchors, line, 1), a.length - 1)),
    origLineCount: a.length,
    transLineCount: b.length,
  };
}

/* ------------------------------------------------------------------ *
 *  小型 LRU：编辑中每次预览 debounce 后查询，同一文档反复命中。
 * ------------------------------------------------------------------ */
const CACHE_MAX = 4;
const cache = new Map<string, LineMap>();

export function getLineMap(original: string, transformed: string): LineMap {
  // transformed 是 original 经 preprocessMarkdown 的确定性产物，原文即可作键
  const key = original;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const map = buildLineMap(original, transformed);
  cache.set(key, map);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return map;
}
