import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Empty, Spin, Tooltip, Typography } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import * as kbsApi from '@/api/kbs';
import type { PublicKB, PublicKBTree } from '@/types';
import PublicKbFolderTree from './PublicKbFolderTree';

const { Text } = Typography;

interface Props {
  kbSlug: string;
  /** Slug of the currently-open post; highlighted in the tree. */
  currentSlug?: string;
  /** Optional collapse handler; when provided, a close button is shown. */
  onClose?: () => void;
}

function sortKbs(kbs: PublicKB[]): PublicKB[] {
  return [...kbs].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
}

/**
 * Three-level blog KB navigation: public KB list → current KB → folder/doc tree.
 * Shared by post reader rail and KB landing page sidebar.
 */
export default function BlogKbNavPanel({ kbSlug, currentSlug, onClose }: Props) {
  const [kbs, setKbs] = useState<PublicKB[] | null>(null);
  const [tree, setTree] = useState<PublicKBTree | null>(null);

  useEffect(() => {
    let cancelled = false;
    setKbs(null);
    setTree(null);
    Promise.all([kbsApi.listPublicKBs(), kbsApi.getPublicKBTree(kbSlug)])
      .then(([list, t]) => {
        if (!cancelled) {
          setKbs(sortKbs(list));
          setTree(t);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setKbs([]);
          setTree(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kbSlug]);

  const loading = kbs === null || tree === null;

  const docCount = tree?.documents.length ?? 0;
  const folders = tree?.folders ?? [];
  const rootDocuments = tree?.root_documents ?? tree?.documents ?? [];

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
      />
    );
  }, [tree, docCount, folders, rootDocuments, currentSlug]);

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
