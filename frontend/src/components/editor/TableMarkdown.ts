import { Table } from '@tiptap/extension-table';
import { Fragment, type Node as PMNode } from '@tiptap/pm/model';
import { getHTMLFromFragment } from '@tiptap/core';

/**
 * 表格 Markdown 序列化策略（覆盖 tiptap-markdown 默认 spec）：
 *
 *  - 表内**任一单元格带颜色**（bgColor/textColor）或结构上不可 GFM 化
 *    （合并单元格 / 多块内容 / 表头不规整）→ 输出**原生 HTML `<table>`**
 *    （renderHTML 带 style，渲染端 markdown-it html:true + DOMPurify 放行，
 *    回读经 cell parseHTML 复原属性）
 *  - 否则维持 GFM 管道表 —— 无色表的 raw_content 保持干净
 *
 * GFM 分支复刻 tiptap-markdown/src/extensions/nodes/table.js 的默认实现。
 */

/** 表内是否有任何带颜色的单元格。 */
export function tableHasColor(node: PMNode): boolean {
  let found = false;
  node.descendants((n) => {
    if (found) return false;
    if (
      (n.type.name === 'tableCell' || n.type.name === 'tableHeader') &&
      (n.attrs.bgColor || n.attrs.textColor)
    ) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

function children(node: PMNode): PMNode[] {
  const out: PMNode[] = [];
  node.forEach((child) => out.push(child));
  return out;
}

function hasSpan(cell: PMNode): boolean {
  return (cell.attrs.colspan ?? 1) > 1 || (cell.attrs.rowspan ?? 1) > 1;
}

/** 结构可 GFM 化：首行全表头、其余全数据、无合并、单块单元格（复刻默认判定）。 */
export function isGfmSerializable(node: PMNode): boolean {
  const rows = children(node);
  if (rows.length === 0) return false;
  const [firstRow, ...bodyRows] = rows;
  if (
    children(firstRow).some(
      (cell) => cell.type.name !== 'tableHeader' || hasSpan(cell) || cell.childCount > 1,
    )
  ) {
    return false;
  }
  if (
    bodyRows.some((row) =>
      children(row).some(
        (cell) => cell.type.name === 'tableHeader' || hasSpan(cell) || cell.childCount > 1,
      ),
    )
  ) {
    return false;
  }
  return true;
}

/* tiptap-markdown serializer 的最小类型面 */
interface MdState {
  write(text: string): void;
  ensureNewLine(): void;
  closeBlock(node: PMNode): void;
  renderInline(node: PMNode): void;
  inTable?: boolean;
}

export const ColorTable = Table.extend({
  addStorage() {
    return {
      ...(this.parent?.() ?? {}),
      markdown: {
        serialize(state: MdState, node: PMNode) {
          if (tableHasColor(node) || !isGfmSerializable(node)) {
            // 原生 HTML 输出（带颜色 style / 合并单元格等全部保留）。
            // 包一层 .jz-table-wrap 滚动容器 —— 管道表在渲染端由
            // table_open 规则 / convertGfmPipeTables 包裹，raw HTML 表
            // 会绕过那两条路径；PM 解析器对未知 div 跳壳取子内容，
            // 回读不受影响。
            const html = getHTMLFromFragment(Fragment.from(node), node.type.schema);
            state.write(`\n<div class="jz-table-wrap">${html.trim()}</div>\n`);
            state.closeBlock(node);
            return;
          }
          // GFM 管道（复刻 tiptap-markdown 默认实现）
          state.inTable = true;
          node.forEach((row, _p, i) => {
            state.write('| ');
            row.forEach((col, _p2, j) => {
              if (j) state.write(' | ');
              const cellContent = col.firstChild;
              if (cellContent && cellContent.textContent.trim()) {
                state.renderInline(cellContent);
              }
            });
            state.write(' |');
            state.ensureNewLine();
            if (!i) {
              const delimiter = Array.from({ length: row.childCount })
                .map(() => '---')
                .join(' | ');
              state.write(`| ${delimiter} |`);
              state.ensureNewLine();
            }
          });
          state.closeBlock(node);
          state.inTable = false;
        },
        parse: {
          // markdown-it（html:true）已处理：管道表与 HTML 表都能进 PM
        },
      },
    };
  },
});
