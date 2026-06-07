import { useEffect } from 'react';
import { computeMaxRowsHeight } from '@/utils/tableMaxRows';

/**
 * 渲染后表格增强（阅读端 / 预览端）：
 *  - `data-jz-max-rows`：测前 N 行高度，给 `.jz-table-wrap` 设 maxHeight（超出滚动，表头冻结已由 CSS 提供）
 *  - `data-jz-pad-v/h`：若 DOMPurify 剥掉了 inline `--jz-cell-pad-*` 变量，从 data 属性重新 setProperty 兜底
 *
 * 仿 CodeBlockEnhancer 的「selector + bindKey 渲染后扫 DOM」范式。
 */
export function useTableEnhancer(containerSelector: string, bindKey: unknown) {
  useEffect(() => {
    const root = document.querySelector(containerSelector);
    if (!root) return;

    const apply = () => {
      root.querySelectorAll<HTMLTableElement>('table[data-jz-max-rows], table[data-jz-pad-v]').forEach(
        (table) => {
          // 自定义间距兜底：变量不在（被 sanitize 剥）时用 data 属性补
          const pv = table.getAttribute('data-jz-pad-v');
          const ph = table.getAttribute('data-jz-pad-h');
          if (pv && !table.style.getPropertyValue('--jz-cell-pad-v')) {
            table.style.setProperty('--jz-cell-pad-v', `${pv}px`);
          }
          if (ph && !table.style.getPropertyValue('--jz-cell-pad-h')) {
            table.style.setProperty('--jz-cell-pad-h', `${ph}px`);
          }
          // 行数上限 → 滚动容器 maxHeight
          const maxRows = Number(table.getAttribute('data-jz-max-rows'));
          if (!maxRows) return;
          const wrap = (table.closest('.jz-table-wrap') as HTMLElement | null) ?? table;
          const h = computeMaxRowsHeight(table, maxRows);
          if (h) {
            wrap.style.maxHeight = `${h}px`;
            wrap.style.overflowY = 'auto';
          } else {
            wrap.style.maxHeight = '';
          }
        },
      );
    };

    apply();
    // 字体/图片加载后行高变化 → 重测
    const ro = new ResizeObserver(() => apply());
    root
      .querySelectorAll<HTMLTableElement>('table[data-jz-max-rows]')
      .forEach((t) => ro.observe(t));
    return () => ro.disconnect();
  }, [containerSelector, bindKey]);
}

export default function TableEnhancer({
  selector,
  bindKey,
}: {
  selector: string;
  bindKey: unknown;
}) {
  useTableEnhancer(selector, bindKey);
  return null;
}
