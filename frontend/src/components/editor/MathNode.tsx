import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Modal } from 'antd';
import katex from 'katex';
import 'katex/dist/katex.min.css';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mathBlock: {
      insertMathBlock: (latex?: string) => ReturnType;
      editMathBlock: () => ReturnType;
    };
    mathInline: {
      insertMathInline: (latex?: string) => ReturnType;
    };
  }
}

/**
 * Block-level LaTeX equation node. Renders via KaTeX; double-click opens a
 * modal with a textarea + live preview so users don't have to know LaTeX
 * by heart.
 *
 * Markdown form: `$$...$$` on its own block.
 */
export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-latex') || '',
        renderHTML: (attrs) => ({ 'data-latex': String(attrs.latex || '') }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-jz-math-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-jz-math-block': '', class: 'jz-math-block' }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView);
  },

  addCommands() {
    return {
      insertMathBlock:
        (latex = '') =>
        ({ chain }) =>
          chain().focus().insertContent({ type: this.name, attrs: { latex } }).run(),
      editMathBlock:
        () =>
        ({ editor }) => {
          // Trigger a custom DOM event that the active block listens to.
          window.dispatchEvent(new CustomEvent('jz-edit-math', { detail: { editor } }));
          return true;
        },
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write: (s: string) => void; closeBlock: (n: unknown) => void },
          node: { attrs: { latex?: string } }
        ) {
          state.write(`$$${node.attrs.latex || ''}$$`);
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-latex') || '',
        renderHTML: (attrs) => ({ 'data-latex': String(attrs.latex || '') }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-jz-math-inline]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-jz-math-inline': '', class: 'jz-math-inline' }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView);
  },

  addCommands() {
    return {
      insertMathInline:
        (latex = '') =>
        ({ chain }) =>
          chain().focus().insertContent({ type: this.name, attrs: { latex } }).run(),
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write: (s: string) => void },
          node: { attrs: { latex?: string } }
        ) {
          state.write(`$${node.attrs.latex || ''}$`);
        },
        parse: {},
      },
    };
  },
});

// ── shared NodeView pieces ─────────────────────────────────────────────────

function renderLatex(target: HTMLElement, latex: string, displayMode: boolean): string {
  try {
    katex.render(latex || ' ', target, { throwOnError: false, displayMode });
    return '';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

function MathEditorModal({
  open,
  initial,
  displayMode,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  initial: string;
  displayMode: boolean;
  onCancel: () => void;
  onSubmit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(initial);
  }, [open, initial]);

  useEffect(() => {
    if (!open || !previewRef.current) return;
    renderLatex(previewRef.current, draft, displayMode);
  }, [draft, open, displayMode]);

  return (
    <Modal
      open={open}
      title={displayMode ? '编辑公式（块级）' : '编辑公式（行内）'}
      onCancel={onCancel}
      width={560}
      destroyOnClose
      footer={[
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button key="ok" type="primary" onClick={() => onSubmit(draft)}>
          确定
        </Button>,
      ]}
    >
      <Input.TextArea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        autoSize={{ minRows: 4, maxRows: 12 }}
        placeholder="输入 LaTeX，如 \\frac{a}{b} 或 \\sum_{i=1}^{n} i"
      />
      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--jz-text-muted)' }}>实时预览：</div>
      <div
        ref={previewRef}
        style={{
          marginTop: 6,
          padding: '12px 16px',
          minHeight: 60,
          background: 'var(--jz-surface-2, #fafafa)',
          border: '1px solid var(--jz-border)',
          borderRadius: 4,
          textAlign: 'center',
        }}
      />
    </Modal>
  );
}

function MathBlockView({ node, updateAttributes, editor, deleteNode }: NodeViewProps) {
  const latex = (node.attrs.latex as string) || '';
  const [modalOpen, setModalOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ref.current) return;
    try {
      setError(renderLatex(ref.current, latex, true));
    } catch (e) {
      setError(e instanceof Error ? e.message : '渲染失败');
    }
  }, [latex]);

  return (
    <NodeViewWrapper>
      <div
        className="jz-math-block"
        onDoubleClick={() => editor.isEditable && setModalOpen(true)}
        style={{
          cursor: editor.isEditable ? 'pointer' : 'default',
          padding: '10px 8px',
          textAlign: 'center',
          background: 'var(--jz-surface-2, #fafafa)',
          border: '1px dashed var(--jz-border)',
          borderRadius: 4,
        }}
      >
        {!latex && (
          <span style={{ color: 'var(--jz-text-muted)' }}>双击插入公式…</span>
        )}
        <div ref={ref} />
        {error && <div style={{ color: '#cf1322', fontSize: 12 }}>{error}</div>}
      </div>
      <MathEditorModal
        open={modalOpen}
        initial={latex}
        displayMode
        onCancel={() => setModalOpen(false)}
        onSubmit={(next) => {
          if (!next.trim()) {
            deleteNode();
          } else {
            updateAttributes({ latex: next });
          }
          setModalOpen(false);
        }}
      />
    </NodeViewWrapper>
  );
}

function MathInlineView({ node, updateAttributes, editor, deleteNode }: NodeViewProps) {
  const latex = (node.attrs.latex as string) || '';
  const [modalOpen, setModalOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    renderLatex(ref.current, latex, false);
  }, [latex]);

  const content = useMemo(() => latex || 'fx', [latex]);

  return (
    <NodeViewWrapper as="span" style={{ display: 'inline-block' }}>
      <span
        ref={ref}
        className="jz-math-inline"
        onDoubleClick={() => editor.isEditable && setModalOpen(true)}
        style={{
          cursor: editor.isEditable ? 'pointer' : 'default',
          padding: '0 2px',
          background: latex ? 'transparent' : 'rgba(255,193,7,0.12)',
        }}
        data-latex={content}
      />
      <MathEditorModal
        open={modalOpen}
        initial={latex}
        displayMode={false}
        onCancel={() => setModalOpen(false)}
        onSubmit={(next) => {
          if (!next.trim()) {
            deleteNode();
          } else {
            updateAttributes({ latex: next });
          }
          setModalOpen(false);
        }}
      />
    </NodeViewWrapper>
  );
}
