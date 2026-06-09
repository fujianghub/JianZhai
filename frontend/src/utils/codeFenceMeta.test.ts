import { describe, expect, it } from 'vitest';
import { parseCodeFenceInfo, serializeCodeFenceInfo } from './codeFenceMeta';

describe('codeFenceMeta', () => {
  it('parses language-only fence info', () => {
    expect(parseCodeFenceInfo('python')).toEqual({
      language: 'python',
      title: '',
      collapsed: false,
      theme: '',
    });
  });

  it('parses title and collapsed markers', () => {
    expect(parseCodeFenceInfo('python title="Hello \\"World\\"" collapsed')).toEqual({
      language: 'python',
      title: 'Hello "World"',
      collapsed: true,
      theme: '',
    });
  });

  it('parses a per-block theme token', () => {
    expect(parseCodeFenceInfo('js theme=yuque-light title="Demo"')).toEqual({
      language: 'js',
      title: 'Demo',
      collapsed: false,
      theme: 'yuque-light',
    });
  });

  it('serializes title and collapsed into fence info', () => {
    expect(serializeCodeFenceInfo('python', 'My Title', true)).toBe(
      'python title="My Title" collapsed'
    );
  });

  it('serializes a per-block theme before title/collapsed', () => {
    expect(serializeCodeFenceInfo('python', 'My Title', true, 'one-dark-pro')).toBe(
      'python theme=one-dark-pro title="My Title" collapsed'
    );
    expect(serializeCodeFenceInfo('mermaid', '', false, 'night-owl')).toBe(
      'mermaid theme=night-owl'
    );
  });

  it('round-trips through parse and serialize', () => {
    const info = serializeCodeFenceInfo('js', 'Demo', false);
    const meta = parseCodeFenceInfo(info);
    expect(meta.language).toBe('js');
    expect(meta.title).toBe('Demo');
    expect(meta.collapsed).toBe(false);
    expect(meta.theme).toBe('');
  });

  it('round-trips the theme through parse and serialize', () => {
    const info = serializeCodeFenceInfo('ts', 'Demo', true, 'darcula');
    const meta = parseCodeFenceInfo(info);
    expect(meta).toEqual({ language: 'ts', title: 'Demo', collapsed: true, theme: 'darcula' });
  });
});
