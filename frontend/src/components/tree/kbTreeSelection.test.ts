import { describe, expect, it } from 'vitest';
import { collectVisibleSelection, pruneCascadedSelection } from './KBTreeNav';
import type { KBTree, TreeDocument, TreeFolder } from '@/types';

function doc(id: number, title: string, status: 'draft' | 'published'): TreeDocument {
  return {
    id,
    type: 'document',
    title,
    slug: `d-${id}`,
    status,
    visibility: 'private',
    order: 0,
    folder: null,
    is_pinned: false,
    doc_format: 'markdown',
    is_favorited: false,
  };
}

function folder(id: number, name: string, documents: TreeDocument[], children: TreeFolder[] = []): TreeFolder {
  return { id, type: 'folder', name, parent: null, order: 0, children, documents, tags: [] };
}

// KB root has doc 1 (published) + folder 10 { doc 2 (draft), subfolder 11 { doc 3 (published) } }
const tree: KBTree = {
  id: 1,
  name: 'KB',
  folders: [folder(10, 'Alpha', [doc(2, 'Beta draft', 'draft')], [folder(11, 'Gamma', [doc(3, 'Gamma pub', 'published')])])],
  documents: [doc(1, 'Root pub', 'published')],
};

describe('collectVisibleSelection', () => {
  it('collects every doc and folder with no filter', () => {
    const sel = collectVisibleSelection(tree, '', 'all');
    expect(sel.docIds.sort()).toEqual([1, 2, 3]);
    expect(sel.folderIds.sort()).toEqual([10, 11]);
  });

  it('respects status filter and prunes folders with no matching docs', () => {
    const sel = collectVisibleSelection(tree, '', 'published');
    // doc 2 is draft → excluded; folder 10 still kept (subfolder 11 has a published doc)
    expect(sel.docIds.sort()).toEqual([1, 3]);
    expect(sel.folderIds.sort()).toEqual([10, 11]);
  });

  it('drops folders entirely when none of their docs match', () => {
    const sel = collectVisibleSelection(tree, '', 'draft');
    // only doc 2 (in folder 10) is a draft; subfolder 11 pruned
    expect(sel.docIds).toEqual([2]);
    expect(sel.folderIds).toEqual([10]);
  });

  it('respects a title query', () => {
    const sel = collectVisibleSelection(tree, 'gamma', 'all');
    expect(sel.docIds).toEqual([3]);
    expect(sel.folderIds.sort()).toEqual([10, 11]);
  });
});

describe('pruneCascadedSelection', () => {
  it('勾中文件夹时剔除其下被级联勾选的文档与子文件夹', () => {
    // 全选场景：folder 10 已勾 → doc 2、subfolder 11、doc 3 全部由级联覆盖
    const pruned = pruneCascadedSelection(tree, {
      docIds: [1, 2, 3],
      folderIds: [10, 11],
    });
    expect(pruned.folderIds).toEqual([10]);
    expect(pruned.docIds).toEqual([1]); // 根文档不受任何文件夹覆盖
  });

  it('只勾子文件夹时保留它，父级未勾不剪', () => {
    const pruned = pruneCascadedSelection(tree, { docIds: [3], folderIds: [11] });
    expect(pruned.folderIds).toEqual([11]);
    expect(pruned.docIds).toEqual([]); // doc 3 在已勾的 11 里 → 剔除
  });

  it('无文件夹勾选时原样返回文档集', () => {
    const pruned = pruneCascadedSelection(tree, { docIds: [1, 2], folderIds: [] });
    expect(pruned.docIds.sort()).toEqual([1, 2]);
    expect(pruned.folderIds).toEqual([]);
  });
});
