// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadReaderPaper, paperCanvasBackground, READER_PAPERS, saveReaderPaper } from './readerPaper';
import { paperFor } from './epubReader';

beforeEach(() => localStorage.clear());

describe('readerPaper', () => {
  it('shares the EPUB swatches and defaults to theme', () => {
    expect(READER_PAPERS.map((p) => p.key)).toEqual(['theme', 'cream', 'green', 'sepia', 'night']);
    expect(loadReaderPaper()).toBe('theme');
  });
  it('persists a valid key and rejects garbage', () => {
    saveReaderPaper('sepia');
    expect(loadReaderPaper()).toBe('sepia');
    localStorage.setItem('jz-pdf-paper:v1', 'neon');
    expect(loadReaderPaper()).toBe('theme');
  });
  it('maps papers to a pdf.js canvas background', () => {
    expect(paperCanvasBackground(paperFor('theme'))).toBeNull();
    expect(paperCanvasBackground(paperFor('cream'))).toBe('#f6efe0');
    expect(paperCanvasBackground(paperFor('night'))).toBeNull(); // CSS invert instead
  });
});
