import { describe, expect, it } from 'vitest';
import {
  buildGrantTreeData,
  grantsToSelections,
  selectionKey,
  selectionsToItems,
  toggleSelection,
  type GrantSelection,
} from './ReadGrantControl';
import type { KBTree, ReadGrant } from '@/types';

const grants: ReadGrant[] = [
  { id: 1, type: 'kb', target_id: 10, name: 'KB-A' },
  { id: 2, type: 'category', target_id: 3, name: '甲类' },
  { id: 3, type: 'folder', target_id: 7, name: 'F1', kb_id: 10, kb_name: 'KB-A' },
  { id: 4, type: 'document', target_id: 99, name: 'Doc', kb_id: 10, kb_name: 'KB-A' },
];

describe('grantsToSelections', () => {
  it('maps each grant type to exactly one write key', () => {
    const items = selectionsToItems(grantsToSelections(grants));
    expect(items).toEqual([
      { kb_id: 10 },
      { category_id: 3 },
      { folder_id: 7 },
      { document_id: 99 },
    ]);
  });

  it('prefixes folder/document labels with the host KB name', () => {
    const sel = grantsToSelections(grants);
    expect(sel[2].label).toBe('KB-A / F1');
    expect(sel[3].label).toBe('KB-A / Doc');
    expect(sel[0].label).toBe('KB-A');
  });
});

describe('toggleSelection', () => {
  const kbSel: GrantSelection = {
    type: 'kb',
    targetId: 10,
    label: 'KB-A',
    item: { kb_id: 10 },
  };

  it('adds when checked and removes when unchecked', () => {
    const added = toggleSelection([], kbSel, true);
    expect(added).toHaveLength(1);
    const removed = toggleSelection(added, kbSel, false);
    expect(removed).toHaveLength(0);
  });

  it('never duplicates the same type+target', () => {
    const twice = toggleSelection(toggleSelection([], kbSel, true), kbSel, true);
    expect(twice).toHaveLength(1);
  });

  it('treats same id across different types as distinct', () => {
    const docSel: GrantSelection = {
      type: 'document',
      targetId: 10,
      label: 'Doc',
      item: { document_id: 10 },
    };
    const both = toggleSelection(toggleSelection([], kbSel, true), docSel, true);
    expect(both).toHaveLength(2);
    expect(new Set(both.map(selectionKey)).size).toBe(2);
  });
});

describe('buildGrantTreeData', () => {
  const tree = {
    id: 1,
    name: 'KB-A',
    folders: [
      {
        id: 7,
        type: 'folder',
        name: 'F1',
        parent: null,
        order: 0,
        tags: [],
        children: [
          {
            id: 8,
            type: 'folder',
            name: 'F2',
            parent: 7,
            order: 0,
            tags: [],
            children: [],
            documents: [],
          },
        ],
        documents: [
          {
            id: 99,
            type: 'document',
            title: 'Doc',
            slug: 'doc',
            status: 'published',
            visibility: 'public',
            order: 0,
            folder: 7,
            is_pinned: false,
            doc_format: 'markdown',
            is_favorited: false,
          },
        ],
      },
    ],
    documents: [],
  } as unknown as KBTree;

  it('encodes folder/doc keys and nests children', () => {
    const data = buildGrantTreeData(tree);
    expect(data).toHaveLength(1);
    expect(data[0].key).toBe('folder:7');
    expect(data[0].title).toContain('含子文件夹');
    const childKeys = (data[0].children ?? []).map((n) => n.key);
    expect(childKeys).toEqual(['folder:8', 'doc:99']);
  });
});
