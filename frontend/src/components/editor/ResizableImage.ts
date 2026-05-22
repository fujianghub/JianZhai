import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import ImageNodeView from './ImageNodeView';

// 给 ImageOptions 加一个 documentId 字段，让 ``Image.extend`` 接受我们的扩展配置。
declare module '@tiptap/extension-image' {
  interface ImageOptions {
    documentId?: number;
  }
}

/**
 * Extension wrapping `@tiptap/extension-image`:
 *   - Adds ``width`` / ``height`` attributes so the resize NodeView can store a
 *     concrete size on each image.
 *   - Overrides ``renderHTML`` to emit those as HTML width/height attributes
 *     (so the ``<img>`` tag round-trips through HTML serialization, and
 *     tiptap-markdown's html=true output preserves them).
 *   - Overrides markdown serialization: when a size is set, emit raw HTML
 *     ``<img src="..." width="200" />`` so saving + reloading keeps the size.
 *     Plain images (no width) stay as ``![alt](src)`` Markdown.
 *   - Custom NodeView renders the image with a bottom-right resize handle.
 */
export const ResizableImage = Image.extend({
  // Expose ``documentId`` so the NodeView (which doesn't have access to the
  // parent React component) can attach freshly-cropped image uploads to the
  // right Document via the ``uploadFile(file, documentId)`` API.
  // Cast: TS can't infer the parent's ImageOptions return through the spread;
  // the module-augmentation above adds ``documentId`` to ImageOptions, so the
  // cast is safe and avoids re-listing every required field.
  addOptions() {
    const parent = this.parent?.();
    return {
      ...(parent as ReturnType<NonNullable<typeof this.parent>>),
      documentId: undefined as number | undefined,
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute('width');
          return w ? Number(w) : null;
        },
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
      },
      height: {
        default: null,
        parseHTML: (el) => {
          const h = el.getAttribute('height');
          return h ? Number(h) : null;
        },
        renderHTML: (attrs) => (attrs.height ? { height: attrs.height } : {}),
      },
      caption: {
        default: '',
        parseHTML: (el) => {
          const fig = el.closest('figure');
          return fig?.querySelector('figcaption')?.textContent ?? (el.getAttribute('data-caption') ?? '');
        },
        renderHTML: (attrs) => (attrs.caption ? { 'data-caption': attrs.caption } : {}),
      },
      rotation: {
        default: 0,
        parseHTML: (el) => {
          const raw = (el as HTMLElement).getAttribute('data-rotation');
          if (raw) {
            const n = parseInt(raw, 10);
            return Number.isNaN(n) ? 0 : ((n % 360) + 360) % 360;
          }
          return 0;
        },
        renderHTML: (attrs) => {
          const rot = ((Number(attrs.rotation) || 0) % 360 + 360) % 360;
          return rot ? { 'data-rotation': String(rot), style: `transform: rotate(${rot}deg);` } : {};
        },
      },
      /** 预设样式名（如 'rounded' / 'circle' / 'bordered' / 'shadow' / 'shadow-bordered' / 'reflection' / ''） */
      imageStyle: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-image-style') || '',
        renderHTML: (attrs) => {
          const s = (attrs.imageStyle as string) || '';
          if (!s) return {};
          return { 'data-image-style': s, class: `jz-image-style-${s}` };
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },

  // tiptap-markdown picks this up via the extension's storage. When width is
  // set we emit raw HTML so the size survives a Markdown round-trip; otherwise
  // fall through to the default ``![alt](src)`` form.
  addStorage() {
    return {
      ...(this.parent?.() ?? {}),
      markdown: {
        serialize(state: MdState, node: MdNode) {
          const { src, alt, title, width, height, caption, rotation, imageStyle } = node.attrs;
          const rot = ((Number(rotation) || 0) % 360 + 360) % 360;
          const sty = (imageStyle || '').trim();
          if (width || height || caption || rot || sty) {
            const esc = (v: unknown) =>
              String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
            let html = `<figure>`;
            html += `<img src="${esc(src)}"`;
            if (alt) html += ` alt="${esc(alt)}"`;
            if (title) html += ` title="${esc(title)}"`;
            if (width) html += ` width="${width}"`;
            if (height) html += ` height="${height}"`;
            if (caption) html += ` data-caption="${esc(caption)}"`;
            if (sty) html += ` data-image-style="${esc(sty)}" class="jz-image-style-${esc(sty)}"`;
            if (rot) html += ` data-rotation="${rot}" style="transform: rotate(${rot}deg);"`;
            html += ' />';
            if (caption) html += `<figcaption>${esc(caption)}</figcaption>`;
            html += `</figure>`;
            state.write(html);
            state.closeBlock(node);
          } else {
            const safeAlt = (alt ?? '').replace(/[\[\]]/g, '');
            const titlePart = title ? ` "${String(title).replace(/"/g, '\\"')}"` : '';
            state.write(`![${safeAlt}](${src}${titlePart})`);
            state.closeBlock(node);
          }
        },
        parse: {
          // markdown-it already parses both ![]() and inline <img>; nothing to
          // wire up.
        },
      },
    };
  },
});

// ── narrow types for the tiptap-markdown serializer signature ───────────────
interface MdState {
  write(text: string): void;
  closeBlock(node: MdNode): void;
}
interface MdNode {
  attrs: {
    src: string;
    alt?: string | null;
    title?: string | null;
    width?: number | null;
    height?: number | null;
    caption?: string | null;
    rotation?: number | null;
    imageStyle?: string | null;
  };
}
