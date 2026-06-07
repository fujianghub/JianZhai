/**
 * 表格密度预设与单元格间距解析（纯函数，node 可单测）。
 *  - density 预设：紧凑/标准/宽松 三档，映射到单元格上下(v)/左右(h) padding(px)
 *  - 自定义 cellPadV/cellPadH 优先于预设
 */

export const DENSITY_PRESETS = {
  compact: { v: 3, h: 6 },
  normal: { v: 6, h: 10 },
  loose: { v: 10, h: 16 },
} as const;

export type Density = keyof typeof DENSITY_PRESETS;

export function isDensity(v: unknown): v is Density {
  return v === 'compact' || v === 'normal' || v === 'loose';
}

/**
 * 解析最终 padding：自定义 v/h 优先，其次 density 预设，再次 null（用 CSS 默认 6/10）。
 * 返回 null 表示「无任何自定义」——此时不写 inline style，由默认 CSS / data-jz-density 接管。
 */
export function resolveTablePadding(
  density: Density | null,
  cellPadV: number | null,
  cellPadH: number | null,
): { v: number; h: number } | null {
  const base = density ? DENSITY_PRESETS[density] : null;
  const v = cellPadV ?? base?.v ?? null;
  const h = cellPadH ?? base?.h ?? null;
  if (v == null && h == null) return null;
  return { v: v ?? DENSITY_PRESETS.normal.v, h: h ?? DENSITY_PRESETS.normal.h };
}

/** 自定义间距是否存在（与 density 预设区分——预设走 CSS 属性选择器，自定义才需 inline）。 */
export function hasCustomPadding(cellPadV: number | null, cellPadH: number | null): boolean {
  return cellPadV != null || cellPadH != null;
}
