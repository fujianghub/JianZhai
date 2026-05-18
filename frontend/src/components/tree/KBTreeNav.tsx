import { useMemo } from 'react';
import { Button, Tag, Tooltip, Tree } from 'antd';
import { FileTextOutlined, FolderOutlined, TagsOutlined } from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import type { KBTree, TreeDocument, TreeFolder } from '@/types';
import DocFormatTag from '@/components/common/DocFormatTag';

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
}

function folderNode(f: TreeFolder, onEditFolderTags?: (folder: TreeFolder) => void): DataNode {
  return {
    key: `folder-${f.id}`,
    title: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 500 }}>{f.name}</span>
        {(f.tags ?? []).map((t) => (
          <Tag
            key={t.id}
            color={t.color || undefined}
            style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: '16px', padding: '0 6px' }}
          >
            {t.name}
          </Tag>
        ))}
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
      ...f.children.map((c) => folderNode(c, onEditFolderTags)),
      ...f.documents.map(docNode),
    ],
  };
}

function docNode(d: TreeDocument): DataNode {
  return {
    key: `doc-${d.id}`,
    title: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {d.title}
          {d.status === 'published' ? ' ✓' : ''}
        </span>
        <DocFormatTag format={d.doc_format} />
      </span>
    ),
    icon: <FileTextOutlined />,
    isLeaf: true,
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
}: Props) {
  const data = useMemo<DataNode[]>(
    () => [
      ...tree.folders.map((f) => folderNode(f, onEditFolderTags)),
      ...tree.documents.map(docNode),
    ],
    [tree, onEditFolderTags]
  );

  return (
    <Tree
      showIcon
      blockNode
      treeData={data}
      defaultExpandAll
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
