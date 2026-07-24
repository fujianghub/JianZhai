import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Select, Space, Spin, Tag, Tree, Typography } from 'antd';
import * as kbsApi from '@/api/kbs';
import { message } from '@/utils/notify';
import type {
  KBCategory,
  KBTree,
  KnowledgeBase,
  ReadGrant,
  ReadGrantItem,
  TreeDocument,
  TreeFolder,
} from '@/types';

const { Text } = Typography;

/** One picked grant, carrying a display label alongside the write item. */
export interface GrantSelection {
  type: 'kb' | 'category' | 'folder' | 'document';
  targetId: number;
  label: string;
  item: ReadGrantItem;
}

export function selectionKey(s: GrantSelection): string {
  return `${s.type}:${s.targetId}`;
}

/** Read-side grants (from the user payload) → editable selections. */
export function grantsToSelections(grants: ReadGrant[]): GrantSelection[] {
  return grants.map((g) => {
    const label = g.kb_name ? `${g.kb_name} / ${g.name}` : g.name;
    const item: ReadGrantItem =
      g.type === 'kb'
        ? { kb_id: g.target_id }
        : g.type === 'category'
          ? { category_id: g.target_id }
          : g.type === 'folder'
            ? { folder_id: g.target_id }
            : { document_id: g.target_id };
    return { type: g.type, targetId: g.target_id, label, item };
  });
}

export function selectionsToItems(selections: GrantSelection[]): ReadGrantItem[] {
  return selections.map((s) => s.item);
}

/** Toggle helper — add if absent, remove if present (same type+target). */
export function toggleSelection(
  selections: GrantSelection[],
  next: GrantSelection,
  checked: boolean,
): GrantSelection[] {
  const rest = selections.filter((s) => selectionKey(s) !== selectionKey(next));
  return checked ? [...rest, next] : rest;
}

interface TreeNode {
  key: string;
  title: string;
  isLeaf?: boolean;
  selectable: boolean;
  children?: TreeNode[];
}

/** KB tree → AntD Tree data. Folder keys are `folder:{id}`, docs `doc:{id}`. */
export function buildGrantTreeData(tree: KBTree): TreeNode[] {
  const docNode = (d: TreeDocument): TreeNode => ({
    key: `doc:${d.id}`,
    title: d.title,
    isLeaf: true,
    selectable: false,
  });
  const folderNode = (f: TreeFolder): TreeNode => ({
    key: `folder:${f.id}`,
    title: `${f.name}（含子文件夹）`,
    selectable: false,
    children: [...f.children.map(folderNode), ...f.documents.map(docNode)],
  });
  return [...tree.folders.map(folderNode), ...tree.documents.map(docNode)];
}

interface ReadGrantControlProps {
  value: GrantSelection[];
  onChange: (next: GrantSelection[]) => void;
  disabled?: boolean;
}

/**
 * Reading-whitelist picker for the user admin: chips of current grants plus
 * a hierarchical adder (category → KB → folder/document tree). Purely
 * controlled — the parent owns the selection list and submits
 * ``selectionsToItems(value)`` as ``read_grant_items``.
 */
