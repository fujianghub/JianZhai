import { describe, expect, it } from 'vitest';
import type { PublicFolder, PublicKB, PublicPost } from '@/types';
import { flattenKbTree, groupKbsByCategory, repairKbListPrefs, repairKbTocPrefs } from './kbToc';

const doc = (id: number, title: string): PublicPost => ({ id, title, slug: `d${id}` } as PublicPost);
const folder = (id: number, name: string, documents: PublicPost[] = [], children: PublicFolder[] = []): PublicFolder =>
  ({ id, name, parent: null, order: 0, documents, children, tags: [] } as unknown as PublicFolder);

describe('flattenKbTree', () => {
  it('flattens in render order (docs before subfolders) with dot-path keys', () => {
    const tree = flattenKbTree(
      [folder(1, 'A', [doc(10, 'a1')], [folder(2, 'B', [doc(20, 'b1')])])],
      [doc(30, 'root')],
    );
    expect(tree.map((e) => [e.key, e.kind, e.title, e.level])).toEqual([
      ['0', 'folder', 'A', 1],
      ['0.0', 'doc', 'a1', 2],
      ['0.1', 'folder', 'B', 2],
      ['0.1.0', 'doc', 'b1', 3],
      ['1', 'doc', 'root', 1],
    ]);
    expect(tree[0].count).toBe(2);
  });
});

describe('groupKbsByCategory', () => {
  const kb = (id: number, name: string, category: PublicKB['category']): PublicKB =>
    ({ id, name, slug: name, category } as PublicKB);
  const cat = (id: number, name: string, order: number) => ({ id, name, slug: name, order, accent_color: '' });

  it('groups by category ordered by (order, id), uncategorised last', () => {
    const groups = groupKbsByCategory([
      kb(1, 'x', cat(5, '网络', 2)),
      kb(2, 'y', null),
      kb(3, 'z', cat(4, '安全', 1)),
      kb(4, 'w', cat(5, '网络', 2)),
    ]);
    expect(groups.map((g) => [g.category?.name ?? null, g.kbs.map((k) => k.name)])).toEqual([
      ['安全', ['z']],
      ['网络', ['x', 'w']],
      [null, ['y']],
    ]);
  });
});

describe('repairKbTocPrefs', () => {
  it('falls back field-by-field', () => {
    expect(repairKbTocPrefs({ density: 'compact', font: 'nope', counts: false })).toEqual({
      density: 'compact',
      size: 'm',
      wrap: false,
      counts: false,
      font: 'ui',
      color: 'text',
    });
    expect(repairKbTocPrefs(null)).toEqual({ density: 'normal', size: 'm', wrap: false, counts: true, font: 'ui', color: 'text' });
  });
});

describe('repairKbListPrefs', () => {
  it('falls back field-by-field and keeps switches', () => {
    expect(repairKbListPrefs({ density: 'loose', color: 'muted', grouped: false, font: 'bogus' })).toEqual({
      density: 'loose',
      size: 'm',
      font: 'ui',
      color: 'muted',
      counts: true,
      grouped: false,
    });
    expect(repairKbListPrefs(undefined).grouped).toBe(true);
  });
});
