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

/** Insertion anchors held across the upload await. Plugin ``apply`` maps each
 *  anchor through every transaction, so text typed while the upload is in
 *  flight can no longer shift the image into the wrong position. Objects are
 *  mutated in place — the async uploader holds the same reference. */
interface TrackedInsertPos {
  pos: number;
}
interface ImageUploadPluginState {
  tracked: TrackedInsertPos[];
}

const imageUploadKey = new PluginKey<ImageUploadPluginState>('image-upload');

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
      // 跨 await 的插入点必须经 transaction mapping 跟踪：上传期间用户继续
      // 输入会移动文档位置，裸数字 pos 会把图片插错地方。anchor 注册进插件
      // state，此后每个事务在 apply() 里重映射（含我们自己的插入事务 ——
      // assoc 前偏使 anchor 自动越过刚插入的图片，正好是下一张的位置）。
      const anchor: TrackedInsertPos = { pos: initialPos ?? view.state.selection.from };
      imageUploadKey.getState(view.state)?.tracked.push(anchor);
      try {
        for (const file of files) {
          beginUpload();
          try {
            const att = await uploadFile(file, opts.documentId);
            if (view.isDestroyed) return;
            const { schema } = view.state;
            const imageNode = schema.nodes.image?.create({
              src: att.url,
              alt: att.original_filename || file.name,
            });
            if (!imageNode) continue;
            const insertAt = Math.min(anchor.pos, view.state.doc.content.size);
            view.dispatch(view.state.tr.insert(insertAt, imageNode));
          } catch (err: unknown) {
            opts.onError?.(err instanceof Error ? err.message : '图片上传失败');
          } finally {
            endUpload();
          }
        }
      } finally {
        if (!view.isDestroyed) {
          const st = imageUploadKey.getState(view.state);
          if (st) st.tracked = st.tracked.filter((t) => t !== anchor);
        }
      }
    }

    return [
      new Plugin({
        key: imageUploadKey,
        state: {
          init: (): ImageUploadPluginState => ({ tracked: [] }),
          apply(tr, value: ImageUploadPluginState): ImageUploadPluginState {
            if (tr.docChanged) {
              for (const t of value.tracked) t.pos = tr.mapping.map(t.pos);
            }
            return value;
          },
        },
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
