// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Markdown } from 'tiptap-markdown';
import { DrawioBoard } from './DrawioBoard';
import { buildDrawioFigureHtml } from '@/utils/drawioEmbed';
import { renderMarkdown } from '@/utils/markdown';

// Node view needs a React renderer — irrelevant to schema / serialisation.
const HeadlessDrawio = DrawioBoard.extend({ addNodeView: () => null });

const FIG = buildDrawioFigureHtml({ src: '/media/uploads/2026/09/b.svg', png: '/media/uploads/2026/09/b.png' });

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function make(content: string) {
  editor = new Editor({
    extensions: [StarterKit, Image, HeadlessDrawio, Markdown.configure({ html: true })],
    content,
  });
  return editor;
}

const md = (e: Editor) =>
  (e.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();

describe('drawioBoard node', () => {
  it('claims the figure (not the image node) and keeps both urls', () => {
    const e = make(`段落\n\n${FIG}\n\n结尾`);
    const nodes: { type: string; attrs: Record<string, unknown> }[] = [];
    e.state.doc.descendants((n) => {
      nodes.push({ type: n.type.name, attrs: n.attrs });
    });
    const board = nodes.find((n) => n.type === 'drawioBoard');
    expect(board?.attrs.src).toBe('/media/uploads/2026/09/b.svg');
    expect(board?.attrs.png).toBe('/media/uploads/2026/09/b.png');
    expect(nodes.some((n) => n.type === 'image')).toBe(false);
  });

  it('markdown round-trip is byte-stable', () => {
    const e = make(`段落\n\n${FIG}\n\n结尾`);
    const out = md(e);
    expect(out).toContain(FIG);
    const again = make(out);
    expect(md(again)).toBe(out);
  });

  it('an unsaved (empty) board is dropped on serialisation', () => {
    const e = make('段落');
    e.commands.insertDrawioBoard();
    expect(e.state.doc.toJSON().content.some((n: { type: string }) => n.type === 'drawioBoard')).toBe(true);
    expect(md(e)).not.toContain('jz-drawio');
  });

  it('a pasted figure pointing off-site is not turned into a board', () => {
    const e = make('<figure data-jz-drawio="1"><img src="https://evil.example/x.svg"></figure>');
    let boards = 0;
    e.state.doc.descendants((n) => {
      if (n.type.name === 'drawioBoard') boards += 1;
    });
    expect(boards).toBe(0);
  });
});

describe('reader rendering', () => {
  it('keeps the figure, its marker and the png copy through DOMPurify', () => {
    const html = renderMarkdown(`前文\n\n${FIG}\n\n后文`);
    const div = document.createElement('div');
    div.innerHTML = html;
    const fig = div.querySelector('figure.jz-drawio');
    expect(fig).not.toBeNull();
    expect(fig!.getAttribute('data-jz-drawio')).toBe('1');
    expect(fig!.getAttribute('data-png')).toBe('/media/uploads/2026/09/b.png');
    expect(fig!.querySelector('img')?.getAttribute('src')).toBe('/media/uploads/2026/09/b.svg');
  });
});

describe('drawioBoard settings', () => {
  const FIG2 = buildDrawioFigureHtml({
    src: '/media/uploads/2026/09/c.svg', png: '/media/uploads/2026/09/c.png',
    scheme: 'light', size: 's', align: 'right', caption: '图 2 · 园区网',
  });

  it('settings attrs + caption survive a markdown round-trip byte-for-byte', () => {
    const e = make(`前\n\n${FIG2}\n\n后`);
    let attrs: Record<string, unknown> = {};
    e.state.doc.descendants((n) => {
      if (n.type.name === 'drawioBoard') attrs = n.attrs;
    });
    expect(attrs).toMatchObject({ scheme: 'light', size: 's', align: 'right', caption: '图 2 · 园区网' });
    const out = md(e);
    expect(out).toContain(FIG2);
    expect(md(make(out))).toBe(out);
  });

  it('reader keeps data-jz-* and figcaption', () => {
    const div = document.createElement('div');
    div.innerHTML = renderMarkdown(`x\n\n${FIG2}\n`);
    const fig = div.querySelector('figure.jz-drawio')!;
    expect(fig.getAttribute('data-jz-scheme')).toBe('light');
    expect(fig.getAttribute('data-jz-size')).toBe('s');
    expect(fig.getAttribute('data-jz-align')).toBe('right');
    expect(fig.querySelector('figcaption')?.textContent).toBe('图 2 · 园区网');
  });
});
