import { TableCell, TableHeader } from '@tiptap/extension-table';

/**
 * 单元格颜色扩展 —— 给 TableCell / TableHeader 加 `bgColor` / `textColor`。
 *
 * 设计要点（参照 ResizableImage 的 attr 三件套）：
 *  - parseHTML 读内联 style（HTML 表回读复原）
 *  - 节点级 renderHTML 统一组装 **单一 style 串**（两个 attr 各自 renderHTML
 *    返回 style 会被 mergeAttributes 以分号拼接，行为依赖实现细节；统一
 *    组装是零风险路线）
 *  - 颜色只输出 background-color / color，不触碰 sticky 冻结布局
 */

interface CellColorAttrs {
  bgColor: string | null;
  textColor: string | null;
}

const colorAttrConfig = {
  bgColor: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.style.backgroundColor || null,
    // style 由节点级 renderHTML 统一输出
    renderHTML: () => ({}),
  },
  textColor: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.style.color || null,
    renderHTML: () => ({}),
  },
};

/** 组合 colwidth（父类语义）与颜色为最终 HTML 属性。 */
export function cellHtmlAttrs(
  attrs: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  const { colspan, rowspan, colwidth, bgColor, textColor } = attrs as {
    colspan?: number;
    rowspan?: number;
    colwidth?: number[] | null;
    bgColor?: string | null;
    textColor?: string | null;
  };
  if (colspan && colspan !== 1) out.colspan = String(colspan);
  if (rowspan && rowspan !== 1) out.rowspan = String(rowspan);
  const styles: string[] = [];
  if (colwidth && colwidth.length) {
    out['data-colwidth'] = colwidth.join(',');
    // 与 @tiptap/extension-table 默认行为一致：单 cell 即给 width
    if (colwidth.length === 1) styles.push(`width: ${colwidth[0]}px`);
  }
  if (bgColor) styles.push(`background-color: ${bgColor}`);
  if (textColor) styles.push(`color: ${textColor}`);
  if (styles.length) out.style = styles.join('; ');
  return out;
}

export const ColorTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...colorAttrConfig };
  },
  renderHTML({ HTMLAttributes, node }) {
    // 丢弃父类已生成的 style（colwidth width），重组为含颜色的单一 style
    const { style: _drop, ...rest } = HTMLAttributes as Record<string, string>;
    void _drop;
    return ['td', { ...rest, ...cellHtmlAttrs(node.attrs) }, 0];
  },
});

export const ColorTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...colorAttrConfig };
  },
  renderHTML({ HTMLAttributes, node }) {
    const { style: _drop, ...rest } = HTMLAttributes as Record<string, string>;
    void _drop;
    return ['th', { ...rest, ...cellHtmlAttrs(node.attrs) }, 0];
  },
});

export type { CellColorAttrs };

/** 单元格底色预设（浅染，暗主题下也可读；语雀同款思路）。 */
export const CELL_BG_PRESETS: Array<{ label: string; value: string }> = [
  { label: '灰', value: 'rgba(140, 149, 165, 0.18)' },
  { label: '红', value: 'rgba(245, 108, 108, 0.18)' },
  { label: '橙', value: 'rgba(250, 173, 20, 0.20)' },
  { label: '黄', value: 'rgba(250, 219, 20, 0.22)' },
  { label: '绿', value: 'rgba(82, 196, 26, 0.18)' },
  { label: '青', value: 'rgba(19, 194, 194, 0.18)' },
  { label: '蓝', value: 'rgba(22, 119, 255, 0.16)' },
  { label: '紫', value: 'rgba(146, 84, 222, 0.16)' },
];
