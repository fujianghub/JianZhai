import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { message } from '@/utils/notify';

/**
 * 表格悬浮交互层（语雀/Notion 式）：
 *  - 悬停表格 → 右缘竖向 `+` 加列、下缘横向 `+` 加行
 *  - 列上缘/行左缘 grip 把手：单击=选中整列/整行，拖动=重排（插入位指示线）
 *
 * 全部 fixed 定位 portal 到 body（参照 BlockHoverMenu 的 rect 跟踪思路），
 * 不侵入 ProseMirror DOM，不影响 sticky 冻结表头。
 */

interface TableRects {
  table: DOMRect;
  cols: Array<{ left: number; width: number }>; // 首行单元格水平区间
  rows: Array<{ top: number; height: number }>; // 各行垂直区间
  tablePos: number; // PM 文档内位置（表格内任一点）
}

interface DragState {
  kind: 'row' | 'col';
  from: number;
  /** 当前悬停的目标 index（插入位指示） */
  to: number;
}

const EDGE = 18; // 悬停判定的边缘扩展带（px）

function collectRects(editor: Editor, tableEl: HTMLTableElement): TableRects | null {
  const table = tableEl.getBoundingClientRect();
  const firstRow = tableEl.querySelector('tr');
  if (!firstRow) return null;
  const cols: TableRects['cols'] = [];
  firstRow.querySelectorAll<HTMLTableCellElement>('td, th').forEach((cell) => {
    const r = cell.getBoundingClientRect();
    const span = cell.colSpan || 1;
    // 合并单元格按等宽近似拆分（重排对 span 表由库命令处理/拒绝）
    for (let i = 0; i < span; i++) {
      cols.push({ left: r.left + (r.width / span) * i, width: r.width / span });
    }
  });
  const rows: TableRects['rows'] = [];
  tableEl.querySelectorAll('tr').forEach((tr) => {
    const r = tr.getBoundingClientRect();
    rows.push({ top: r.top, height: r.height });
  });
  let tablePos = -1;
  try {
    tablePos = editor.view.posAtDOM(tableEl, 0);
  } catch {
    return null;
  }
  return { table, cols, rows, tablePos };
}

