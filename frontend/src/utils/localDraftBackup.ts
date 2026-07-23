/**
 * 保存链路的本地兜底备份。
 *
 * 两个写入时机：
 *  1. 409 版本冲突 —— 服务器版本覆盖屏幕之前，把用户尝试保存的内容备份；
 *  2. 编辑器卸载 flush 失败 —— fire-and-forget 请求挂了，内容否则静默丢失。
 *
 * 每个 (文档, 场景) 只保留最近一份，带时间戳。恢复入口目前是冲突对话框的
 * 「恢复我的编辑」；localStorage 里的份数是最后防线（崩溃/误关后可人工找回）。
 */

export interface DraftBackup {
  at: number;
  content: string;
}

export function draftBackupKey(docId: number | string, scene: string): string {
  return `jz-draft-backup:${docId}:${scene}`;
}

export function saveDraftBackup(key: string, content: string): void {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), content }));
  } catch {
    /* localStorage 不可用 / 超配额 —— 兜底失败不打断主流程 */
  }
}

export function loadDraftBackup(key: string): DraftBackup | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftBackup;
    if (typeof parsed?.content !== 'string' || typeof parsed?.at !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraftBackup(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}
