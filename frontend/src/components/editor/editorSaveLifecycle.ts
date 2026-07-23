/**
 * Shared autosave / unmount-flush helpers for Markdown, HTML, and Rich editors.
 */
import { message } from '@/utils/notify';
import { saveDraftBackup } from '@/utils/localDraftBackup';

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
  /** 卸载 flush 是 fire-and-forget —— 请求失败时把内容备份到该 localStorage
   *  键并提示，否则未保存内容随组件销毁静默丢失。 */
  backupKey?: string;
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
      // 组件已销毁，无法重试 —— 至少把内容留在本机并让用户知道。
      if (opts.backupKey) {
        saveDraftBackup(opts.backupKey, live);
        message.warning('离开前自动保存失败，未保存内容已在本机备份');
      }
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
