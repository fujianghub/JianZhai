declare module 'tiptap-markdown' {
  import type { Extension } from '@tiptap/core';

  export interface MarkdownOptions {
    html?: boolean;
    tightLists?: boolean;
    bulletListMarker?: string;
    linkify?: boolean;
    breaks?: boolean;
    transformPastedText?: boolean;
    transformCopiedText?: boolean;
  }

  export const Markdown: Extension<MarkdownOptions>;
}

declare module 'tiptap-extension-global-drag-handle' {
  import type { Extension } from '@tiptap/core';
  const GlobalDragHandle: Extension;
  export default GlobalDragHandle;
}

import '@tiptap/core';
declare module '@tiptap/core' {
  interface Storage {
    markdown?: {
      getMarkdown: () => string;
      parser?: {
        parse: (md: string) => import('@tiptap/pm/model').Node;
      };
    };
  }
}
