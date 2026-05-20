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

    function uploadAndInsert(view: import('@tiptap/pm/view').EditorView, file: File, pos: number | null) {
      opts.onUploading?.(true);
      uploadFile(file, opts.documentId)
        .then((att) => {
          const { schema, tr } = view.state;
          const imageNode = schema.nodes.image?.create({
            src: att.url,
            alt: att.original_filename || file.name,
          });
          if (!imageNode) return;
          const insertAt = pos ?? view.state.selection.from;
          view.dispatch(tr.insert(insertAt, imageNode));
        })
        .catch((err: unknown) => {
          opts.onError?.(err instanceof Error ? err.message : '图片上传失败');
        })
        .finally(() => {
          opts.onUploading?.(false);
        });
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
            for (const file of images) uploadAndInsert(view, file, null);
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
            for (const file of files) uploadAndInsert(view, file, insertAt);
            return true;
          },
        },
      }),
    ];
  },
});
