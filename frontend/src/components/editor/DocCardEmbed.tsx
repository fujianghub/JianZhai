import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin, Tag } from 'antd';
import dayjs from 'dayjs';
import { getDocumentPreview, type DocumentPreview } from '@/api/docs';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    docCardEmbed: {
      insertDocCard: (docId: number) => ReturnType;
    };
  }
}

/**
 * Inline document card — a richer alternative to plain `@mention` links.
 * Renders a small card showing title, KB, excerpt, last updated.
 *
 * Markdown form: `[[doc-card:ID]]` on its own line.
 */
export const DocCardEmbed = Node.create({
  name: 'docCardEmbed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      docId: {
        default: 0,
        parseHTML: (el) => Number((el as HTMLElement).getAttribute('data-doc-id') || 0),
        renderHTML: (attrs) => ({ 'data-doc-id': String(attrs.docId) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-jz-doc-card]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-jz-doc-card': '', class: 'jz-doc-card' }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DocCardView);
  },

  addCommands() {
    return {
      insertDocCard:
        (docId: number) =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({ type: this.name, attrs: { docId } })
            .run(),
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write: (s: string) => void; closeBlock: (n: unknown) => void },
          node: { attrs: { docId?: number } }
        ) {
          state.write(`[[doc-card:${node.attrs.docId || 0}]]`);
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});

function DocCardView({ node, editor, getPos }: NodeViewProps) {
  const docId = node.attrs.docId as number;
  const navigate = useNavigate();
  const [data, setData] = useState<DocumentPreview | null>(null);
  const [err, setErr] = useState<string>('');

  /** 卡片 → 行内标题链接（语雀式回转），保持 doc:ID 内链被双向链接识别。 */
  function convertToInline() {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    const text = data?.title || `文档 #${docId}`;
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: pos, to: pos + node.nodeSize },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text, marks: [{ type: 'link', attrs: { href: `doc:${docId}` } }] },
          ],
        }
      )
      .run();
  }

  useEffect(() => {
    if (!docId) return;
    let cancelled = false;
    getDocumentPreview(docId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : '加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, [docId]);

  return (
    <NodeViewWrapper className="jz-card-embed-wrap">
      {editor.isEditable && docId > 0 && (
        <div className="jz-card-mode-menu" contentEditable={false}>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              convertToInline();
            }}
            title="转为行内链接（标题文字）"
          >
            标题
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigate(`/d/${docId}`);
            }}
            title="站内打开该文档"
          >
            打开文档
          </button>
        </div>
      )}
      <div className="jz-doc-card-shell">
        {!docId && (
          <div className="jz-doc-card-empty">未选择文档</div>
        )}
        {docId > 0 && !data && !err && (
          <div className="jz-doc-card-loading"><Spin size="small" /> 加载中…</div>
        )}
        {err && <div className="jz-doc-card-error">预览失败：{err}</div>}
        {data && (
          <a
            href={`doc:${data.id}`}
            className="jz-doc-card-link"
            onClick={(e) => e.preventDefault()}
          >
            <div className="jz-doc-card-meta">
              <Tag color={data.knowledge_base.accent_color || 'blue'} style={{ marginRight: 0, fontSize: 11 }}>
                {data.knowledge_base.name}
              </Tag>
              <span className="jz-doc-card-time">
                {dayjs(data.updated_at).format('YYYY-MM-DD')}
              </span>
            </div>
            <div className="jz-doc-card-title">{data.title}</div>
            <div className="jz-doc-card-excerpt">{data.excerpt || '（暂无摘要）'}</div>
          </a>
        )}
      </div>
    </NodeViewWrapper>
  );
}
