import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { computeMaxRowsHeight } from '@/utils/tableMaxRows';

/**
 * 编辑器侧「最多显示行数」：纯 CSS 无法按行数算高度，故用一个轻量
 * ProseMirror plugin，在每次 view 更新后扫描带 `data-jz-max-rows` 的表格，
 * 测前 N 行高度和，设到其 `.tableWrapper`（Tiptap resizable 生成的滚动容器）
 * 的 maxHeight。增删行随事务自动重算；清空回落 CSS 的 70vh。rAF 节流。
 */
export const TableMaxRows = Extension.create({
  name: 'tableMaxRows',
  addProseMirrorPlugins() {
    let raf = 0;
    return [
      new Plugin({
        view: () => ({
          update: (view) => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
              raf = 0;
              view.dom
                .querySelectorAll<HTMLTableElement>('table[data-jz-max-rows]')
                .forEach((table) => {
                  const wrap = table.closest<HTMLElement>('.tableWrapper');
                  if (!wrap) return;
                  const n = Number(table.getAttribute('data-jz-max-rows'));
                  const h = computeMaxRowsHeight(table, n);
                  if (h) {
                    wrap.style.maxHeight = `${h}px`;
                    wrap.style.overflowY = 'auto';
                  } else {
                    wrap.style.maxHeight = '';
                    wrap.style.overflowY = '';
                  }
                });
            });
          },
          destroy: () => {
            if (raf) cancelAnimationFrame(raf);
          },
        }),
      }),
    ];
  },
});
