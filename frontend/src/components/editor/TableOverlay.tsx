import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dropdown, InputNumber, Tooltip } from 'antd';
import {
  BgColorsOutlined,
  FontColorsOutlined,
  ColumnHeightOutlined,
  TableOutlined,
  MergeCellsOutlined,
  SplitCellsOutlined,
  BorderOuterOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { Editor } from '@tiptap/core';
import { message } from '@/utils/notify';
import { CELL_BG_PRESETS } from './TableCellColor';
import { TEXT_COLOR_PRESETS } from './callouts';
import { DENSITY_PRESETS } from '@/utils/tableDensity';

const MAX_ROWS_OPTIONS = [0, 10, 20, 30]; // 0 = 不限

/** 读当前选区所在表格的自定义间距 attr（用于「只改一个轴」时保留另一个）。 */
function currentTableAttr(editor: Editor, key: 'cellPadV' | 'cellPadH'): number | null {
  const v = editor.getAttributes('table')?.[key];
  return typeof v === 'number' ? v : null;
}
const tableCellPadV = (e: Editor) => currentTableAttr(e, 'cellPadV');
const tableCellPadH = (e: Editor) => currentTableAttr(e, 'cellPadH');

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
  /** caret 是否在某张表内 —— 决定是否显示上方工具条（与 hover 区分）。 */
  const [caretInTable, setCaretInTable] = useState(false);
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

  // caret 进入表格 → 锚到该表并显示工具条（无需 hover）；离开则收工具条
  useEffect(() => {
    if (!editor) return;
    const onSel = () => {
      const active = editor.isActive('table');
      setCaretInTable(active);
      if (!active) return;
      // 用选区位置定位 caret 所在的 <table> DOM，作为工具条锚点
      try {
        const { from } = editor.state.selection;
        const dom = editor.view.domAtPos(from)?.node as HTMLElement | null;
        const el = (dom?.nodeType === 1 ? dom : dom?.parentElement)?.closest('table') as
          | HTMLTableElement
          | null;
        if (el) {
          tableElRef.current = el;
          setRects(collectRects(editor, el));
        }
      } catch {
        /* noop */
      }
    };
    editor.on('selectionUpdate', onSel);
    editor.on('transaction', onSel);
    onSel();
    return () => {
      editor.off('selectionUpdate', onSel);
      editor.off('transaction', onSel);
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

  const run = (fn: () => void) => () => {
    fn();
  };
  const colorMenu = (
    attr: 'bgColor' | 'textColor',
    presets: Array<{ label: string; value: string }>,
  ) => ({
    items: [
      ...presets.map((c) => ({
        key: c.value,
        label: (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                display: 'inline-block',
                width: 13,
                height: 13,
                borderRadius: 3,
                background: c.value,
                border: '1px solid var(--jz-border)',
              }}
            />
            {c.label}
          </span>
        ),
        onClick: () => editor.chain().focus().setCellAttribute(attr, c.value).run(),
      })),
      { type: 'divider' as const },
      {
        key: 'clear',
        label: attr === 'bgColor' ? '清除底色' : '清除文字色',
        onClick: () => editor.chain().focus().setCellAttribute(attr, null).run(),
      },
    ],
  });

  return createPortal(
    <div className="jz-table-overlay" aria-hidden={false}>
      {/* 统一工具条：caret 在表内时显示在表格上方（错开 grip 与表头） */}
      {caretInTable && (
        <div
          className="jz-table-toolbar"
          style={{ left: table.left, top: Math.max(8, table.top - 56), maxWidth: Math.max(table.width, 360) }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="jz-table-tb-group">
            <Tooltip title="选中整表">
              <button className="jz-table-tb-btn" onClick={run(() => editor.commands.selectTableAll(tablePos))}>
                <BorderOuterOutlined />
              </button>
            </Tooltip>
            <Tooltip title="合并单元格">
              <button className="jz-table-tb-btn" onClick={run(() => editor.chain().focus().mergeCells().run())}>
                <MergeCellsOutlined />
              </button>
            </Tooltip>
            <Tooltip title="拆分单元格">
              <button className="jz-table-tb-btn" onClick={run(() => editor.chain().focus().splitCell().run())}>
                <SplitCellsOutlined />
              </button>
            </Tooltip>
            <Tooltip title="切换表头行">
              <button className="jz-table-tb-btn" onClick={run(() => editor.chain().focus().toggleHeaderRow().run())}>
                <TableOutlined />
              </button>
            </Tooltip>
          </div>
          <span className="jz-table-tb-divider" />
          <div className="jz-table-tb-group">
            <Dropdown trigger={['click']} getPopupContainer={() => document.body} overlayStyle={{ zIndex: 12000 }} menu={colorMenu('bgColor', CELL_BG_PRESETS)}>
              <Tooltip title="单元格底色"><button className="jz-table-tb-btn"><BgColorsOutlined /></button></Tooltip>
            </Dropdown>
            <Dropdown trigger={['click']} getPopupContainer={() => document.body} overlayStyle={{ zIndex: 12000 }} menu={colorMenu('textColor', TEXT_COLOR_PRESETS)}>
              <Tooltip title="文字颜色"><button className="jz-table-tb-btn"><FontColorsOutlined /></button></Tooltip>
            </Dropdown>
            <Dropdown
              trigger={['click']}
              getPopupContainer={() => document.body}
              overlayStyle={{ zIndex: 12000 }}
              popupRender={() => (
                <div className="jz-table-density-pop" onMouseDown={(e) => e.preventDefault()}>
                  <div className="jz-table-density-row">
                    {(['compact', 'normal', 'loose'] as const).map((d) => (
                      <button key={d} className="jz-table-density-chip" onClick={() => editor.commands.setTableDensity(d)}>
                        {d === 'compact' ? '紧凑' : d === 'normal' ? '标准' : '宽松'}
                      </button>
                    ))}
                  </div>
                  <div className="jz-table-density-custom">
                    <label>行间距<InputNumber size="small" min={0} max={48} placeholder={String(DENSITY_PRESETS.normal.v)} onChange={(v) => v != null && editor.commands.setTableCellPadding(Number(v), tableCellPadH(editor))} /></label>
                    <label>列间距<InputNumber size="small" min={0} max={48} placeholder={String(DENSITY_PRESETS.normal.h)} onChange={(v) => v != null && editor.commands.setTableCellPadding(tableCellPadV(editor), Number(v))} /></label>
                  </div>
                </div>
              )}
            >
              <Tooltip title="行/列间距（密度）"><button className="jz-table-tb-btn"><ColumnHeightOutlined /></button></Tooltip>
            </Dropdown>
            <Dropdown
              trigger={['click']}
              getPopupContainer={() => document.body}
              overlayStyle={{ zIndex: 12000 }}
              menu={{
                items: MAX_ROWS_OPTIONS.map((n) => ({
                  key: String(n),
                  label: n === 0 ? '不限行数' : `最多 ${n} 行`,
                  onClick: () => editor.commands.setTableMaxRows(n || null),
                })),
              }}
            >
              <Tooltip title="最多显示行数"><button className="jz-table-tb-btn jz-table-tb-text">行数▾</button></Tooltip>
            </Dropdown>
          </div>
          <span className="jz-table-tb-divider" />
          <div className="jz-table-tb-group">
            <Tooltip title="删除当前行">
              <button className="jz-table-tb-btn is-danger" onClick={run(() => editor.chain().focus().deleteRow().run())}>删行</button>
            </Tooltip>
            <Tooltip title="删除当前列">
              <button className="jz-table-tb-btn is-danger" onClick={run(() => editor.chain().focus().deleteColumn().run())}>删列</button>
            </Tooltip>
            <Tooltip title="删除整个表格">
              <button className="jz-table-tb-btn is-danger" onClick={run(() => editor.chain().focus().deleteTable().run())}><DeleteOutlined /></button>
            </Tooltip>
          </div>
        </div>
      )}
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
          style={{ left: c.left + 2, width: Math.max(16, c.width - 4), top: table.top - 22 }}
          title="单击选中整列，拖动移动"
          onPointerDown={(e) => beginDrag(e, 'col', i)}
        />
      ))}
      {/* 行 grips */}
      {rows.map((r, i) => (
        <div
          key={`r${i}`}
          className={`jz-table-grip jz-table-grip-row${drag?.kind === 'row' && drag.from === i ? ' is-dragging' : ''}`}
          style={{ top: r.top + 2, height: Math.max(14, r.height - 4), left: table.left - 22 }}
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