export default function TableOverlay({ editor }: { editor: Editor | null }) {
  const [rects, setRects] = useState<TableRects | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const tableElRef = useRef<HTMLTableElement | null>(null);
  const rectsRef = useRef<TableRects | null>(null);
  rectsRef.current = rects;
  const hideTimerRef = useRef<number | null>(null);

  const refresh = useCallback(() => {
    if (!editor || !tableElRef.current || !tableElRef.current.isConnected) {
      setRects(null);
      return;
    }
    setRects(collectRects(editor, tableElRef.current));
  }, [editor]);

  // 鼠标跟踪：进入表格（含边缘扩展带）显示，离开延迟收起
  useEffect(() => {
    if (!editor) return;
    const onMove = (e: MouseEvent) => {
      const root = editor.view.dom as HTMLElement;
      const target = e.target as HTMLElement | null;
      const overOverlay = target?.closest?.('.jz-table-overlay');
      if (overOverlay) {
        if (hideTimerRef.current) {
          window.clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        return;
      }
      const tableEl = (target?.closest?.('table') ?? null) as HTMLTableElement | null;
      if (tableEl && root.contains(tableEl)) {
        if (hideTimerRef.current) {
          window.clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        if (tableElRef.current !== tableEl) {
          tableElRef.current = tableEl;
        }
        setRects(collectRects(editor, tableEl));
        return;
      }
      // 容差：在当前表格 rect 外扩 EDGE 内仍算悬停
      const cur = rectsRef.current;
      if (cur) {
        const { table } = cur;
        if (
          e.clientX >= table.left - EDGE &&
          e.clientX <= table.right + EDGE * 2 &&
          e.clientY >= table.top - EDGE &&
          e.clientY <= table.bottom + EDGE * 2
        ) {
          return;
        }
      }
      if (!hideTimerRef.current) {
        hideTimerRef.current = window.setTimeout(() => {
          hideTimerRef.current = null;
          tableElRef.current = null;
          setRects(null);
        }, 250);
      }
    };
    document.addEventListener('mousemove', onMove);
    return () => {
      document.removeEventListener('mousemove', onMove);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [editor]);

  // 文档变化 / 滚动 / 缩放时重算位置
  useEffect(() => {
    if (!editor) return;
    const onTx = () => requestAnimationFrame(refresh);
    editor.on('transaction', onTx);
    window.addEventListener('scroll', refresh, true);
    window.addEventListener('resize', refresh);
    return () => {
      editor.off('transaction', onTx);
      window.removeEventListener('scroll', refresh, true);
      window.removeEventListener('resize', refresh);
    };
  }, [editor, refresh]);

  /* ----------------------------- grip 拖动 ----------------------------- */

  const beginDrag = useCallback(
    (e: React.PointerEvent, kind: 'row' | 'col', index: number) => {
      if (!editor) return;
      e.preventDefault();
      let moved = false;
      const computeTo = (ev: PointerEvent): number => {
        const cur = rectsRef.current;
        if (!cur) return index;
        if (kind === 'col') {
          for (let i = 0; i < cur.cols.length; i++) {
            const c = cur.cols[i];
            if (ev.clientX < c.left + c.width / 2) return Math.max(0, i);
          }
          return cur.cols.length - 1;
        }
        for (let i = 0; i < cur.rows.length; i++) {
          const r = cur.rows[i];
          if (ev.clientY < r.top + r.height / 2) return Math.max(0, i);
        }
        return cur.rows.length - 1;
      };
      const onMove = (ev: PointerEvent) => {
        moved = true;
        setDrag({ kind, from: index, to: computeTo(ev) });
      };
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove);
        const cur = rectsRef.current;
        setDrag(null);
        if (!cur) return;
        if (!moved) {
          // 单击：选中整行/整列
          if (kind === 'row') editor.commands.selectTableRow(index, cur.tablePos);
          else editor.commands.selectTableColumn(index, cur.tablePos);
          return;
        }
        const to = computeTo(ev);
        if (to !== index) {
          const ok =
            kind === 'row'
              ? editor.commands.moveTableRowTo(index, to, cur.tablePos)
              : editor.commands.moveTableColumnTo(index, to, cur.tablePos);
          if (!ok) {
            // 库命令对含合并单元格等不可重排场景返回 false
            message.info('该表格（含合并单元格）暂不支持拖动重排');
          }
        }
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    },
    [editor],
  );

  if (!editor || !editor.isEditable || !rects) return null;
  const { table, cols, rows, tablePos } = rects;

  return createPortal(
    <div className="jz-table-overlay" aria-hidden>
      {/* 右缘 + 列 */}
      <button
        type="button"
        className="jz-table-edge-btn jz-table-edge-col"
        style={{ left: table.right + 4, top: table.top, height: Math.min(table.height, 320) }}
        title="在末尾添加一列"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          editor.commands.selectTableColumn(cols.length - 1, tablePos);
          editor.chain().focus().addColumnAfter().run();
        }}
      >
        +
      </button>
      {/* 下缘 + 行 */}
      <button
        type="button"
        className="jz-table-edge-btn jz-table-edge-row"
        style={{ left: table.left, top: table.bottom + 4, width: table.width }}
        title="在末尾添加一行"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          editor.commands.selectTableRow(rows.length - 1, tablePos);
          editor.chain().focus().addRowAfter().run();
        }}
      >
        +
      </button>
      {/* 列 grips */}
      {cols.map((c, i) => (
        <div
          key={`c${i}`}
          className={`jz-table-grip jz-table-grip-col${drag?.kind === 'col' && drag.from === i ? ' is-dragging' : ''}`}
          style={{ left: c.left + 2, width: Math.max(16, c.width - 4), top: table.top - 14 }}
          title="单击选中整列，拖动移动"
          onPointerDown={(e) => beginDrag(e, 'col', i)}
        />
      ))}
      {/* 行 grips */}
      {rows.map((r, i) => (
        <div
          key={`r${i}`}
          className={`jz-table-grip jz-table-grip-row${drag?.kind === 'row' && drag.from === i ? ' is-dragging' : ''}`}
          style={{ top: r.top + 2, height: Math.max(14, r.height - 4), left: table.left - 14 }}
          title="单击选中整行，拖动移动"
          onPointerDown={(e) => beginDrag(e, 'row', i)}
        />
      ))}
      {/* 拖动插入位指示线 */}
      {drag && drag.kind === 'col' && cols[drag.to] && (
        <div
          className="jz-table-drop-line jz-table-drop-line-v"
          style={{
            left: (drag.to <= drag.from ? cols[drag.to].left : cols[drag.to].left + cols[drag.to].width) - 1,
            top: table.top,
            height: table.height,
          }}
        />
      )}
      {drag && drag.kind === 'row' && rows[drag.to] && (
        <div
          className="jz-table-drop-line jz-table-drop-line-h"
          style={{
            top: (drag.to <= drag.from ? rows[drag.to].top : rows[drag.to].top + rows[drag.to].height) - 1,
            left: table.left,
            width: table.width,
          }}
        />
      )}
    </div>,
    document.body,
  );
}
