import { describe, expect, it } from 'vitest';
import { tableHasColor, tableHasTableStyle, tableHasCustomStyle, isGfmSerializable } from './TableMarkdown';
import type { Node as PMNode } from '@tiptap/pm/model';

interface StubNode {
  type: { name: string };
  attrs: Record<string, unknown>;
  childCount: number;
  children: StubNode[];
  forEach(fn: (child: StubNode, offset: number, index: number) => void): void;
  descendants(fn: (node: StubNode) => boolean | void): void;
}

function stub(name: string, attrs: Record<string, unknown> = {}, children: StubNode[] = []): StubNode {
  const node: StubNode = {
    type: { name },
    attrs: { colspan: 1, rowspan: 1, ...attrs },
    childCount: children.length || (name.startsWith('table') ? 1 : 0),
    children,
    forEach(fn) {
      children.forEach((c, i) => fn(c, 0, i));
    },
    descendants(fn) {
      const walk = (n: StubNode) => {
        for (const c of n.children) {
          if (fn(c) !== false) walk(c);
        }
      };
      walk(node);
    },
  };
  return node;
}

const para = () => stub('paragraph');
const cell = (attrs: Record<string, unknown> = {}) => stub('tableCell', attrs, [para()]);
const header = (attrs: Record<string, unknown> = {}) => stub('tableHeader', attrs, [para()]);
const row = (cells: StubNode[]) => stub('tableRow', {}, cells);
const table = (rows: StubNode[], attrs: Record<string, unknown> = {}) =>
  stub('table', attrs, rows) as unknown as PMNode;

const plain = () => table([row([header(), header()]), row([cell(), cell()])]);

describe('tableHasTableStyle', () => {
  it('false for plain table', () => {
    expect(tableHasTableStyle(plain())).toBe(false);
  });
  it('true when maxRows / density / custom padding set', () => {
    expect(tableHasTableStyle(table([row([header()])], { maxRows: 10 }))).toBe(true);
    expect(tableHasTableStyle(table([row([header()])], { density: 'compact' }))).toBe(true);
    expect(tableHasTableStyle(table([row([header()])], { cellPadV: 4 }))).toBe(true);
    expect(tableHasTableStyle(table([row([header()])], { cellPadH: 8 }))).toBe(true);
  });
});

describe('tableHasCustomStyle (serialization gate)', () => {
  it('false for plain → stays GFM pipe', () => {
    expect(tableHasCustomStyle(plain())).toBe(false);
  });
  it('true when table-level style set', () => {
    expect(tableHasCustomStyle(table([row([header()])], { maxRows: 20 }))).toBe(true);
  });
  it('true when a cell has colour', () => {
    expect(
      tableHasCustomStyle(table([row([header()]), row([cell({ bgColor: 'red' })])])),
    ).toBe(true);
  });
});

describe('tableHasColor unchanged', () => {
  it('still only looks at cell colours', () => {
    expect(tableHasColor(plain())).toBe(false);
    expect(tableHasColor(table([row([header()]), row([cell({ textColor: '#333' })])]))).toBe(true);
    // 表级样式不影响 tableHasColor
    expect(tableHasColor(table([row([header()])], { density: 'loose' }))).toBe(false);
  });
});

describe('isGfmSerializable unchanged', () => {
  it('regular table true', () => {
    expect(isGfmSerializable(plain())).toBe(true);
  });
});
