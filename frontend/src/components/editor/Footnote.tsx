/**
 * 脚注 Footnote — 行内上标编号 + hover tooltip + 文末汇总。
 *
 * 数据：脚注内容直接存在节点 attr 上（不需要单独的 Footnote 列表节点，
 *      博客阅读端 markdown-it 会扫描所有 `[^id]: text` 然后汇总到文末）。
 *
 * Markdown：
 *   - 行内：`[^1]`（id 任意短字符串）
 *   - 定义：`[^1]: 这是脚注内容`（放文档底部，由 markdown-it 处理）
 *
 * 编辑器内部，为了避免「行内引用 + 文末定义」两处同步的麻烦，
 * 我们用一个 Inline atom Node 把「编号 + 内容」一起存在 attr 上，
 * 序列化时写入 `[^id]` 上标，并在 doc 末尾追加 `[^id]: content`。
 */
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { Input, Modal, Tooltip } from 'antd';
import { useState } from 'react';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: {
      insertFootnote: (text: string) => ReturnType;
    };
  }
}

export const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      text: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-footnote') || '',
        renderHTML: (attrs) => {
          const t = (attrs.text as string) || '';
          return t ? { 'data-footnote': t, title: t } : {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'sup[data-jz-footnote]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'sup',
      mergeAttributes(HTMLAttributes, {
        'data-jz-footnote': '',
        class: 'jz-footnote-ref',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FootnoteView);
  },

  addCommands() {
    return {
      insertFootnote:
        (text: string) =>
        ({ chain }) =>
          chain().focus().insertContent({ type: this.name, attrs: { text } }).run(),
    };
  },

  /**
   * Markdown 序列化：每个脚注变成 `[^N]` 上标，并把内容收集到 storage.footnotes，
   * 让外层在 doc 序列化结束后追加 `[^N]: ...` 定义块。
   *
   * 为了简化，这里直接把 footnote 内容跟在 ref 后用 inline HTML 注释暂存；
   * 实际项目可改为更标准的 footnote 收集 pass（需要改造 tiptap-markdown 全局
   * serializer）。这里先用简化方案：每个节点序列化为 `^[内容]` Yuque 风格。
   */
  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write: (s: string) => void },
          node: { attrs: { text?: string } }
        ) {
          // ^[...] 是 markdown-it-footnote 的 inline 形式（不需要单独定义块）
          const safe = (node.attrs.text || '').replace(/\]/g, '\\]');
          state.write(`^[${safe}]`);
        },
        parse: {},
      },
    };
  },
});

function FootnoteView({ node, updateAttributes, editor, deleteNode }: NodeViewProps) {
  const text = (node.attrs.text as string) || '';
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState(text);

  return (
    <NodeViewWrapper as="sup" style={{ display: 'inline' }}>
      <Tooltip title={text || '点击编辑脚注'}>
        <span
          className="jz-footnote-ref"
          onDoubleClick={() => {
            if (!editor.isEditable) return;
            setDraft(text);
            setModalOpen(true);
          }}
        >
          {text ? '注' : '注?'}
        </span>
      </Tooltip>
      {editor.isEditable && (
        <Modal
          open={modalOpen}
          title="编辑脚注"
          width={420}
          onCancel={() => setModalOpen(false)}
          onOk={() => {
            const t = draft.trim();
            if (!t) {
              deleteNode();
            } else {
              updateAttributes({ text: t });
            }
            setModalOpen(false);
          }}
          okText="保存"
          cancelText="取消"
        >
          <Input.TextArea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            placeholder="脚注内容…"
            autoFocus
          />
        </Modal>
      )}
    </NodeViewWrapper>
  );
}
