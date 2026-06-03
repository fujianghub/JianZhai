import { useMemo } from 'react';
import { Button, Tag, Tooltip, Tree } from 'antd';
import {
  FileTextOutlined,
  FolderOutlined,
  PushpinFilled,
  PushpinOutlined,
  StarFilled,
  StarOutlined,
  TagsOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import type { KBTree, TreeDocument, TreeFolder } from '@/types';
import DocFormatTag from '@/components/common/DocFormatTag';
import { resolveTagColor } from '@/utils/tagColor';

export interface CheckedSelection {
  docIds: number[];
  folderIds: number[];
}

interface Props {
  tree: KBTree;
  selectedDocId: number | null;
  onSelectDoc: (id: number) => void;
  /** When true, render checkboxes for batch selection. */
  checkable?: boolean;
  checked?: CheckedSelection;
  onCheckedChange?: (next: CheckedSelection) => void;
  /** Triggered when the user clicks a folder's "标签" button. Optional —
   * if omitted, the button is hidden. */
  onEditFolderTags?: (folder: TreeFolder) => void;
  /** Export this folder (including subfolders). */
  onExportFolder?: (folder: TreeFolder) => void;
  /** Filter documents whose titles match this substring (case-insensitive). */
  filterQuery?: string;
  /** Filter documents by status. */
  filterStatus?: 'all' | 'published' | 'draft';
  onTogglePin?: (doc: TreeDocument) => void;
  onToggleFavorite?: (doc: TreeDocument) => void;
}

function docMatches(d: TreeDocument, q: string, status: 'all' | 'published' | 'draft'): boolean {
  if (status !== 'all' && d.status !== status) return false;
  if (!q) return true;
  return d.title.toLowerCase().includes(q.toLowerCase());
}

function filterFolder(
  f: TreeFolder,
  q: string,
  status: 'all' | 'published' | 'draft'
): TreeFolder | null {
  const docs = f.documents.filter((d) => docMatches(d, q, status));
  const subs = f.children
    .map((c) => filterFolder(c, q, status))
    .filter((x): x is TreeFolder => x !== null);
  if (docs.length === 0 && subs.length === 0) return null;
  return { ...f, documents: docs, children: subs };
}

/**
 * Collect the ids of every document and folder currently *visible* under the
 * given filter (title query + status). Reuses the same `filterFolder` pruning
 * as the tree render so "全选" only picks what the user can actually see.
 */
export function collectVisibleSelection(
  tree: KBTree,
  filterQuery = '',
  filterStatus: 'all' | 'published' | 'draft' = 'all'
): CheckedSelection {
  const docIds: number[] = [];
  const folderIds: number[] = [];
  const walk = (folders: TreeFolder[]) => {
    for (const f of folders) {
      folderIds.push(f.id);
      for (const d of f.documents) docIds.push(d.id);
      walk(f.children);
    }
  };
  const folders = tree.folders
    .map((f) => filterFolder(f, filterQuery, filterStatus))
    .filter((x): x is TreeFolder => x !== null);
  walk(folders);
  for (const d of tree.documents.filter((d) => docMatches(d, filterQuery, filterStatus))) {
    docIds.push(d.id);
  }
  return { docIds, folderIds };
}

function collectFolderKeys(folders: TreeFolder[]): React.Key[] {
  const keys: React.Key[] = [];
  function walk(list: TreeFolder[]) {
    for (const f of list) {
      keys.push(`folder-${f.id}`);
      walk(f.children);
    }
  }
  walk(folders);
  return keys;
}

function renderHighlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark
        style={{
          background: 'color-mix(in srgb, var(--jz-doc-accent, var(--jz-accent)) 30%, transparent)',
          borderRadius: 2,
          padding: '0 2px',
        }}
      >
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function docNode(
  d: TreeDocument,
  q: string,
  onTogglePin?: (doc: TreeDocument) => void,
  onToggleFavorite?: (doc: TreeDocument) => void,
): DataNode {
  return {
    key: `doc-${d.id}`,
    title: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
        {onTogglePin && (
          <Tooltip title={d.is_pinned ? '取消置顶' : '置顶'}>
            <Button
              type="text"
              size="small"
              icon={d.is_pinned ? <PushpinFilled style={{ color: 'var(--jz-accent)' }} /> : <PushpinOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(d);
              }}
              style={{ width: 22, height: 22, minWidth: 22, padding: 0 }}
            />
          </Tooltip>
        )}
        {onToggleFavorite && (
          <Tooltip title={d.is_favorited ? '取消收藏' : '收藏'}>
            <Button
              type="text"
              size="small"
              icon={
                d.is_favorited ? (
                  <StarFilled style={{ color: '#faad14' }} />
                ) : (
                  <StarOutlined />
                )
              }
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(d);
              }}
              style={{ width: 22, height: 22, minWidth: 22, padding: 0 }}
            />
          </Tooltip>
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
          {renderHighlight(d.title, q)}
          {d.status === 'published' ? ' ✓' : ''}
        </span>
        <DocFormatTag format={d.doc_format} />
      </span>
    ),
    icon: <FileTextOutlined />,
    isLeaf: true,
  };
}

