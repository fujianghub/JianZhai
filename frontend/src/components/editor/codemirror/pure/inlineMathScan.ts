/**
 * inlineMathScan — 在一段文本中找 `$...$` 行内公式区间。
 *
 * 防误识规则与阅读端 katexPlugin（utils/markdown.ts）对齐：
 *  - 开 `$` 后不能紧跟空白；闭 `$` 前不能是空白（`$ x $` 不算）
 *  - 闭 `$` 后紧跟数字不算（"$5 到 $10" 是货币）
 *  - `\$` 转义不触发；`$$`（块级）不在本扫描范围
 *  - 不跨行
 */

export interface MathSpan {
  /** 相对输入文本的区间（含两侧 $） */
  from: number;
  to: number;
  expr: string;
}

export function scanInlineMath(text: string, base = 0): MathSpan[] {
  const out: MathSpan[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch !== '$') {
      i++;
      continue;
    }
    // 转义 / 块级 $$ 开头：跳过
    if (text[i - 1] === '\\' || text[i + 1] === '$' || text[i - 1] === '$') {
      i++;
      continue;
    }
    // 开 $ 后不能是空白
    const first = text[i + 1];
    if (first === undefined || /\s/.test(first)) {
      i++;
      continue;
    }
    // 找闭 $（同一行内，跳过 \$）
    let j = i + 1;
    let close = -1;
    while (j < text.length) {
      const cj = text[j];
      if (cj === '\n') break;
      if (cj === '\\') {
        j += 2;
        continue;
      }
      if (cj === '$') {
        close = j;
        break;
      }
      j++;
    }
    if (close === -1) {
      i++;
      continue;
    }
    const expr = text.slice(i + 1, close);
    const last = expr[expr.length - 1];
    const after = text[close + 1];
    if (
      expr.trim() !== '' &&
      last !== undefined &&
      !/\s/.test(last) &&
      (after === undefined || !/\d/.test(after)) &&
      after !== '$'
    ) {
      out.push({ from: base + i, to: base + close + 1, expr });
      i = close + 1;
      continue;
    }
    i++;
  }
  return out;
}
