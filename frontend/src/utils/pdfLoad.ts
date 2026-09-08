/**
 * Pure helpers for pdf.js document loading (no pdfjs import so they are unit
 * testable in node): the `getDocument` parameter set and error wording.
 * Consumed by hooks/usePdfDocument.ts.
 */
/** 256 KB chunks: a page of a text PDF is usually well under this. */
export const PDF_RANGE_CHUNK = 256 * 1024;

export interface PdfLoadOptions {
  url: string;
  withCredentials: boolean;
  rangeChunkSize: number;
  disableAutoFetch: boolean;
  disableStream: boolean;
  isEvalSupported: boolean;
  enableXfa: boolean;
}

/** pdf.js `getDocument` parameters for a same-origin media URL. `bust`
 * appends a cache-defeating query (manual retry only). */
export function buildPdfLoadOptions(url: string, opts: { bust?: boolean; now?: number } = {}): PdfLoadOptions {
  const src = opts.bust ? url + (url.includes('?') ? '&' : '?') + '_=' + (opts.now ?? Date.now()) : url;
  return {
    url: src,
    withCredentials: true,
    rangeChunkSize: PDF_RANGE_CHUNK,
    // Only pull the chunks pages actually need (the reader is windowed).
    disableAutoFetch: true,
    // Range-only: without this pdf.js keeps the initial full GET streaming in
    // the background until the whole file is in memory — exactly the 1 GB
    // problem. Each chunk is a separate cacheable 206 instead.
    disableStream: true,
    // Security posture in code, not just the production CSP: never eval
    // PostScript function code, never render XFA forms.
    isEvalSupported: false,
    enableXfa: false,
  };
}

/** Human-facing message for a pdf.js load failure. */
export function describePdfLoadError(e: unknown): string {
  const err = e as { name?: string; message?: string; status?: number };
  switch (err?.name) {
    case 'PasswordException':
      return '该 PDF 已加密，暂不支持在线阅读，请下载后用本地阅读器打开';
    case 'MissingPDFException':
      return '文件不存在或已被移除（404）';
    case 'UnexpectedResponseException':
      return `服务器返回异常状态${err.status ? `（${err.status}）` : ''}，请重试`;
    case 'InvalidPDFException':
      return '文件不是有效的 PDF 或已损坏';
    default:
      return err?.message || 'PDF 加载失败';
  }
}
