import { isAxiosError } from 'axios';
import * as docsApi from '@/api/docs';
import { formatApiError } from '@/api/client';
import { message } from '@/utils/notify';
import type { DocumentDetail } from '@/types';

export type VersionConflictHandler = (live: DocumentDetail | undefined) => void;

function handleVersionConflict(
  err: unknown,
  onConflict?: VersionConflictHandler,
): boolean {
  if (
    isAxiosError(err) &&
    err.response?.status === 409 &&
    err.response.data?.code === 'version_conflict'
  ) {
    const live = err.response.data?.document as DocumentDetail | undefined;
    onConflict?.(live);
    message.warning('文档已被其他端修改，已加载最新版本');
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
    if (handleVersionConflict(err, onConflict)) {
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
    if (handleVersionConflict(err, onConflict)) {
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
    if (handleVersionConflict(err, onConflict)) {
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
    if (handleVersionConflict(err, onConflict)) {
      /* thrown above */
    }
    message.error(formatApiError(err, '保存失败'));
    throw err;
  }
}
