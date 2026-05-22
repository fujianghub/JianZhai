/**
 * 拖拽创建分栏 — 仿语雀。
 *
 * 行为：
 *   - 拖动任意块时，dragover 检测光标 x 是否在目标块的左 / 右 20%
 *   - 若是，显示一根朱砂竖线 + 「创建分栏」标签
 *   - drop 时，把源块 + 目标块组合成 `columns({count:2}, [column, column])`
 *
 * 与 `tiptap-extension-global-drag-handle` 协同：拖动时 PM 的 `view.dragging`
 * 已包含 slice 和 move 标记，我们只需在 handleDrop 里替换默认逻辑。
 *
 * 限制：
 *   - 只处理顶级块（depth=1），嵌套块拖出后落到顶层
 *   - 嵌套已在 columns 里的块再拖到边缘会再造一层 columns（用户可撤销）
 *   - 多块选择拖拽暂不支持
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

const COLUMN_THRESHOLD = 0.2; // 边缘 20% 区域视为「创建分栏」意图

let dropIndicator: HTMLElement | null = null;

function clearIndicator() {
  dropIndicator?.remove();
  dropIndicator = null;
}

function showIndicator(rect: DOMRect, side: 'left' | 'right') {
  clearIndicator();
  const el = document.createElement('div');
  el.className = 'jz-drop-column-indicator';
  el.dataset.side = side;
  el.style.top = `${rect.top}px`;
  el.style.height = `${rect.height}px`;
  el.style.left = `${side === 'left' ? rect.left - 8 : rect.right + 4}px`;
  document.body.appendChild(el);
  dropIndicator = el;
}

interface TargetInfo {
  blockPos: number;
  blockNode: import('@tiptap/pm/model').Node;
  blockRect: DOMRect;
}

function findTargetBlock(view: EditorView, x: number, y: number): TargetInfo | null {
  const result = view.posAtCoords({ left: x, top: y });
  if (!result) return null;
  const $pos = view.state.doc.resolve(result.pos);
  if ($pos.depth < 1) return null;
  // 顶级块
  const blockPos = $pos.before(1);
  const blockNode = view.state.doc.nodeAt(blockPos);
  if (!blockNode) return null;
  const dom = view.nodeDOM(blockPos);
  if (!(dom instanceof HTMLElement)) return null;
  return { blockPos, blockNode, blockRect: dom.getBoundingClientRect() };
}

function getColumnSide(rect: DOMRect, x: number): 'left' | 'right' | null {
  const ratio = (x - rect.left) / rect.width;
  if (ratio < COLUMN_THRESHOLD) return 'left';
  if (ratio > 1 - COLUMN_THRESHOLD) return 'right';
  return null;
}

export const DragToColumns = Extension.create({
  name: 'dragToColumns',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('jz-drag-to-columns'),
        props: {
          handleDOMEvents: {
            dragover(view, event) {
              const ev = event as DragEvent;
              const target = findTargetBlock(view, ev.clientX, ev.clientY);
              if (!target) {
                clearIndicator();
                return false;
              }
              const side = getColumnSide(target.blockRect, ev.clientX);
              if (side) {
                showIndicator(target.blockRect, side);
                ev.preventDefault();
              } else {
                clearIndicator();
              }
              return false;
            },
            dragleave() {
              return false;
            },
            dragend() {
              clearIndicator();
              return false;
            },
            drop(view, event) {
              const ev = event as DragEvent;
              const target = findTargetBlock(view, ev.clientX, ev.clientY);
              if (!target) {
                clearIndicator();
                return false;
              }
              const side = getColumnSide(target.blockRect, ev.clientX);
              if (!side) {
                clearIndicator();
                return false;
              }

              const dragging = (view as unknown as { dragging?: { slice?: import('@tiptap/pm/model').Slice; move?: boolean } }).dragging;
              if (!dragging || !dragging.slice) {
                clearIndicator();
                return false;
              }

              const { schema } = view.state;
              const columnsType = schema.nodes.columns;
              const columnType = schema.nodes.column;
              if (!columnsType || !columnType) {
                clearIndicator();
                return false;
              }

              try {
                // 源 slice content（可能是多个节点；列只接受 block+ 内容）
                const draggedContent = dragging.slice.content;
                const draggedColumn = columnType.create(null, draggedContent);
                const targetColumn = columnType.create(null, target.blockNode);
                const columnsNode = columnsType.create(
                  { count: 2 },
                  side === 'left' ? [draggedColumn, targetColumn] : [targetColumn, draggedColumn]
                );

                let tr = view.state.tr;

                // 如果是移动操作，先删源；然后调整目标位置
                if (dragging.move) {
                  const sel = view.state.selection;
                  tr = tr.delete(sel.from, sel.to);
                  let targetPos = target.blockPos;
                  if (sel.from < target.blockPos) {
                    targetPos -= sel.to - sel.from;
                  }
                  tr = tr.replaceWith(
                    targetPos,
                    targetPos + target.blockNode.nodeSize,
                    columnsNode
                  );
                } else {
                  // 复制操作（按住 Ctrl 等）
                  tr = tr.replaceWith(
                    target.blockPos,
                    target.blockPos + target.blockNode.nodeSize,
                    columnsNode
                  );
                }

                view.dispatch(tr);
                clearIndicator();
                ev.preventDefault();
                return true;
              } catch (e) {
                clearIndicator();
                // eslint-disable-next-line no-console
                console.warn('[jz] drag-to-columns 失败：', e);
                return false;
              }
            },
          },
        },
      }),
    ];
  },
});
