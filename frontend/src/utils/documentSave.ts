import { isAxiosError } from 'axios';
import * as docsApi from '@/api/docs';
import { formatApiError } from '@/api/client';
import { message } from '@/utils/notify';
import type { DocumentDetail } from '@/types';

export type VersionConflictHandler = (live: DocumentDetail | undefined) => void;

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
    message.error(formatApiError(err, '保存失败'));
    throw err;
  }
}
