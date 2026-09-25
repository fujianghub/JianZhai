import { describe, expect, it } from 'vitest';
import type { KBCategory, KnowledgeBase } from '@/types';
import { filterKbs, groupKbs, isFiltering, sortKbs, UNCATEGORIZED_KEY } from './adminKbList';

const cat = (id: number, name: string): KBCategory => ({ id, name, accent_color: '' }) as unknown as KBCategory;

const kb = (id: number, over: Partial<KnowledgeBase> = {}): KnowledgeBase =>
  ({
    id,
    name: `KB${id}`,
    slug: `kb-${id}`,
    description: '',
    cover_image: '',
    accent_color: '',
    visibility: 'private',
    category: null,
    doc_sort_mode: 'manual',
    order: id,
    document_count: 0,
    tags: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }) as KnowledgeBase;

describe('filterKbs', () => {
  const items = [
    kb(1, { name: 'Python 笔记', visibility: 'public', tags: [{ id: 1, name: '编程' } as never] }),
    kb(2, { name: 'HCIE', description: '华为 数通', category: cat(9, '网络') }),
    kb(3, { name: '读书' }),
  ];
  it('matches name/description/tag/category, case-insensitive, AND terms', () => {
    expect(filterKbs(items, { q: 'python', vis: 'all' }).map((k) => k.id)).toEqual([1]);
    expect(filterKbs(items, { q: '编程', vis: 'all' }).map((k) => k.id)).toEqual([1]);
    expect(filterKbs(items, { q: '网络', vis: 'all' }).map((k) => k.id)).toEqual([2]);
    expect(filterKbs(items, { q: '华为  hcie', vis: 'all' }).map((k) => k.id)).toEqual([2]);
    expect(filterKbs(items, { q: '华为 python', vis: 'all' })).toEqual([]);
  });
  it('filters by visibility', () => {
    expect(filterKbs(items, { q: '', vis: 'public' }).map((k) => k.id)).toEqual([1]);
    expect(filterKbs(items, { q: '', vis: 'private' }).map((k) => k.id)).toEqual([2, 3]);
  });
  it('isFiltering ignores whitespace-only query', () => {
    expect(isFiltering({ q: '  ', vis: 'all' })).toBe(false);
    expect(isFiltering({ q: '', vis: 'public' })).toBe(true);
  });
});

describe('sortKbs', () => {
  const items = [
    kb(1, { name: '乙', document_count: 5, updated_at: '2026-03-01T00:00:00Z' }),
    kb(2, { name: '甲', document_count: 9, updated_at: '2026-01-01T00:00:00Z' }),
    kb(3, { name: 'A', document_count: 5, updated_at: '2026-05-01T00:00:00Z' }),
  ];
  it('default keeps API order and does not mutate input', () => {
    const out = sortKbs(items, 'default');
    expect(out.map((k) => k.id)).toEqual([1, 2, 3]);
    expect(out).not.toBe(items);
  });
  it('updated desc / docs desc (stable) / name', () => {
    expect(sortKbs(items, 'updated').map((k) => k.id)).toEqual([3, 1, 2]);
    expect(sortKbs(items, 'docs').map((k) => k.id)).toEqual([2, 1, 3]);
    const byName = sortKbs(items, 'name').map((k) => k.id);
    expect(byName.indexOf(2)).toBeLessThan(byName.indexOf(1)); // 甲(jia) 先于 乙(yi)
  });
});

describe('groupKbs', () => {
  const cats = [cat(1, 'AI'), cat(2, '空大类')];
  const items = [kb(1, { category: cat(1, 'AI') }), kb(2), kb(3, { category: cat(99, '未知') })];
  it('follows category order, uncategorized last, unknown category falls back', () => {
    const s = groupKbs(items, cats, false);
    expect(s.map((x) => x.key)).toEqual(['cat-1', UNCATEGORIZED_KEY]);
    expect(s[1].kbs.map((k) => k.id)).toEqual([2, 3]);
  });
  it('includeEmpty keeps empty categories', () => {
    expect(groupKbs(items, cats, true).map((x) => x.key)).toEqual(['cat-1', 'cat-2', UNCATEGORIZED_KEY]);
  });
});
