/**
 * Shared autosave / unmount-flush helpers for Markdown, HTML, and Rich editors.
 */

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface FlushOnUnmountOptions {
  getLiveContent: () => string;
  lastSaved: string;
  lastEmitted?: string;
  onChange: (next: string) => void;
  onAutoSave?: (next: string) => Promise<void> | void;
  saveSeqRef: { current: number };
  lastSavedRef: { current: string };
  lastEmittedRef?: { current: string };
}

/**
 * On editor unmount: emit pending local content to parent and fire-and-forget
 * autosave when it differs from the last successfully saved snapshot.
 */
export function flushOnUnmount(opts: FlushOnUnmountOptions): void {
  const live = opts.getLiveContent();
  const lastEmitted = opts.lastEmittedRef?.current ?? opts.lastEmitted ?? live;

  if (live !== lastEmitted) {
    if (opts.lastEmittedRef) opts.lastEmittedRef.current = live;
    opts.onChange(live);
  }

  const autoSave = opts.onAutoSave;
  if (!autoSave || live === opts.lastSavedRef.current) return;

  const mySeq = ++opts.saveSeqRef.current;
  void Promise.resolve(autoSave(live))
    .catch(() => {
      /* unmount — swallow */
    })
    .finally(() => {
      if (mySeq === opts.saveSeqRef.current) {
        opts.lastSavedRef.current = live;
      }
    });
}

/** Editor API registered with DocEditorPage for flush-before-publish. */
export interface EditorSaveHandle {
  saveNow: () => Promise<void>;
}
