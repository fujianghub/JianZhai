import { Node, mergeAttributes, nodeInputRule, nodePasteRule } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import MathEditorModal, { renderLatex } from './MathEditorModal';

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
        // Teach tiptap-markdown's internal markdown-it instance how to tokenize
        // ``$$…$$`` so pasting raw LaTeX (which the tiptap-markdown extension
        // routes through markdown parsing via ``transformPastedText: true``)
        // produces a MathBlock node instead of literal dollar-sign text.
        parse: {
          setup(mdInst: unknown) {
            const m = mdInst as {
              block: { ruler: { before: (a: string, n: string, fn: unknown) => void } };
              renderer: { rules: Record<string, (tokens: { content: string }[], i: number) => string> };
            };
            m.block.ruler.before('fence', 'math_block', (state: {
              bMarks: number[]; tShift: number[]; eMarks: number[]; src: string; line: number;
              push: (n: string, t: string, x: number) => { content: string; markup: string; block: boolean; map: [number, number] };
            }, startLine: number, endLine: number, silent: boolean) => {
              const start = state.bMarks[startLine] + state.tShift[startLine];
              const max = state.eMarks[startLine];
              if (start + 2 > max) return false;
              if (state.src.slice(start, start + 2) !== '$$') return false;
              const rest = state.src.slice(start + 2, max).trimEnd();
              let content: string;
              let lastLine = startLine;
              if (rest.endsWith('$$')) {
                content = rest.slice(0, -2);
              } else {
                const parts = [rest];
                let l = startLine + 1;
                let closed = false;
                while (l < endLine) {
                  const ls = state.bMarks[l] + state.tShift[l];
                  const lm = state.eMarks[l];
                  const lt = state.src.slice(ls, lm);
                  if (lt.trimEnd().endsWith('$$')) {
                    parts.push(lt.replace(/\$\$\s*$/, ''));
                    lastLine = l;
                    closed = true;
                    break;
                  }
                  parts.push(lt);
                  l++;
                }
                if (!closed) return false;
                content = parts.join('\n');
              }
              if (silent) return true;
              const tok = state.push('math_block', 'div', 0);
              tok.content = content.trim();
              tok.markup = '$$';
              tok.block = true;
              tok.map = [startLine, lastLine + 1];
              state.line = lastLine + 1;
              return true;
            });
            // Tiptap-markdown will use the rule above to identify the token,
            // then look up a node-type by ``token.tag``. We emit ``div`` and
            // map it via tiptap-markdown's node mapping (handled by our schema).
            m.renderer.rules.math_block = (tokens, idx) =>
              `<div data-jz-math-block data-latex="${(tokens[idx].content || '').replace(/"/g, '&quot;')}"></div>`;
          },
        },
      },
    };
  },

  /** ``$$…$$`` typed at the start of a paragraph → MathBlock. */
  addInputRules() {
    return [
      nodeInputRule({
        find: /\$\$([^$\n]+?)\$\$$/,
        type: this.type,
        getAttributes: (match) => ({ latex: match[1] }),
      }),
    ];
  },

  /** Pasting plaintext containing ``$$…$$`` → MathBlock(s). */
  addPasteRules() {
    return [
      nodePasteRule({
        find: /\$\$([\s\S]+?)\$\$/g,
        type: this.type,
        getAttributes: (match) => ({ latex: match[1].trim() }),
      }),
    ];
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
        parse: {
          setup(mdInst: unknown) {
            const m = mdInst as {
              inline: { ruler: { after: (a: string, n: string, fn: unknown) => void } };
              renderer: { rules: Record<string, (tokens: { content: string }[], i: number) => string> };
            };
            m.inline.ruler.after('escape', 'math_inline', (state: {
              src: string; pos: number; posMax: number;
              push: (n: string, t: string, x: number) => { content: string; markup: string };
            }, silent: boolean) => {
              const pos = state.pos;
              if (state.src[pos] !== '$') return false;
              if (state.src[pos + 1] === '$') return false;
              const prev = pos > 0 ? state.src[pos - 1] : '';
              if (prev && /\d/.test(prev)) return false;
              const afterOpen = state.src[pos + 1];
              if (!afterOpen || /\s/.test(afterOpen)) return false;
              let end = pos + 1;
              const max = state.posMax;
              while (end < max) {
                const ch = state.src[end];
                if (ch === '\\' && end + 1 < max) { end += 2; continue; }
                if (ch === '\n') return false;
                if (ch === '$') {
                  if (/\s/.test(state.src[end - 1])) { end++; continue; }
                  if (state.src[end + 1] === '$') return false;
                  if (silent) return true;
                  const tok = state.push('math_inline', 'span', 0);
                  tok.content = state.src.slice(pos + 1, end);
                  tok.markup = '$';
                  state.pos = end + 1;
                  return true;
                }
                end++;
              }
              return false;
            });
            m.renderer.rules.math_inline = (tokens, idx) =>
              `<span data-jz-math-inline data-latex="${(tokens[idx].content || '').replace(/"/g, '&quot;')}"></span>`;
          },
        },
      },
    };
  },

  /** Pasting plaintext containing ``$…$`` → inline MathInline node(s). */
  addPasteRules() {
    return [
      nodePasteRule({
        // Avoid eating $$…$$ here (block handler takes those) — the (?!\$)
        // lookahead skips dollar-doubles.
        find: /(?<![\d\\$])\$(?!\$)([^\s$][^$\n]*?[^\s$])\$(?![\d$])/g,
        type: this.type,
        getAttributes: (match) => ({ latex: match[1] }),
      }),
    ];
  },
});

// ── shared NodeView pieces ─────────────────────────────────────────────────

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
