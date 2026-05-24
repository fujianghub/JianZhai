import { describe, expect, it } from 'vitest';
import {
  decodeBase64UTF8,
  getCodePlainTextFromBlock,
  normalizeCodePlainText,
} from './codeClipboard';

describe('normalizeCodePlainText', () => {
  it('unifies CRLF and strips zero-width spaces', () => {
    const raw = 'line1\r\nline2\u200b\nline3';
    expect(normalizeCodePlainText(raw)).toBe('line1\nline2\nline3');
  });

  it('removes trailing blank lines but keeps interior blanks', () => {
    const raw = 'a\n\nb\n\n';
    expect(normalizeCodePlainText(raw)).toBe('a\n\nb');
  });
});

describe('getCodePlainTextFromBlock', () => {
  it('reads from data-code-source base64', () => {
    const source = 'foo\nbar';
    const b64 = Buffer.from(source, 'utf8').toString('base64');

    const block = {
      dataset: { codeSource: b64 },
      querySelector: () => null,
    } as unknown as HTMLElement;

    expect(getCodePlainTextFromBlock(block)).toBe('foo\nbar');
  });

  it('joins jz-code-line elements without extra blank lines', () => {
    const lines = [{ textContent: 'first' }, { textContent: '\u200b' }, { textContent: 'third' }];
    const code = {
      querySelectorAll: (sel: string) => (sel === '.jz-code-line' ? lines : []),
      textContent: 'ignored',
    };
    const block = {
      dataset: {},
      querySelector: (sel: string) => (sel === 'code' ? code : null),
    } as unknown as HTMLElement;

    expect(getCodePlainTextFromBlock(block)).toBe('first\n\nthird');
  });
});

describe('decodeBase64UTF8', () => {
  it('round-trips UTF-8', () => {
    const text = '中文注释\n# comment';
    const b64 = Buffer.from(text, 'utf8').toString('base64');
    expect(decodeBase64UTF8(b64)).toBe(text);
  });
});
