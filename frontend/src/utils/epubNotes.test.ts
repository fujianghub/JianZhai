import { describe, expect, it } from 'vitest';
import type { Highlight } from '@/api/reading';
import {
  HIGHLIGHT_SWATCHES,
  buildCommentFromHighlight,
  buildNotesMarkdown,
  buildQuoteMarkdown,
  docCfiHref,
  groupByChapter,
  normalizeSelectionText,
  notesFilename,
  sortHighlights,
  swatchHex,
} from './epubNotes';

const hl = (over: Partial<Highlight>): Highlight => ({
  id: 1,
  document: 9,
  cfi: 'epubcfi(/6/4!/4/2/2,/1:0,/1:5)',
  selector: null,
  text: 'quote',
  chapter: '第1章',
  color: 'yellow',
  style: 'highlight',
  note: '',
  created_at: '2026-09-02T00:00:00Z',
  updated_at: '2026-09-02T00:00:00Z',
  ...over,
});

describe('epubNotes', () => {
  it('has seven swatches with a hex fallback', () => {
    expect(HIGHLIGHT_SWATCHES.map((s) => s.key)).toEqual(['yellow', 'green', 'blue', 'pink', 'purple', 'red', 'orange']);
    expect(swatchHex('purple')).toBe('#b07cff');
    expect(swatchHex('nope')).toBe(HIGHLIGHT_SWATCHES[0].hex);
  });

  it('normalises selection text and caps it', () => {
    expect(normalizeSelectionText('  a \n\n b\t c ')).toBe('a b c');
    expect(normalizeSelectionText('x'.repeat(3000))).toHaveLength(2000);
  });

  it('sorts by CFI reading order (spine, then position)', () => {
    const a = hl({ id: 1, cfi: 'epubcfi(/6/8!/4/2/2,/1:0,/1:5)' });
    const b = hl({ id: 2, cfi: 'epubcfi(/6/4!/4/2/10,/1:0,/1:5)' });
    const c = hl({ id: 3, cfi: 'epubcfi(/6/4!/4/2/2,/1:3,/1:9)' });
    expect(sortHighlights([a, b, c]).map((h) => h.id)).toEqual([3, 2, 1]);
  });

  it('keeps insertion order for unparsable CFIs', () => {
    const a = hl({ id: 1, cfi: 'garbage' });
    const b = hl({ id: 2, cfi: 'epubcfi(/6/4!/4/2/2,/1:0,/1:5)' });
    expect(sortHighlights([a, b]).map((h) => h.id)).toEqual([1, 2]);
  });

  it('groups contiguous chapters only', () => {
    const g = groupByChapter([hl({ chapter: 'A' }), hl({ chapter: 'A' }), hl({ chapter: 'B' }), hl({ chapter: 'A' })]);
    expect(g.map((x) => [x.chapter, x.items.length])).toEqual([
      ['A', 2],
      ['B', 1],
      ['A', 1],
    ]);
  });

  it('builds a quote block with attribution and back link', () => {
    const md = buildQuoteMarkdown('  To be,\nor not ', { title: 'Hamlet', author: 'Shakespeare', chapter: 'Act 3', docId: 9, cfi: 'epubcfi(/6/4!/4/2,/1:0,/1:5)' });
    expect(md).toBe('> To be, or not\n> —— 《Hamlet》 · Shakespeare · Act 3 · [回到原文](/d/9?cfi=epubcfi(%2F6%2F4!%2F4%2F2%2C%2F1%3A0%2C%2F1%3A5))');
  });

  it('omits the back link without a document id', () => {
    const md = buildQuoteMarkdown('q', { title: 'T' });
    expect(md).toBe('> q\n> —— 《T》');
  });

  it('encodes the deep link', () => {
    expect(docCfiHref(5, 'epubcfi(/6/4!/4/2)')).toBe('/d/5?cfi=epubcfi(%2F6%2F4!%2F4%2F2)');
  });

  it('exports notes grouped by chapter in reading order', () => {
    const md = buildNotesMarkdown({
      title: 'Book',
      author: 'Au',
      docId: 9,
      now: new Date(2026, 8, 2),
      highlights: [
        hl({ id: 1, chapter: '第2章', cfi: 'epubcfi(/6/8!/4/2/2,/1:0,/1:5)', text: 'later', note: 'my note' }),
        hl({ id: 2, chapter: '第1章', cfi: 'epubcfi(/6/4!/4/2/2,/1:0,/1:5)', text: 'earlier' }),
      ],
    });
    expect(md).toBe(
      [
        '# 《Book》读书笔记',
        '',
        '作者：Au · 导出于 2026-09-02 · 2 条划线',
        '',
        '原书：[《Book》](/d/9)',
        '',
        '## 第1章',
        '',
        '> earlier',
        '> —— [回到原文](/d/9?cfi=epubcfi(%2F6%2F4!%2F4%2F2%2F2%2C%2F1%3A0%2C%2F1%3A5))',
        '',
        '## 第2章',
        '',
        '> later',
        '> —— [回到原文](/d/9?cfi=epubcfi(%2F6%2F8!%2F4%2F2%2F2%2C%2F1%3A0%2C%2F1%3A5))',
        '',
        'my note',
        '',
      ].join('\n'),
    );
  });

  it('builds a comment body from a highlight', () => {
    expect(buildCommentFromHighlight({ text: 'q', note: 'n', chapter: 'c' })).toBe('> q\n> —— c\n\nn');
    expect(buildCommentFromHighlight({ text: '', note: 'only note', chapter: '' })).toBe('only note');
  });

  it('sanitises the download file name', () => {
    expect(notesFilename('A/B:C')).toBe('A B C-读书笔记.md');
    expect(notesFilename('')).toBe('读书笔记.md');
  });
});
