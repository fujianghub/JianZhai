/**
 * 编辑器自动保存五态（2026-09-02 从 RichTextEditor / MarkdownEditor / HtmlEditor
 * 三份逐字相同的本地声明抽出）。文案与语义色单一来源；渲染见 SaveStatusPill。
 */
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export type SaveStatusTone = 'muted' | 'amber' | 'blue' | 'green' | 'red';

export const SAVE_STATUS_META: Record<SaveStatus, { text: string; tone: SaveStatusTone }> = {
  idle: { text: '已同步', tone: 'muted' },
  pending: { text: '待保存…', tone: 'amber' },
  saving: { text: '保存中…', tone: 'blue' },
  saved: { text: '已保存', tone: 'green' },
  error: { text: '保存失败', tone: 'red' },
};
