import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { uploadFile } from '@/api/attachments';

export interface ImageUploadOptions {
  /** Document the uploaded files should be attached to. ``undefined`` is
   *  allowed (orphan attachment) but in practice we always pass the current
   *  doc id from the editor host. */
  documentId?: number;
  /** Surface upload errors back to the host so it can toast / log. */
  onError?: (msg: string) => void;
  /** Optional progress UI hook; called with ``true`` while a paste/drop is
   *  in flight and ``false`` once all uploads settle. */
  onUploading?: (flag: boolean) => void;
}

/**
 * ProseMirror plugin: intercept clipboard paste + drag-drop events that carry
 * image data, push them through the existing attachment-upload API, and insert
 * the resulting URL as an Image node at the cursor / drop position.
 *
 * Multiple images per event are supported; uploads run in parallel and each
 * one inserts itself when its promise resolves.
 */
export const ImageUpload = Extension.create<ImageUploadOptions>({
  name: 'imageUpload',

  addOptions() {
    return {};
  },

  addProseMirrorPlugins() {
    const opts = this.options;
    // Reference-count concurrent uploads so onUploading(false) fires only
    // when ALL in-flight uploads have settled. Without this, when 3 images
    // are pasted at once, the first onFinally(false) silently clears the
    // indicator while two uploads are still running.
    let inFlight = 0;
    const beginUpload = () => {
      inFlight += 1;
      if (inFlight === 1) opts.onUploading?.(true);
    };
    const endUpload = () => {
      inFlight = Math.max(0, inFlight - 1);
      if (inFlight === 0) opts.onUploading?.(false);
    };

    async function uploadSequential(
      view: import('@tiptap/pm/view').EditorView,
      files: File[],
      initialPos: number | null,
    ) {
      let pos = initialPos ?? view.state.selection.from;
      for (const file of files) {
        beginUpload();
        try {
          const att = await uploadFile(file, opts.documentId);
          const { schema } = view.state;
          const imageNode = schema.nodes.image?.create({
            src: att.url,
            alt: att.original_filename || file.name,
          });
          if (!imageNode) continue;
          const tr = view.state.tr.insert(pos, imageNode);
          view.dispatch(tr);
          pos += imageNode.nodeSize;
        } catch (err: unknown) {
          opts.onError?.(err instanceof Error ? err.message : '图片上传失败');
        } finally {
          endUpload();
        }
      }
    }

    return [
      new Plugin({
        key: new PluginKey('image-upload'),
        props: {
          handlePaste(view, event) {
            const items = Array.from(event.clipboardData?.items ?? []);
            const images = items
              .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
              .map((i) => i.getAsFile())
              .filter((f): f is File => !!f);
            if (images.length === 0) return false;
            event.preventDefault();
            void uploadSequential(view, images, null);
            return true;
          },
          handleDrop(view, event) {
            const dt = (event as DragEvent).dataTransfer;
            const files = Array.from(dt?.files ?? []).filter((f) =>
              f.type.startsWith('image/'),
            );
            if (files.length === 0) return false;
            event.preventDefault();
            const coords = view.posAtCoords({
              left: (event as DragEvent).clientX,
              top: (event as DragEvent).clientY,
            });
            const insertAt = coords?.pos ?? view.state.selection.from;
            void uploadSequential(view, files, insertAt);
            return true;
          },
        },
      }),
    ];
  },
});
