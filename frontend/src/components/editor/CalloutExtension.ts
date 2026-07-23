import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import mdContainer from 'markdown-it-container';
import CalloutView from './CalloutView';

/**
 * Block-level node representing a ``:::${slug}`` callout. Round-trips through
 * Markdown via:
 *
 *   - **parse**: ``markdown-it-container`` registered on tiptap-markdown's
 *     own markdown-it instance; each ``:::name`` opens our node with the
 *     ``kind`` attribute set to the slug.
 *   - **serialize**: writes ``:::${kind}\n${body}\n:::\n``.
 *
 * The visual is rendered by ``CalloutView`` (React) so the editor preview
 * matches the published blog post 1-to-1.
 */
export type CalloutKind =
  | 'tips' | 'info' | 'note' | 'warning' | 'danger' | 'success'
  | 'color1' | 'color2' | 'color3' | 'color4' | 'color5'
  | string;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      /** Wrap the current selection in a callout (default ``tips``). */
      setCallout: (attributes?: { kind?: CalloutKind }) => ReturnType;
      /** Remove the surrounding callout, keeping the inner content. */
      unsetCallout: () => ReturnType;
    };
  }
}

interface ContainerToken { nesting: number; info: string; attrs: Array<[string, string]> | null; attrSet: (k: string, v: string) => void; }

/** Escape a value for safe embedding in a double-quoted HTML attribute. */
function escAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Parse a ``:::`` container info string into kind + optional explicit title.
 *  Mirrors the reader-side rule（utils/markdown.ts callout container）：kind
 *  归一化为小写 a-z0-9_-，其后的文字是显式标题。Exported for tests. */
export function parseCalloutInfo(info: string): { kind: string; title: string } {
  const m = info.trim().match(/^(\S+)(?:\s+(.*))?$/);
  const kind = (m?.[1] ?? 'tips').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'tips';
  const title = (m?.[2] ?? '').trim();
  return { kind, title };
}

/** Build the ``:::kind Title`` opener line for serialization. 标题压成单行，
 *  否则换行会截断 container 的 info 串。Exported for tests. */
export function calloutOpener(kind?: string, title?: string): string {
  const k = (kind || 'tips').replace(/[^a-zA-Z0-9_-]/g, '');
  const t = String(title ?? '').replace(/\s+/g, ' ').trim();
  return t ? `:::${k} ${t}` : `:::${k}`;
}

export const CalloutExtension = Node.create({
  name: 'callout',
  group: 'block',
  // Accept any block-level content so the user can nest paragraphs, lists,
  // tables, even other callouts inside.
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      kind: {
        default: 'tips',
        parseHTML: (el: HTMLElement) =>
          el.getAttribute('data-kind') ||
          (el.className.match(/jz-callout-([\w-]+)/) || [])[1] ||
          'tips',
        renderHTML: (attrs: { kind: string }) => ({ 'data-kind': attrs.kind }),
      },
      /** 显式标题（``:::info 自定义标题``）。阅读端渲染为 .jz-callout-title；
       *  编辑器若不携带此属性，重载保存会静默丢标题。 */
      title: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-title') ?? '',
        renderHTML: (attrs: { title?: string }) =>
          attrs.title ? { 'data-title': attrs.title } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div.jz-callout' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const kind = (node.attrs.kind as string) || 'tips';
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        class: `jz-callout jz-callout-${kind}`,
        'data-kind': kind,
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },

  addCommands() {
    return {
      setCallout:
        (attrs) =>
        ({ commands }) =>
          commands.wrapIn(this.name, { kind: attrs?.kind ?? 'tips' }),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },

  addStorage() {
    return {
      markdown: {
        /** Emit ``:::${kind}\n${body}\n:::`` when round-tripping back to MD. */
        serialize(
          state: {
            write: (s: string) => void;
            ensureNewLine: () => void;
            closeBlock: (n: unknown) => void;
            renderContent: (n: unknown) => void;
          },
          node: { attrs: { kind?: string; title?: string } }
        ) {
          state.write(`${calloutOpener(node.attrs.kind, node.attrs.title)}\n`);
          state.renderContent(node);
          state.ensureNewLine();
          state.write(':::');
          state.closeBlock(node);
        },
        /** Register a catch-all ``markdown-it-container`` rule on tiptap-markdown's
         *  md instance so any ``:::name`` becomes our HTML, which tiptap then
         *  parses back into a Callout node via ``parseHTML``. */
        parse: {
          setup(md: { use: (...args: unknown[]) => unknown }) {
            md.use(mdContainer, 'callout', {
              validate(params: string) {
                const t = params.trim();
                // Structural layout containers are converted to HTML during
                // ``preprocessMarkdown`` (convertLayoutBlocks) and must never
                // be swallowed by this catch-all — a hijacked ``:::details``
                // loses its summary, ``:::cols-N`` collapses its columns and
                // ``:::tabs`` flattens its labels.
                if (/^(details|tabs|cols-\d+)\b/.test(t)) return false;
                // 与阅读端 validate 对齐（任意非空 slug），避免同一文本两端分叉
                return /^[^\s]+(\s+.*)?$/.test(t);
              },
              render(tokens: ContainerToken[], idx: number) {
                const t = tokens[idx];
                if (t.nesting === 1) {
                  const { kind, title } = parseCalloutInfo(t.info);
                  const titleAttr = title ? ` data-title="${escAttr(title)}"` : '';
                  return `<div class="jz-callout jz-callout-${kind}" data-kind="${kind}"${titleAttr}>\n`;
                }
                return `</div>\n`;
              },
            });
          },
        },
      },
    };
  },
});

export default CalloutExtension;