function folderNode(
  f: TreeFolder,
  q: string,
  onEditFolderTags?: (folder: TreeFolder) => void,
  onExportFolder?: (folder: TreeFolder) => void,
  onTogglePin?: (doc: TreeDocument) => void,
  onToggleFavorite?: (doc: TreeDocument) => void,
): DataNode {
  return {
    key: `folder-${f.id}`,
    title: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 500 }}>{renderHighlight(f.name, q)}</span>
        {(f.tags ?? []).map((t) => (
          <Tag
            key={t.id}
            color={resolveTagColor(t)}
            style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: '16px', padding: '0 6px' }}
          >
            {t.name}
          </Tag>
        ))}
        {onExportFolder && (
          <Tooltip title="导出文件夹">
            <Button
              size="small"
              type="text"
              icon={<ExportOutlined />}
              aria-label="导出文件夹"
              onClick={(e) => {
                e.stopPropagation();
                onExportFolder(f);
              }}
              style={{ fontSize: 11, padding: '0 4px', height: 18, lineHeight: '18px' }}
            />
          </Tooltip>
        )}
        {onEditFolderTags && (
          <Tooltip title="编辑文件夹标签">
            <Button
              size="small"
              type="text"
              icon={<TagsOutlined />}
              aria-label="编辑文件夹标签"
              onClick={(e) => {
                e.stopPropagation();
                onEditFolderTags(f);
              }}
              style={{ fontSize: 11, padding: '0 4px', height: 18, lineHeight: '18px' }}
            />
          </Tooltip>
        )}
      </span>
    ),
    icon: <FolderOutlined />,
    selectable: false,
    children: [
      ...f.children.map((c) =>
        folderNode(c, q, onEditFolderTags, onExportFolder, onTogglePin, onToggleFavorite)
      ),
      ...f.documents.map((d) => docNode(d, q, onTogglePin, onToggleFavorite)),
    ],
  };
}

function parseKeys(keys: React.Key[]): CheckedSelection {
  const docIds: number[] = [];
  const folderIds: number[] = [];
  for (const k of keys) {
    if (typeof k !== 'string') continue;
    if (k.startsWith('doc-')) docIds.push(Number(k.slice(4)));
    else if (k.startsWith('folder-')) folderIds.push(Number(k.slice(7)));
  }
  return { docIds, folderIds };
}

function toCheckedKeys(sel: CheckedSelection): React.Key[] {
  return [
    ...sel.folderIds.map((id) => `folder-${id}`),
    ...sel.docIds.map((id) => `doc-${id}`),
  ];
}

export default function KBTreeNav({
  tree,
  selectedDocId,
  onSelectDoc,
  checkable = false,
  checked,
  onCheckedChange,
  onEditFolderTags,
  onExportFolder,
  filterQuery,
  filterStatus,
  onTogglePin,
  onToggleFavorite,
}: Props) {
  const filteredTree = useMemo(() => {
    if (!filterQuery && (filterStatus === 'all' || filterStatus === undefined)) return tree;
    const q = filterQuery ?? '';
    const status = filterStatus ?? 'all';
    const folders = tree.folders
      .map((f) => filterFolder(f, q, status))
      .filter((x): x is TreeFolder => x !== null);
    const documents = tree.documents.filter((d) => docMatches(d, q, status));
    return { ...tree, folders, documents };
  }, [tree, filterQuery, filterStatus]);

  const filteringActive = !!filterQuery || (filterStatus !== undefined && filterStatus !== 'all');

  const autoExpanded = useMemo(
    () => collectFolderKeys(filteredTree.folders),
    [filteredTree]
  );

  const data = useMemo<DataNode[]>(() => {
    const q = filterQuery ?? '';
    return [
      ...filteredTree.folders.map((f) =>
        folderNode(f, q, onEditFolderTags, onExportFolder, onTogglePin, onToggleFavorite)
      ),
      ...filteredTree.documents.map((d) => docNode(d, q, onTogglePin, onToggleFavorite)),
    ];
  }, [filteredTree, filterQuery, onEditFolderTags, onExportFolder, onTogglePin, onToggleFavorite]);

  return (
    <Tree
      showIcon
      blockNode
      treeData={data}
      defaultExpandAll={!filteringActive}
      {...(filteringActive ? { expandedKeys: autoExpanded } : {})}
      checkable={checkable}
      checkedKeys={checked ? toCheckedKeys(checked) : undefined}
      onCheck={(keys) => {
        if (!onCheckedChange) return;
        const flat = Array.isArray(keys) ? keys : keys.checked;
        onCheckedChange(parseKeys(flat as React.Key[]));
      }}
      selectedKeys={selectedDocId !== null ? [`doc-${selectedDocId}`] : []}
      onSelect={(keys) => {
        const key = keys[0];
        if (typeof key === 'string' && key.startsWith('doc-')) {
          onSelectDoc(Number(key.slice(4)));
        }
      }}
    />
  );
}
