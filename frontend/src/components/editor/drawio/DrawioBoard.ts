import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import DrawioBoardView from './DrawioBoardView';
import { DRAWIO_BOARD_NAME, buildDrawioFigureHtml, readDrawioFigure } from '@/utils/drawioEmbed';

export interface DrawioBoardOptions {
  /** 当前文档 id：画板导出的 SVG/PNG 作为该文档附件上传。 */
  documentId?: number;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    drawioBoard: {
      /** 插入一个空画板，节点视图挂载即打开编辑器（先选起手模板；取消且未保存则自删）。 */
      insertDrawioBoard: () => ReturnType;
    };
  }
}

/**
 * drawio画板 块节点。
 *
 * Markdown 里是一行 `<figure class="jz-drawio" data-jz-drawio [data-png]
 * [data-jz-scheme] [data-jz-size] [data-jz-align]><img src=svg>[<figcaption>]`
 * （格式与安全约束见 `utils/drawioEmbed.ts`），`parseHTML` 以高于图片节点的优先级
 * 认领该 figure，整个 figure 作为原子节点。`src` 为空的节点只存在于「刚插入、
 * 还没保存」的瞬间，序列化时丢弃。`autoOpen` / `mermaid` 是运行期属性，不落盘。
 */
export const DrawioBoard = Node.create<DrawioBoardOptions>({
  name: 'drawioBoard',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { documentId: undefined };
  },

  addAttributes() {
    return {
      src: { default: '' },
      png: { default: '' },
      scheme: { default: 'auto' },
      size: { default: 'auto' },
      align: { default: 'center' },
      caption: { default: '' },
      autoOpen: { default: false, rendered: false, parseHTML: () => false },
      mermaid: { default: '', rendered: false, parseHTML: () => '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-jz-drawio]',
        priority: 100,
        getAttrs: (el) => {
          const attrs = readDrawioFigure(el as HTMLElement);
          return attrs && attrs.src ? attrs : false;
        },
      },
    ];
  },

  renderHTML({ node }) {
    const { src, png, scheme, size, align, caption } = node.attrs as Record<string, string>;
    const attrs: Record<string, string> = { class: 'jz-drawio', 'data-jz-drawio': '1' };
    if (png) attrs['data-png'] = png;
    if (scheme === 'light') attrs['data-jz-scheme'] = 'light';
    if (size === 's' || size === 'full') attrs['data-jz-size'] = size;
    if (align === 'left' || align === 'right') attrs['data-jz-align'] = align;
    const img = ['img', { src, alt: DRAWIO_BOARD_NAME }];
    return caption
      ? ['figure', mergeAttributes(attrs), img, ['figcaption', {}, caption]]
      : ['figure', mergeAttributes(attrs), img];
  },

  addCommands() {
    return {
      insertDrawioBoard:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { autoOpen: true } }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(DrawioBoardView);
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write: (s: string) => void; closeBlock: (n: unknown) => void },
          node: { attrs: Record<string, string> },
        ) {
          const a = node.attrs;
          if (!a.src) return; // 未保存的空画板不落盘
          state.write(
            buildDrawioFigureHtml({
              src: a.src,
              png: a.png ?? '',
              scheme: a.scheme === 'light' ? 'light' : 'auto',
              size: a.size === 's' || a.size === 'full' ? a.size : 'auto',
              align: a.align === 'left' || a.align === 'right' ? a.align : 'center',
              caption: a.caption ?? '',
            }),
          );
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});
