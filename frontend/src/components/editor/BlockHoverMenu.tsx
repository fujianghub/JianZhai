import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Popover, Tooltip } from 'antd';
import {
  PlusOutlined,
  MoreOutlined,
  CopyOutlined,
  DeleteOutlined,
  ArrowRightOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

interface Props {
  editor: Editor | null;
  shellRef: React.RefObject<HTMLElement | null>;
}

const ANCHOR_OFFSET = 36;

/**
 * 块级悬浮菜单（语雀风单锚点：拖拽 + 插入 + 更多）。
 */

const TRANSFORM_OPS = [
  { key: 'p',  label: '正文',   apply: (e: Editor) => e.chain().focus().setParagraph().run() },
  { key: 'h1', label: '一级标题', apply: (e: Editor) => e.chain().focus().setHeading({ level: 1 }).run() },
  { key: 'h2', label: '二级标题', apply: (e: Editor) => e.chain().focus().setHeading({ level: 2 }).run() },
  { key: 'h3', label: '三级标题', apply: (e: Editor) => e.chain().focus().setHeading({ level: 3 }).run() },
  { key: 'ul', label: '无序列表', apply: (e: Editor) => e.chain().focus().toggleBulletList().run() },
  { key: 'ol', label: '有序列表', apply: (e: Editor) => e.chain().focus().toggleOrderedList().run() },
  { key: 'task', label: '任务列表', apply: (e: Editor) => e.chain().focus().toggleTaskList().run() },
  { key: 'quote', label: '引用块', apply: (e: Editor) => e.chain().focus().toggleBlockquote().run() },
  { key: 'code', label: '代码块', apply: (e: Editor) => e.chain().focus().toggleCodeBlock().run() },
] as const;

const WRAP_OPS = [
  { key: 'tips', label: '提示色块',  apply: (e: Editor) => e.chain().focus().setCallout({ kind: 'tips' }).run() },
  { key: 'info', label: '说明色块',  apply: (e: Editor) => e.chain().focus().setCallout({ kind: 'info' }).run() },
  { key: 'warning', label: '警告色块', apply: (e: Editor) => e.chain().focus().setCallout({ kind: 'warning' }).run() },
  { key: 'danger', label: '危险色块',  apply: (e: Editor) => e.chain().focus().setCallout({ kind: 'danger' }).run() },
  { key: 'quote', label: '引用块',  apply: (e: Editor) => e.chain().focus().toggleBlockquote().run() },
  { key: 'details', label: '折叠块',  apply: (e: Editor) => e.chain().focus().insertDetails('详细内容').run() },
  { key: 'cols2', label: '双栏布局', apply: (e: Editor) => e.chain().focus().insertColumns(2).run() },
  { key: 'tabs', label: '标签页',   apply: (e: Editor) => e.chain().focus().insertTabs(2).run() },
] as const;

/** Resolve the position of the **outermost** block (depth=1) that contains
 * the given DOM node. We deliberately walk down from the document root, not
 * up from the leaf — that way nested structures (table cells, columns, tabs,
 * details/summary) all map to their parent block rather than to a deep
 * paragraph buried inside them.
 */
function resolveBlockFromDom(editor: Editor, dom: HTMLElement): number | null {
  try {
    const pos = editor.view.posAtDOM(dom, 0);
    const $pos = editor.state.doc.resolve(pos);
    if ($pos.depth < 1) return null;
    // depth 1 == direct child of doc, which is what GlobalDragHandle expects.
    return $pos.before(1);
  } catch {
    return null;
  }
}

/** Walk up the DOM until we hit either a node-view wrapper or an element
 * that resolves to a top-level (depth=1) block. Stops at the ProseMirror
 * editable root. */
function findBlockElement(
  _editor: Editor,
  target: HTMLElement | null,
  pm: HTMLElement,
): HTMLElement | null {
  let el: HTMLElement | null = target;
  while (el && el !== pm) {
    if (el.parentElement === pm) return el;
    el = el.parentElement;
  }
  return null;
}

function selectionSpansMultipleBlocks(editor: Editor): boolean {
  const { from, to, empty } = editor.state.selection;
  if (empty) return false;
  const $from = editor.state.doc.resolve(from);
  const $to = editor.state.doc.resolve(to);
  const blockDepth = Math.max(1, Math.min($from.depth, $to.depth));
  if ($from.depth < blockDepth || $to.depth < blockDepth) return false;
  return $from.before(blockDepth) !== $to.before(blockDepth);
}

function isDragging(editor: Editor): boolean {
  return editor.view.dom.classList.contains('dragging');
}

function BlockDragGrip() {
  return (
    <span className="jz-block-grip-dots" aria-hidden>
      <span /><span /><span /><span /><span /><span />
    </span>
  );
}

export function BlockHoverMenu({ editor, shellRef }: Props) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [blockFrom, setBlockFrom] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const blockElRef = useRef<HTMLElement | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [menuHover, setMenuHover] = useState(false);
  const popoverOpenRef = useRef(popoverOpen);
  const menuHoverRef = useRef(menuHover);
  const leaveTimerRef = useRef<number | null>(null);
  const blurTimerRef = useRef<number | null>(null);

  useEffect(() => { popoverOpenRef.current = popoverOpen; }, [popoverOpen]);
  useEffect(() => { menuHoverRef.current = menuHover; }, [menuHover]);

  const computePos = useCallback((block: HTMLElement, shell: HTMLElement) => {
    const shellRect = shell.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    return {
      top: blockRect.top - shellRect.top + shell.scrollTop + 2,
      left: blockRect.left - shellRect.left - ANCHOR_OFFSET,
    };
  }, []);

  const hideMenu = useCallback(() => {
    setVisible(false);
    blockElRef.current = null;
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || !editor) return;

    function shouldHide(): boolean {
      if (popoverOpenRef.current || menuHoverRef.current) return false;
      if (!editor?.view.hasFocus()) return true;
      if (selectionSpansMultipleBlocks(editor)) return true;
      return false;
    }

    function refreshPos() {
      const block = blockElRef.current;
      if (!block) return;
      setPos(computePos(block, shell!));
    }

    function onMove(e: MouseEvent) {
      if (!editor?.isEditable) return;
      // While drag is in progress, freeze the menu — don't hide (anchor must
      // stay alive for GlobalDragHandle to keep the drag image anchored).
      if (isDragging(editor)) return;
      if (shouldHide()) {
        if (!popoverOpenRef.current && !menuHoverRef.current) hideMenu();
        return;
      }

      const pm = shell!.querySelector('.ProseMirror') as HTMLElement | null;
      if (!pm) return;

      const block = findBlockElement(editor!, e.target as HTMLElement, pm);
      if (!block) {
        if (!popoverOpenRef.current && !menuHoverRef.current) hideMenu();
        return;
      }

      // 同一块内移动：位置/pos 均未变，跳过 resolve + 测量 + setState
      if (block === blockElRef.current) {
        setVisible(true);
        shell!.classList.add('is-block-hover');
        return;
      }

      const from = resolveBlockFromDom(editor!, block);
      if (from == null) {
        if (!popoverOpenRef.current && !menuHoverRef.current) hideMenu();
        return;
      }

      blockElRef.current = block;
      setBlockFrom(from);
      setPos(computePos(block, shell!));
      setVisible(true);
      shell!.classList.add('is-block-hover');
    }

    function onLeave() {
      if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = window.setTimeout(() => {
        leaveTimerRef.current = null;
        const hoveredMenu = document.querySelector('.jz-block-hover-menu:hover');
        if (!hoveredMenu && !popoverOpenRef.current && !menuHoverRef.current) {
          shell!.classList.remove('is-block-hover');
          hideMenu();
        }
      }, 120);
    }

    const onSelectionUpdate = () => {
      if (shouldHide() && !popoverOpenRef.current && !menuHoverRef.current) hideMenu();
    };

    const onBlur = () => {
      if (blurTimerRef.current) window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = window.setTimeout(() => {
        blurTimerRef.current = null;
        if (!editor?.view.hasFocus() && !popoverOpenRef.current && !menuHoverRef.current) hideMenu();
      }, 150);
    };

    // rAF 节流：mousemove 每像素触发一次，findBlockElement/posAtDOM/
    // getBoundingClientRect 逐次执行是可感的 hover 开销 —— 合帧处理。
    let moveRaf: number | null = null;
    let lastMove: MouseEvent | null = null;
    function onMoveThrottled(e: MouseEvent) {
      lastMove = e;
      if (moveRaf != null) return;
      moveRaf = requestAnimationFrame(() => {
        moveRaf = null;
        if (lastMove) onMove(lastMove);
      });
    }

    shell.addEventListener('mousemove', onMoveThrottled);
    shell.addEventListener('mouseleave', onLeave);
    shell.addEventListener('scroll', refreshPos, { passive: true });
    window.addEventListener('resize', refreshPos);
    editor.on('selectionUpdate', onSelectionUpdate);
    editor.on('blur', onBlur);

    return () => {
      shell.removeEventListener('mousemove', onMoveThrottled);
      if (moveRaf != null) cancelAnimationFrame(moveRaf);
      shell.removeEventListener('mouseleave', onLeave);
      shell.removeEventListener('scroll', refreshPos);
      window.removeEventListener('resize', refreshPos);
      editor.off('selectionUpdate', onSelectionUpdate);
      editor.off('blur', onBlur);
      if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
      if (blurTimerRef.current) window.clearTimeout(blurTimerRef.current);
      shell.classList.remove('is-block-hover');
    };
  }, [editor, shellRef, computePos, hideMenu]);

  /** 当前块的 node + from/to */
  const blockInfo = useMemo(() => {
    if (!editor || blockFrom == null) return null;
    const from = blockFrom;
    const node = editor.state.doc.nodeAt(from);
    if (!node) return null;
    return { from, to: from + node.nodeSize, node };
  }, [editor, blockFrom, popoverOpen, pos]);

  // Always render the anchor (so GlobalDragHandle can pick it up) but hide
  // visually when the editor isn't editable / not hovered.
  if (!editor || !editor.isEditable) return null;
  const renderable: boolean = visible && pos != null && blockFrom != null;

  function withCurrentBlockSelected(fn: () => void) {
    if (!editor || !blockInfo) return;
    const sel = TextSelection.create(editor.state.doc, blockInfo.from + 1, blockInfo.from + 1);
    editor.view.dispatch(editor.state.tr.setSelection(sel));
    editor.view.focus();
    fn();
  }

  function insertAfter() {
    if (!blockInfo || !editor) return;
    const after = blockInfo.to;
    editor
      .chain()
      .focus()
      .insertContentAt(after, { type: 'paragraph' })
      .setTextSelection(after + 1)
      .run();
  }

  function deleteBlock() {
    if (!blockInfo || !editor) return;
    editor.chain().focus()
      .setTextSelection({ from: blockInfo.from, to: blockInfo.to })
      .deleteSelection()
      .run();
    hideMenu();
    setPopoverOpen(false);
  }

  function duplicateBlock() {
    if (!blockInfo || !editor) return;
    editor.chain().focus().insertContentAt(blockInfo.to, blockInfo.node.toJSON()).run();
  }

  function selectBlock() {
    if (!blockInfo || !editor) return;
    const from = blockInfo.from;
    const to = blockInfo.to;
    const sel = TextSelection.create(editor.state.doc, from + 1, Math.max(from + 1, to - 1));
    editor.view.dispatch(editor.state.tr.setSelection(sel));
    editor.view.focus();
  }

  function copyAsMarkdown() {
    if (!blockInfo || !editor) return;
    const serializer = editor.storage.markdown?.serializer;
    if (serializer) {
      const wrapDoc = editor.state.schema.nodes.doc.create(null, blockInfo.node);
      void navigator.clipboard.writeText(serializer.serialize(wrapDoc));
    } else {
      void navigator.clipboard.writeText(blockInfo.node.textContent || '');
    }
  }

  function indent() {
    withCurrentBlockSelected(() => editor!.commands.indent?.());
  }
  function outdent() {
    withCurrentBlockSelected(() => editor!.commands.outdent?.());
  }

  const popoverContent = (
    <div className="jz-block-panel" onMouseDown={(e) => e.stopPropagation()}>
      <div className="jz-block-panel-section">
        <div className="jz-block-panel-title">转换为</div>
        <div className="jz-block-panel-grid">
          {TRANSFORM_OPS.map((op) => (
            <button
              key={op.key}
              type="button"
              className="jz-block-panel-btn"
              onClick={() => withCurrentBlockSelected(() => op.apply(editor!))}
            >
              {op.label}
            </button>
          ))}
        </div>
      </div>

      <div className="jz-block-panel-section">
        <div className="jz-block-panel-title">包裹为容器</div>
        <div className="jz-block-panel-grid">
          {WRAP_OPS.map((op) => (
            <button
              key={op.key}
              type="button"
              className="jz-block-panel-btn jz-block-panel-btn-wrap"
              onClick={() => withCurrentBlockSelected(() => op.apply(editor!))}
            >
              {op.label}
            </button>
          ))}
        </div>
      </div>

      <div className="jz-block-panel-section">
        <div className="jz-block-panel-title">操作</div>
        <div className="jz-block-panel-row">
          <button type="button" className="jz-block-panel-btn" onClick={outdent}>
            <ArrowLeftOutlined /> 减少缩进
          </button>
          <button type="button" className="jz-block-panel-btn" onClick={indent}>
            <ArrowRightOutlined /> 增加缩进
          </button>
        </div>
        <div className="jz-block-panel-row">
          <button type="button" className="jz-block-panel-btn" onClick={selectBlock}>
            选中此块
          </button>
          <button type="button" className="jz-block-panel-btn" onClick={duplicateBlock}>
            <CopyOutlined /> 复制此块
          </button>
        </div>
        <div className="jz-block-panel-row">
          <button type="button" className="jz-block-panel-btn" onClick={copyAsMarkdown}>
            复制为 Markdown
          </button>
          <button
            type="button"
            className="jz-block-panel-btn jz-block-panel-btn-danger"
            onClick={deleteBlock}
          >
            <DeleteOutlined /> 删除此块
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={'jz-block-hover-menu' + (renderable ? ' is-visible' : '')}
      style={{
        position: 'absolute',
        top: renderable && pos ? pos.top : -9999,
        left: renderable && pos ? pos.left : -9999,
        display: 'flex',
        gap: 2,
        zIndex: 50,
      }}
      onMouseEnter={() => setMenuHover(true)}
      onMouseLeave={() => setMenuHover(false)}
    >
      <Tooltip title="拖拽移动">
        <button
          type="button"
          className="jz-block-anchor-btn jz-block-drag-handle"
          aria-label="拖拽块"
        >
          <BlockDragGrip />
        </button>
      </Tooltip>
      <Tooltip title="在下方插入段落">
        <button
          type="button"
          className="jz-block-anchor-btn"
          onClick={insertAfter}
          aria-label="添加块"
          disabled={!renderable}
        >
          <PlusOutlined />
        </button>
      </Tooltip>
      <Popover
        content={popoverContent}
        trigger="click"
        placement="bottomLeft"
        open={popoverOpen && renderable}
        onOpenChange={setPopoverOpen}
        overlayClassName="jz-block-panel-overlay"
      >
        <Tooltip title="更多操作 — 转换 / 包裹 / 缩进">
          <button
            type="button"
            className="jz-block-anchor-btn"
            aria-label="更多"
            disabled={!renderable}
          >
            <MoreOutlined />
          </button>
        </Tooltip>
      </Popover>
    </div>
  );
}
