import { useMemo } from 'react';
import { Tree } from 'antd';
import { FileTextOutlined, FolderOutlined } from '@ant-design/icons';
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
}

function folderNode(f: TreeFolder): DataNode {
  return {
    key: `folder-${f.id}`,
    title: f.name,
    icon: <FolderOutlined />,
    selectable: false,
    children: [
      ...f.children.map(folderNode),
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
}: Props) {
  const data = useMemo<DataNode[]>(
    () => [...tree.folders.map(folderNode), ...tree.documents.map(docNode)],
    [tree]
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
