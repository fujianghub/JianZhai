import { describe, expect, it } from 'vitest';
import { tableHasColor, isGfmSerializable } from './TableMarkdown';
import type { Node as PMNode } from '@tiptap/pm/model';

/**
 * 用最小 stub 模拟 PM node 接口（descendants/forEach/type/attrs/childCount），
 * node 环境无需真实 schema。
 */
interface StubNode {
  type: { name: string };
  attrs: Record<string, unknown>;
  childCount: number;
  children: StubNode[];
  forEach(fn: (child: StubNode, offset: number, index: number) => void): void;
  descendants(fn: (node: StubNode) => boolean | void): void;
}

function stub(
  name: string,
  attrs: Record<string, unknown> = {},
  children: StubNode[] = [],
): StubNode {
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
const table = (rows: StubNode[]) => stub('table', {}, rows) as unknown as PMNode;

describe('tableHasColor', () => {
  it('false for plain table', () => {
    expect(tableHasColor(table([row([header(), header()]), row([cell(), cell()])]))).toBe(false);
  });
  it('true when any cell has bgColor', () => {
    expect(
      tableHasColor(table([row([header(), header()]), row([cell({ bgColor: 'red' }), cell()])])),
    ).toBe(true);
  });
  it('true when a header has textColor', () => {
    expect(tableHasColor(table([row([header({ textColor: '#333' })]), row([cell()])]))).toBe(true);
  });
});

describe('isGfmSerializable', () => {
  it('true for regular header+body table', () => {
    expect(isGfmSerializable(table([row([header(), header()]), row([cell(), cell()])]))).toBe(true);
  });
  it('false when first row contains a data cell', () => {
    expect(isGfmSerializable(table([row([header(), cell()]), row([cell(), cell()])]))).toBe(false);
  });
  it('false when body contains a header cell', () => {
    expect(isGfmSerializable(table([row([header(), header()]), row([header(), cell()])]))).toBe(false);
  });
  it('false with colspan/rowspan', () => {
    expect(
      isGfmSerializable(table([row([header({ colspan: 2 })]), row([cell(), cell()])])),
    ).toBe(false);
    expect(
      isGfmSerializable(table([row([header(), header()]), row([cell({ rowspan: 2 }), cell()])])),
    ).toBe(false);
  });
  it('false with multi-block cell content', () => {
    const fat = stub('tableCell', {}, [para(), para()]);
    expect(isGfmSerializable(table([row([header(), header()]), row([fat, cell()])]))).toBe(false);
  });
  it('false for empty table', () => {
    expect(isGfmSerializable(table([]))).toBe(false);
  });
});
