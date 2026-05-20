import { useEffect, useRef, useState } from 'react';
import { Dropdown } from 'antd';
import { PlusOutlined, MoreOutlined } from '@ant-design/icons';
import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

interface Props {
  editor: Editor | null;
  /** The element that wraps the ProseMirror DOM. Mouse events on it are observed. */
  shellRef: React.RefObject<HTMLElement | null>;
}

/**
 * Yuque-style block hover menu — a small `+ / ⋯` cluster floating to the left
 * of the block the cursor is hovering. Complements the project's existing
 * tiptap-extension-global-drag-handle which only renders the drag dot.
 *
 * Behaviour:
 *  - `+`  inserts an empty paragraph immediately after the hovered block.
 *  - `⋯` opens a Dropdown with: 删除 / 复制 / 复制为 Markdown.
 */
export function BlockHoverMenu({ editor, shellRef }: Props) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const blockPosRef = useRef<number | null>(null);

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
          setPos(null);
          blockPosRef.current = null;
          return;
        }
        const rect = block.getBoundingClientRect();
        // ProseMirror posAtCoords → resolve → ancestor at depth 1 = top-level block
        const result = editor?.view.posAtCoords({ left: rect.left + 4, top: rect.top + 4 });
        if (result && editor) {
          const pos = result.inside >= 0 ? result.inside : result.pos;
          const $resolved = editor.state.doc.resolve(Math.max(0, Math.min(pos, editor.state.doc.content.size)));
          // .before(depth) requires depth >= 1 AND that depth exists. Skip if we
          // can't safely access a top-level block (e.g. cursor in an empty doc edge).
          if ($resolved.depth >= 1) {
            blockPosRef.current = $resolved.before(1);
          } else {
            blockPosRef.current = null;
          }
        }
        setPos({ top: rect.top, left: rect.left - 56 });
      } catch {
        // Never let mousemove crash the editor — silently bail if PM rejects.
        setPos(null);
        blockPosRef.current = null;
      }
    }

    function onLeave() {
      // Defer so moving onto the menu itself doesn't dismiss it
      window.setTimeout(() => {
        const hovered = document.querySelector('.jz-block-hover-menu:hover');
        if (!hovered) setPos(null);
      }, 100);
    }

    shell.addEventListener('mousemove', onMove);
    shell.addEventListener('mouseleave', onLeave);
    return () => {
      shell.removeEventListener('mousemove', onMove);
      shell.removeEventListener('mouseleave', onLeave);
    };
  }, [editor, shellRef]);

  if (!editor || !editor.isEditable || !pos) return null;

  function insertAfter() {
    if (blockPosRef.current == null || !editor) return;
    const node = editor.state.doc.nodeAt(blockPosRef.current);
    if (!node) return;
    const after = blockPosRef.current + node.nodeSize;
    editor
      .chain()
      .focus()
      .insertContentAt(after, { type: 'paragraph' })
      .setTextSelection(after + 1)
      .run();
  }

  function deleteBlock() {
    if (blockPosRef.current == null || !editor) return;
    const node = editor.state.doc.nodeAt(blockPosRef.current);
    if (!node) return;
    const from = blockPosRef.current;
    const to = from + node.nodeSize;
    editor.chain().focus().setTextSelection({ from, to }).deleteSelection().run();
    setPos(null);
  }

  function duplicateBlock() {
    if (blockPosRef.current == null || !editor) return;
    const node = editor.state.doc.nodeAt(blockPosRef.current);
    if (!node) return;
    const after = blockPosRef.current + node.nodeSize;
    editor
      .chain()
      .focus()
      .insertContentAt(after, node.toJSON())
      .run();
  }

  function selectBlock() {
    if (blockPosRef.current == null || !editor) return;
    const node = editor.state.doc.nodeAt(blockPosRef.current);
    if (!node) return;
    const from = blockPosRef.current;
    const to = from + node.nodeSize;
    const sel = TextSelection.create(editor.state.doc, from + 1, Math.max(from + 1, to - 1));
    editor.view.dispatch(editor.state.tr.setSelection(sel));
    editor.view.focus();
  }

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
        background: 'var(--jz-surface)',
        border: '1px solid var(--jz-border)',
        borderRadius: 4,
        padding: 2,
        boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
      }}
      onMouseEnter={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="jz-bubble-btn"
        onClick={insertAfter}
        title="在下方插入段落"
        style={{ width: 22, height: 22 }}
      >
        <PlusOutlined />
      </button>
      <Dropdown
        menu={{
          items: [
            { key: 'select', label: '选中此块', onClick: selectBlock },
            { key: 'dup', label: '复制此块', onClick: duplicateBlock },
            { type: 'divider' as const },
            { key: 'del', label: '删除此块', danger: true, onClick: deleteBlock },
          ],
        }}
      >
        <button type="button" className="jz-bubble-btn" title="更多" style={{ width: 22, height: 22 }}>
          <MoreOutlined />
        </button>
      </Dropdown>
    </div>
  );
}
