import { describe, expect, it } from 'vitest';
import { parseCodeFenceInfo, serializeCodeFenceInfo } from './codeFenceMeta';

describe('codeFenceMeta', () => {
  it('parses language-only fence info', () => {
    expect(parseCodeFenceInfo('python')).toEqual({
      language: 'python',
      title: '',
      collapsed: false,
    });
  });

  it('parses title and collapsed markers', () => {
    expect(parseCodeFenceInfo('python title="Hello \\"World\\"" collapsed')).toEqual({
      language: 'python',
      title: 'Hello "World"',
      collapsed: true,
    });
  });

  it('serializes title and collapsed into fence info', () => {
    expect(serializeCodeFenceInfo('python', 'My Title', true)).toBe(
      'python title="My Title" collapsed'
    );
  });

  it('round-trips through parse and serialize', () => {
    const info = serializeCodeFenceInfo('js', 'Demo', false);
    const meta = parseCodeFenceInfo(info);
    expect(meta.language).toBe('js');
    expect(meta.title).toBe('Demo');
    expect(meta.collapsed).toBe(false);
  });
});
