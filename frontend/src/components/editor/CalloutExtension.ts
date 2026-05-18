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
          node: { attrs: { kind?: string } }
        ) {
          const kind = (node.attrs.kind || 'tips').replace(/[^a-zA-Z0-9_-]/g, '');
          state.write(`:::${kind}\n`);
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
                return /^([a-zA-Z][\w-]*)(\s+.*)?$/.test(params.trim());
              },
              render(tokens: ContainerToken[], idx: number) {
                const t = tokens[idx];
                if (t.nesting === 1) {
                  const match = t.info.trim().match(/^([a-zA-Z][\w-]*)/);
                  const kind = (match?.[1] ?? 'tips').toLowerCase();
                  return `<div class="jz-callout jz-callout-${kind}" data-kind="${kind}">\n`;
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
