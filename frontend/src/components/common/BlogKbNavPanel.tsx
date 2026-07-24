import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Empty, Select, Spin, Tooltip, Typography } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { message } from '@/utils/notify';
import * as kbsApi from '@/api/kbs';
import * as docsApi from '@/api/docs';
import { formatApiError } from '@/api/client';
import type { DocSortMode, PublicKB, PublicKBTree, PublicPost } from '@/types';
import { useAuthStore } from '@/stores/auth';
import PublicKbFolderTree from './PublicKbFolderTree';

const { Text } = Typography;

const SORT_OPTIONS: { value: DocSortMode; label: string }[] = [
  { value: 'custom', label: '自定义' },
  { value: 'title', label: '名称' },
  { value: 'created_at', label: '新建时间' },
  { value: 'updated_at', label: '更新时间' },
  { value: 'doc_format', label: '文件类型' },
];

interface Props {
  kbSlug: string;
  currentSlug?: string;
  onClose?: () => void;
  /** When set, tree is controlled by parent (e.g. KB landing page). */
  tree?: PublicKBTree | null;
  onTreeChange?: (tree: PublicKBTree) => void;
}

function sortKbs(kbs: PublicKB[]): PublicKB[] {
  return [...kbs].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
}

export default function BlogKbNavPanel({
  kbSlug,
  currentSlug,
  onClose,
  tree: controlledTree,
  onTreeChange,
}: Props) {
  const sessionUser = useAuthStore((s) => s.user);
  const [kbs, setKbs] = useState<PublicKB[] | null>(null);
  const [localTree, setLocalTree] = useState<PublicKBTree | null>(null);

  const tree = controlledTree !== undefined ? controlledTree : localTree;
  const setTree = onTreeChange ?? setLocalTree;

  const reloadTree = useCallback(async () => {
    const t = await kbsApi.getPublicKBTree(kbSlug);
    setTree(t);
    return t;
  }, [kbSlug, setTree]);

  useEffect(() => {
    let cancelled = false;
    if (controlledTree !== undefined) {
      void kbsApi.listPublicKBs().then((list) => {
        if (!cancelled) setKbs(sortKbs(list));
      });
      return () => {
        cancelled = true;
      };
    }
    setKbs(null);
    setLocalTree(null);
    Promise.all([kbsApi.listPublicKBs(), kbsApi.getPublicKBTree(kbSlug)])
      .then(([list, t]) => {
        if (!cancelled) {
          setKbs(sortKbs(list));
          setLocalTree(t);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setKbs([]);
          setLocalTree(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kbSlug, controlledTree]);

  const loading = kbs === null || tree === null;
  const canManage = !!tree?.can_manage;

  const docCount = tree?.documents.length ?? 0;
  const folders = tree?.folders ?? [];
  const rootDocuments = tree?.root_documents ?? tree?.documents ?? [];

  async function handleSortChange(mode: DocSortMode) {
    if (!tree) return;
    try {
      await kbsApi.updateKBSortMode(tree.id, mode);
      await reloadTree();
      message.success('排序方式已更新');
    } catch (err) {
      message.error(formatApiError(err, '更新排序失败'));
    }
  }

  async function handleTogglePin(doc: PublicPost) {
    try {
      await docsApi.toggleDocumentPin(doc.id, !doc.is_pinned);
      await reloadTree();
    } catch (err) {
      message.error(formatApiError(err, '置顶操作失败'));
    }
  }

  async function handleToggleFavorite(doc: PublicPost) {
    try {
      await docsApi.toggleDocumentFavorite(doc.id);
      await reloadTree();
    } catch (err) {
      message.error(formatApiError(err, '收藏操作失败'));
    }
  }

  // Pinning is an author affordance, but favoriting is a *reader* feature
  // (the favorites endpoint deliberately bypasses the author scope) — any
  // logged-in user gets the star.
  const pinHandler = canManage ? handleTogglePin : undefined;
  const favHandler = sessionUser ? handleToggleFavorite : undefined;

  const treeSection = useMemo(() => {
    if (!tree) return null;
    if (docCount === 0) {
      return (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无文档" style={{ margin: '8px 0' }} />
      );
    }
    const hasFolders = folders.length > 0;
    if (!hasFolders && rootDocuments.length > 0) {
      return (
        <>
          <p className="jz-kb-nav-hint">无子文件夹</p>
          <PublicKbFolderTree
            folders={[]}
            rootDocuments={rootDocuments}
            currentSlug={currentSlug}
            density="sidebar"
            canManage={canManage}
            onTogglePin={pinHandler}
            onToggleFavorite={favHandler}
          />
        </>
      );
    }
    return (
      <PublicKbFolderTree
        folders={folders}
        rootDocuments={rootDocuments}
        currentSlug={currentSlug}
        density="sidebar"
        showCounts
        canManage={canManage}
        onTogglePin={pinHandler}
        onToggleFavorite={favHandler}
      />
    );
  }, [tree, docCount, folders, rootDocuments, currentSlug, canManage, pinHandler, favHandler]);

  return (
    <nav className="jz-kb-nav" aria-label="博客知识库导航">
      <div className="jz-kb-nav-top">
        {onClose ? (
          <Tooltip title="隐藏导航">
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={onClose}
              aria-label="隐藏导航"
              className="jz-kb-nav-close"
            />
          </Tooltip>
        ) : null}
      </div>

      {loading ? (
        <div className="jz-kb-nav-loading">
          <Spin size="small" />
        </div>
      ) : (
        <>
          <section className="jz-kb-nav-section" aria-labelledby="jz-kb-nav-kb-list-title">
            <h3 id="jz-kb-nav-kb-list-title" className="jz-kb-nav-section-title">
              知识库
            </h3>
            <ul className="jz-kb-nav-kb-list">
              {(kbs ?? []).map((kb) => {
                const active = kb.slug === kbSlug;
                return (
                  <li key={kb.id}>
                    <Link
                      to={`/kb/${encodeURIComponent(kb.slug)}`}
                      className={'jz-kb-nav-kb-item' + (active ? ' is-active' : '')}
                      aria-current={active ? 'page' : undefined}
                    >
                      <span className="jz-kb-nav-kb-item-name">{kb.name}</span>
                      <span className="jz-kb-nav-kb-item-count">{kb.post_count}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>

          {tree && (
            <>
              <div className="jz-kb-nav-divider" role="separator" />

              <section className="jz-kb-nav-section" aria-labelledby="jz-kb-nav-kb-current-title">
                <h3 id="jz-kb-nav-kb-current-title" className="jz-kb-nav-section-title">
                  当前知识库
                </h3>
                <Link
                  to={`/kb/${encodeURIComponent(tree.slug)}`}
                  className="jz-kb-nav-kb-current"
                >
                  <span className="jz-kb-nav-kb-current-name">{tree.name}</span>
                  <Text type="secondary" className="jz-kb-nav-kb-current-meta">
                    {docCount} 篇文档
                  </Text>
                </Link>
                {canManage && (
                  <div className="jz-kb-nav-sort" style={{ marginTop: 10 }}>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                      文档排序
                    </Text>
                    <Select
                      size="small"
                      value={tree.doc_sort_mode ?? 'custom'}
                      onChange={handleSortChange}
                      options={SORT_OPTIONS}
                      style={{ width: '100%' }}
                      aria-label="文档排序"
                    />
                  </div>
                )}
              </section>

              <div className="jz-kb-nav-divider" role="separator" />

              <section className="jz-kb-nav-section" aria-labelledby="jz-kb-nav-tree-title">
                <h3 id="jz-kb-nav-tree-title" className="jz-kb-nav-section-title">
                  目录
                </h3>
                {treeSection}
              </section>
            </>
          )}
        </>
      )}
    </nav>
  );
}
