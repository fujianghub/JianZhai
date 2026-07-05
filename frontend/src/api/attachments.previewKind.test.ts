import { describe, expect, it } from 'vitest';
import { previewKind } from './attachments';

const att = (original_filename: string, mime_type = '') => ({ original_filename, mime_type });

describe('previewKind', () => {
  it('detects pptx by extension', () => {
    expect(previewKind(att('deck.pptx'))).toBe('pptx');
    expect(previewKind(att('DECK.PPTX'))).toBe('pptx');
  });

  it('detects legacy .ppt', () => {
    expect(previewKind(att('old.ppt'))).toBe('pptx');
  });

  it('detects pptx by mime', () => {
    expect(
      previewKind(
        att('x', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
      ),
    ).toBe('pptx');
    expect(previewKind(att('x', 'application/vnd.ms-powerpoint'))).toBe('pptx');
  });

  it('still distinguishes other formats', () => {
    expect(previewKind(att('a.pdf'))).toBe('pdf');
    expect(previewKind(att('a.docx'))).toBe('docx');
    expect(previewKind(att('a.png', 'image/png'))).toBe('image');
  });
});
