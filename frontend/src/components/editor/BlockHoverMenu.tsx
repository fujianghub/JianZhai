import { useEffect, useRef, useState, useMemo } from 'react';
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

/**
 * 块级悬浮菜单（类似语雀的 ⋮⋮ 锚点）。
 *
 * 左侧两个按钮：
 *   ➕  在下方插入空段落
 *   ⋯  打开 Popover 面板：
 *       · 转换为 → 正文 / H1-H4 / 引用 / 任务列表 / 有序列表 / 无序列表 / 代码块
 *       · 包裹为容器（toggle） → 高亮(tips/warning/info/danger) / 引用 / 折叠 / 分栏 / 标签页
 *       · 缩进 ← / →
 *       · 复制此块 / 复制为 Markdown / 选中此块 / 删除此块
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

export function BlockHoverMenu({ editor, shellRef }: Props) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const blockPosRef = useRef<number | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || !editor) return;

    function findBlockElement(target: HTMLElement | null): HTMLElement | null {
      let el = target;
      const pm = shell?.querySelector('.ProseMirror');
      if (!pm) return null;
      while (el && el !== pm && el.parentElement) {
        if (el.parentElement === pm) return el;
        el = el.parentElement;
      }
      return null;
    }

    function onMove(e: MouseEvent) {
      try {
        const block = findBlockElement(e.target as HTMLElement);
        if (!block) {
          if (!popoverOpen) {
            setPos(null);
            blockPosRef.current = null;
          }
          return;
        }
        const rect = block.getBoundingClientRect();
        const result = editor?.view.posAtCoords({ left: rect.left + 4, top: rect.top + 4 });
        if (result && editor) {
          const pos = result.inside >= 0 ? result.inside : result.pos;
          const $resolved = editor.state.doc.resolve(
            Math.max(0, Math.min(pos, editor.state.doc.content.size))
          );
          if ($resolved.depth >= 1) {
            blockPosRef.current = $resolved.before(1);
          } else {
            blockPosRef.current = null;
          }
        }
        setPos({ top: rect.top, left: rect.left - 56 });
      } catch {
        setPos(null);
        blockPosRef.current = null;
      }
    }

    function onLeave() {
      window.setTimeout(() => {
        const hovered = document.querySelector('.jz-block-hover-menu:hover');
        if (!hovered && !popoverOpen) setPos(null);
      }, 100);
    }

    shell.addEventListener('mousemove', onMove);
    shell.addEventListener('mouseleave', onLeave);
    return () => {
      shell.removeEventListener('mousemove', onMove);
      shell.removeEventListener('mouseleave', onLeave);
    };
  }, [editor, shellRef, popoverOpen]);

  /** 当前块的 node + from/to */
  const blockInfo = useMemo(() => {
    if (!editor || blockPosRef.current == null) return null;
    const from = blockPosRef.current;
    const node = editor.state.doc.nodeAt(from);
    if (!node) return null;
    return { from, to: from + node.nodeSize, node };
  }, [editor, popoverOpen, pos]);

  if (!editor || !editor.isEditable || !pos) return null;

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
    setPos(null);
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
    // 用 tiptap-markdown 的 storage 把整个文档序列化，再切片该块的内容近似
    const md: string = editor.storage.markdown?.getMarkdown?.() ?? '';
    void navigator.clipboard.writeText(md);
  }

  function indent() {
    withCurrentBlockSelected(() => editor!.commands.indent?.());
  }
  function outdent() {
    withCurrentBlockSelected(() => editor!.commands.outdent?.());
  }

  /* ── Popover 主面板 ──────────────────────────────────────────────── */
  const popoverContent = (
    <div className="jz-block-panel" onMouseDown={(e) => e.stopPropagation()}>
      {/* 转换为 */}
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

      {/* 包裹为容器 (toggle) */}
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

      {/* 缩进 + 操作 */}
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
      className="jz-block-hover-menu"
      style={{
        position: 'fixed',
        top: pos.top + 2,
        left: pos.left,
        display: 'flex',
        gap: 2,
        zIndex: 50,
      }}
      onMouseEnter={(e) => e.stopPropagation()}
    >
      <Tooltip title="在下方插入段落">
        <button
          type="button"
          className="jz-block-anchor-btn"
          onClick={insertAfter}
          aria-label="添加块"
        >
          <PlusOutlined />
        </button>
      </Tooltip>
      <Popover
        content={popoverContent}
        trigger="click"
        placement="bottomLeft"
        open={popoverOpen}
        onOpenChange={setPopoverOpen}
        overlayClassName="jz-block-panel-overlay"
      >
        <Tooltip title="更多操作 — 转换 / 包裹 / 缩进">
          <button type="button" className="jz-block-anchor-btn" aria-label="更多">
            <MoreOutlined />
          </button>
        </Tooltip>
      </Popover>
    </div>
  );
}
