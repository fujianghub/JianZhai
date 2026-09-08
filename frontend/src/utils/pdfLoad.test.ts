import { describe, it, expect } from 'vitest';
import { buildPdfLoadOptions, describePdfLoadError, PDF_RANGE_CHUNK } from './pdfLoad';

describe('buildPdfLoadOptions', () => {
  it('streams the plain URL with Range chunks and a hardened posture', () => {
    expect(buildPdfLoadOptions('/media/uploads/a.pdf')).toEqual({
      url: '/media/uploads/a.pdf',
      withCredentials: true,
      rangeChunkSize: PDF_RANGE_CHUNK,
      disableAutoFetch: true,
      disableStream: true,
      isEvalSupported: false,
      enableXfa: false,
    });
  });

  it('only appends a cache-buster on an explicit reload', () => {
    expect(buildPdfLoadOptions('/media/a.pdf', { bust: true, now: 42 }).url).toBe('/media/a.pdf?_=42');
    expect(buildPdfLoadOptions('/media/a.pdf?x=1', { bust: true, now: 42 }).url).toBe('/media/a.pdf?x=1&_=42');
  });
});

describe('describePdfLoadError', () => {
  it('maps pdf.js exception names to Chinese messages', () => {
    expect(describePdfLoadError({ name: 'PasswordException' })).toMatch(/加密/);
    expect(describePdfLoadError({ name: 'MissingPDFException' })).toMatch(/404/);
    expect(describePdfLoadError({ name: 'UnexpectedResponseException', status: 503 })).toMatch(/503/);
    expect(describePdfLoadError({ name: 'InvalidPDFException' })).toMatch(/损坏/);
    expect(describePdfLoadError({ message: 'boom' })).toBe('boom');
    expect(describePdfLoadError(undefined)).toBe('PDF 加载失败');
  });
});
