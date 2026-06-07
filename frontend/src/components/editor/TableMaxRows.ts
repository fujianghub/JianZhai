import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { computeMaxRowsHeight } from '@/utils/tableMaxRows';
import { resolveTablePadding, type Density } from '@/utils/tableDensity';

/**
 * 编辑器侧表格样式同步：prosemirror-tables 的 `TableView`（resizable）自建
 * `<div.tableWrapper><table>` DOM 并只拷 `style` attr —— 我们 ColorTable
 * 的 data-jz 属性与 CSS 变量（那套服务序列化/导出）不会落到编辑器 `<table>`。
 * 所以这里用一个轻量 plugin，在每次 view 更新后遍历文档里的 table 节点，
 * 经 `nodeDOM(pos)` 拿到编辑器真实 `<table>`，把表级属性写上去：
 *  - data-jz-density → 命中 tiptap.css 的属性选择器（密度预设）
 *  - --jz-cell-pad-v/h inline 变量（自定义间距）
 *  - data-jz-max-rows + 测前 N 行高 → .tableWrapper maxHeight（行数上限）
 *
 * 同步只读节点 attr + 写 DOM 属性/样式，不 dispatch 任何事务，无循环风险，
 * 故直接在 update 内同步执行（rAF 在 headless / view 重建下不可靠）。
 */
function syncTables(view: EditorView): void {
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'table') return undefined;
    const wrap = view.nodeDOM(pos) as HTMLElement | null;
    if (!wrap) return false;
    const table = (
      wrap.tagName === 'TABLE' ? wrap : wrap.querySelector('table')
    ) as HTMLTableElement | null;
    if (!table) return false;

    const density = node.attrs.density as Density | null;
    const cellPadV = (node.attrs.cellPadV ?? null) as number | null;
    const cellPadH = (node.attrs.cellPadH ?? null) as number | null;
    const maxRows = (node.attrs.maxRows ?? null) as number | null;

    if (density) table.setAttribute('data-jz-density', density);
    else table.removeAttribute('data-jz-density');

    const pad = resolveTablePadding(density, cellPadV, cellPadH);
    if (pad && (cellPadV != null || cellPadH != null)) {
      table.style.setProperty('--jz-cell-pad-v', `${pad.v}px`);
      table.style.setProperty('--jz-cell-pad-h', `${pad.h}px`);
    } else {
      table.style.removeProperty('--jz-cell-pad-v');
      table.style.removeProperty('--jz-cell-pad-h');
    }

    const scrollWrap = table.closest<HTMLElement>('.tableWrapper') ?? wrap;
    if (maxRows) {
      table.setAttribute('data-jz-max-rows', String(maxRows));
      const h = computeMaxRowsHeight(table, maxRows);
      scrollWrap.style.maxHeight = h ? `${h}px` : '';
      scrollWrap.style.overflowY = h ? 'auto' : '';
    } else {
      table.removeAttribute('data-jz-max-rows');
      scrollWrap.style.maxHeight = '';
      scrollWrap.style.overflowY = '';
    }
    return false; // 不深入表格内部
  });
}

export const TableMaxRows = Extension.create({
  name: 'tableMaxRows',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        view: (view) => {
          // 初次挂载后同步一次（处理已存在的表格）
          requestAnimationFrame(() => syncTables(view));
          return {
            // Selection / cursor moves fire ``update`` too, but table-level
            // attrs only change when the doc changes. Skipping doc-unchanged
            // updates avoids a full-doc traversal + forced reflow
            // (getBoundingClientRect) on every keystroke-less cursor move —
            // the dominant source of table-doc typing lag.
            update: (v, prevState) => {
              if (v.state.doc === prevState.doc) return;
              syncTables(v);
            },
          };
        },
      }),
    ];
  },
});