export default function ReadGrantControl({ value, onChange, disabled }: ReadGrantControlProps) {
  const [categories, setCategories] = useState<KBCategory[]>([]);
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [kbIds, setKbIds] = useState<number[]>([]);
  const [tree, setTree] = useState<KBTree | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);

  // The folder/document tree only renders for an unambiguous single pick;
  // multi-select is for batch whole-KB grants.
  const treeKbId = kbIds.length === 1 ? kbIds[0] : undefined;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [cats, kbList] = await Promise.all([
          kbsApi.listKBCategories(),
          kbsApi.listKBs(),
        ]);
        if (!cancelled) {
          setCategories(cats);
          setKbs(kbList);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) message.error('加载知识库列表失败');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!treeKbId) {
      setTree(null);
      return;
    }
    let cancelled = false;
    setTreeLoading(true);
    void (async () => {
      try {
        const data = await kbsApi.getKBTree(treeKbId);
        if (!cancelled) setTree(data);
      } catch (e) {
        console.error(e);
        if (!cancelled) message.error('加载知识库目录失败');
      } finally {
        if (!cancelled) setTreeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [treeKbId]);

  const kbOptions = useMemo(
    () =>
      (categoryId ? kbs.filter((k) => k.category?.id === categoryId) : kbs).map(
        (k) => ({ value: k.id, label: k.name }),
      ),
    [kbs, categoryId],
  );

  const selectedKbs = kbs.filter((k) => kbIds.includes(k.id));
  const selectedKb = kbs.find((k) => k.id === treeKbId);
  const selectedCategory = categories.find((c) => c.id === categoryId);

  const addCategory = useCallback(() => {
    if (!selectedCategory) return;
    onChange(
      toggleSelection(
        value,
        {
          type: 'category',
          targetId: selectedCategory.id,
          label: `大类：${selectedCategory.name}`,
          item: { category_id: selectedCategory.id },
        },
        true,
      ),
    );
  }, [selectedCategory, value, onChange]);

  const addKbs = useCallback(() => {
    if (!selectedKbs.length) return;
    let next = value;
    for (const kb of selectedKbs) {
      next = toggleSelection(
        next,
        {
          type: 'kb',
          targetId: kb.id,
          label: `整库：${kb.name}`,
          item: { kb_id: kb.id },
        },
        true,
      );
    }
    onChange(next);
  }, [selectedKbs, value, onChange]);

  const treeData = useMemo(() => (tree ? buildGrantTreeData(tree) : []), [tree]);

  // Only the current KB's folder/doc selections are reflected as checks;
  // grants from other KBs live on as chips.
  const checkedKeys = useMemo(() => {
    if (!tree) return [];
    const folderIds = new Set<number>();
    const docIds = new Set<number>();
    const collect = (f: TreeFolder) => {
      folderIds.add(f.id);
      f.children.forEach(collect);
      f.documents.forEach((d) => docIds.add(d.id));
    };
    tree.folders.forEach(collect);
    tree.documents.forEach((d) => docIds.add(d.id));
    return value
      .filter(
        (s) =>
          (s.type === 'folder' && folderIds.has(s.targetId)) ||
          (s.type === 'document' && docIds.has(s.targetId)),
      )
      .map((s) => (s.type === 'folder' ? `folder:${s.targetId}` : `doc:${s.targetId}`));
  }, [value, tree]);

  const onTreeCheck = useCallback(
    (_checked: unknown, info: { node: { key: string | number }; checked: boolean }) => {
      if (!tree || !selectedKb) return;
      const key = String(info.node.key);
      const [kind, idStr] = key.split(':');
      const id = Number(idStr);
      if (kind === 'folder') {
        const findFolder = (list: TreeFolder[]): TreeFolder | undefined => {
          for (const f of list) {
            if (f.id === id) return f;
            const hit = findFolder(f.children);
            if (hit) return hit;
          }
          return undefined;
        };
        const folder = findFolder(tree.folders);
        onChange(
          toggleSelection(
            value,
            {
              type: 'folder',
              targetId: id,
              label: `${selectedKb.name} / ${folder?.name ?? `文件夹#${id}`}`,
              item: { folder_id: id },
            },
            info.checked,
          ),
        );
      } else {
        const findDoc = (folders: TreeFolder[], roots: TreeDocument[]): TreeDocument | undefined => {
          const root = roots.find((d) => d.id === id);
          if (root) return root;
          for (const f of folders) {
            const hit = f.documents.find((d) => d.id === id) ?? findDoc(f.children, []);
            if (hit) return hit;
          }
          return undefined;
        };
        const doc = findDoc(tree.folders, tree.documents);
        onChange(
          toggleSelection(
            value,
            {
              type: 'document',
              targetId: id,
              label: `${selectedKb.name} / ${doc?.title ?? `文档#${id}`}`,
              item: { document_id: id },
            },
            info.checked,
          ),
        );
      }
    },
    [tree, selectedKb, value, onChange],
  );

  return (
    <div>
      {value.length === 0 ? (
        <Alert
          type="info"
          showIcon
          message="未设置任何授权：该用户不受限，可阅读全部公开内容。"
          style={{ marginBottom: 12 }}
        />
      ) : (
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
            已授权（白名单，仅以下内容可读）：
          </Text>
          <Space size={4} wrap>
            {value.map((s) => (
              <Tag
                key={selectionKey(s)}
                closable={!disabled}
                onClose={(e) => {
                  e.preventDefault();
                  onChange(toggleSelection(value, s, false));
                }}
                color={
                  s.type === 'kb'
                    ? 'blue'
                    : s.type === 'category'
                      ? 'purple'
                      : s.type === 'folder'
                        ? 'gold'
                        : 'green'
                }
                style={{ marginRight: 0 }}
              >
                {s.label}
              </Tag>
            ))}
          </Space>
        </div>
      )}

      {!disabled && (
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <Space wrap>
            <Select
              allowClear
              placeholder="选择大类（可选）"
              style={{ minWidth: 180 }}
              value={categoryId}
              onChange={(v) => {
                setCategoryId(v);
                setKbIds([]);
              }}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
            <Button size="small" disabled={!selectedCategory} onClick={addCategory}>
              授权整个大类
            </Button>
          </Space>
          <Space wrap>
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="选择知识库（可多选批量授权）"
              style={{ minWidth: 260, maxWidth: 420 }}
              value={kbIds}
              onChange={(v) => setKbIds(v)}
              options={kbOptions}
            />
            <Button size="small" disabled={!selectedKbs.length} onClick={addKbs}>
              授权整库{selectedKbs.length > 1 ? `（${selectedKbs.length}）` : ''}
            </Button>
          </Space>
          {kbIds.length > 1 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              已多选 {kbIds.length} 个知识库；仅选中单个知识库时可展开目录树，精细到文件夹 / 文档授权。
            </Text>
          )}
          {treeLoading && <Spin size="small" />}
          {tree && !treeLoading && (
            <div
              style={{
                maxHeight: 260,
                overflow: 'auto',
                border: '1px solid var(--jz-border)',
                borderRadius: 8,
                padding: 8,
              }}
            >
              {treeData.length === 0 ? (
                <Text type="secondary">该知识库暂无文件夹或文档</Text>
              ) : (
                <Tree
                  checkable
                  checkStrictly
                  selectable={false}
                  treeData={treeData}
                  checkedKeys={{ checked: checkedKeys, halfChecked: [] }}
                  onCheck={onTreeCheck as never}
                />
              )}
            </div>
          )}
        </Space>
      )}
    </div>
  );
}
