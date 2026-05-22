/**
 * 外部 URL 链接卡片节点 — 类似语雀的「网页卡片」。
 *
 * 用法：
 *   - 斜杠命令 `/链接卡片` 弹输入框
 *   - 或粘贴 URL 时若识别为可预览的外部链接，提示「转为卡片」
 *
 * Markdown 形式：`[[link-card:URL]]` 占位符，渲染端展开为卡片。
 */
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { LinkOutlined } from '@ant-design/icons';
import { getLinkPreview, type LinkPreview } from '@/api/linkPreview';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    linkCard: {
      insertLinkCard: (url: string) => ReturnType;
    };
  }
}

export const LinkCardEmbed = Node.create({
  name: 'linkCard',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      url: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-url') || '',
        renderHTML: (attrs) => ({ 'data-url': String(attrs.url || '') }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-jz-link-card]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-jz-link-card': '', class: 'jz-link-card' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(LinkCardView);
  },

  addCommands() {
    return {
      insertLinkCard:
        (url: string) =>
        ({ chain }) =>
          chain().focus().insertContent({ type: this.name, attrs: { url } }).run(),
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write: (s: string) => void; closeBlock: (n: unknown) => void },
          node: { attrs: { url?: string } }
        ) {
          state.write(`[[link-card:${node.attrs.url || ''}]]`);
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});

function LinkCardView({ node, editor }: NodeViewProps) {
  const url = node.attrs.url as string;
  const [data, setData] = useState<LinkPreview | null>(null);
  const [err, setErr] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setLoading(true);
    setErr('');
    getLinkPreview(url)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : '抓取失败');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [url]);

  function open(e: React.MouseEvent) {
    if (editor.isEditable) {
      // 编辑模式下点击不打开，避免误触
      e.preventDefault();
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <NodeViewWrapper>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="jz-link-card-shell"
        onClick={open}
      >
        <div className="jz-link-card-text">
          <div className="jz-link-card-site">
            {data?.favicon && (
              <img
                src={data.favicon}
                alt=""
                className="jz-link-card-favicon"
                onError={(e) => ((e.currentTarget.style.display = 'none'))}
              />
            )}
            <span className="jz-link-card-site-name">{data?.site_name || new URL(url).hostname}</span>
          </div>
          <div className="jz-link-card-title">
            {loading ? '加载中…' : err ? '抓取失败' : data?.title || url}
          </div>
          {data?.description && (
            <div className="jz-link-card-desc">{data.description}</div>
          )}
          <div className="jz-link-card-url">
            <LinkOutlined style={{ marginRight: 4 }} />
            {url}
          </div>
        </div>
        {data?.image && (
          <div className="jz-link-card-image-wrap">
            <img
              src={data.image}
              alt=""
              className="jz-link-card-image"
              onError={(e) => ((e.currentTarget.parentElement!.style.display = 'none'))}
            />
          </div>
        )}
      </a>
    </NodeViewWrapper>
  );
}
