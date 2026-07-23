import { isAxiosError } from 'axios';
import * as docsApi from '@/api/docs';
import { formatApiError } from '@/api/client';
import { message } from '@/utils/notify';
import { draftBackupKey, saveDraftBackup } from '@/utils/localDraftBackup';
import type { DocumentDetail } from '@/types';

export type VersionConflictField = 'raw' | 'published' | 'body' | 'title';

export interface VersionConflictInfo {
  /** 保存失败的那份本地内容 —— 冲突处理器可据此提供「恢复我的编辑」。 */
  attempted: string;
  field: VersionConflictField;
  /** attempted 已备份到 localStorage 的键（误关对话框后的最后防线）。 */
  backupKey: string;
}

/** 返回 true 表示处理器已展示自己的冲突 UI（对话框等），默认提示不再弹。 */
export type VersionConflictHandler = (
  live: DocumentDetail | undefined,
  info?: VersionConflictInfo,
) => boolean | void;

function handleVersionConflict(
  err: unknown,
  onConflict?: VersionConflictHandler,
  attempt?: { docId: number; field: VersionConflictField; attempted: string },
): boolean {
  if (
    isAxiosError(err) &&
    err.response?.status === 409 &&
    err.response.data?.code === 'version_conflict'
  ) {
    const live = err.response.data?.document as DocumentDetail | undefined;
    let info: VersionConflictInfo | undefined;
    if (attempt) {
      // 在服务器版本覆盖屏幕之前，先把用户的本地内容备份下来。
      const backupKey = draftBackupKey(attempt.docId, attempt.field);
      saveDraftBackup(backupKey, attempt.attempted);
      info = { attempted: attempt.attempted, field: attempt.field, backupKey };
    }
    const handled = onConflict?.(live, info);
    if (!handled) message.warning('文档已被其他端修改，已加载最新版本');
    throw new Error('version_conflict');
  }
  return false;
}

export async function patchDocumentRawContent(
  doc: DocumentDetail,
  rawContent: string,
  onConflict?: VersionConflictHandler,
): Promise<DocumentDetail> {
  try {
    return await docsApi.updateDocument(doc.id, {
      raw_content: rawContent,
      expected_version: doc.version,
    });
  } catch (err: unknown) {
    if (handleVersionConflict(err, onConflict, { docId: doc.id, field: 'raw', attempted: rawContent })) {
      /* thrown above */
    }
    message.error(formatApiError(err, '保存失败'));
    throw err;
  }
}

/**
 * Blog inline ("普通编辑") save: write the body to BOTH ``raw_content`` and
 * ``published_content`` in a single PATCH so the edit is immediately visible on
 * the blog (which renders published_content) AND stays in sync with the private
 * working copy — so a later full-editor 发布 won't clobber it with stale raw.
 * The server's ``_apply_update`` accepts both fields and bumps ``version`` once.
 */
export async function patchDocumentBody(
  doc: DocumentDetail,
  content: string,
  onConflict?: VersionConflictHandler,
): Promise<DocumentDetail> {
  try {
    return await docsApi.updateDocument(doc.id, {
      raw_content: content,
      published_content: content,
      expected_version: doc.version,
    });
  } catch (err: unknown) {
    if (handleVersionConflict(err, onConflict, { docId: doc.id, field: 'body', attempted: content })) {
      /* thrown above */
    }
    message.error(formatApiError(err, '保存失败'));
    throw err;
  }
}

export async function patchPublishedContent(
  doc: DocumentDetail,
  publishedContent: string,
  onConflict?: VersionConflictHandler,
): Promise<DocumentDetail> {
  try {
    return await docsApi.updatePublishedContent(doc.id, {
      published_content: publishedContent,
      expected_version: doc.version,
    });
  } catch (err: unknown) {
    if (handleVersionConflict(err, onConflict, { docId: doc.id, field: 'published', attempted: publishedContent })) {
      /* thrown above */
    }
    message.error(formatApiError(err, '保存失败'));
    throw err;
  }
}

export async function patchDocumentTitle(
  doc: DocumentDetail,
  title: string,
  onConflict?: VersionConflictHandler,
): Promise<DocumentDetail> {
  try {
    return await docsApi.updateDocument(doc.id, {
      title,
      expected_version: doc.version,
    });
  } catch (err: unknown) {
    if (handleVersionConflict(err, onConflict, { docId: doc.id, field: 'title', attempted: title })) {
      /* thrown above */
    }
    message.error(formatApiError(err, '保存失败'));
    throw err;
  }
}
