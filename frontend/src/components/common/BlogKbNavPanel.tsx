import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Popover, Segmented, Select, Spin, Switch, Tooltip, Typography } from 'antd';
import { CloseOutlined, SettingOutlined } from '@ant-design/icons';
import { message } from '@/utils/notify';
import { burstAtPointer } from '@/utils/inkBurst';
import * as kbsApi from '@/api/kbs';
import * as docsApi from '@/api/docs';
import { formatApiError } from '@/api/client';
import type { DocSortMode, PublicKB, PublicKBTree, PublicPost } from '@/types';
import { useAuthStore } from '@/stores/auth';
import { groupKbsByCategory, loadKbListPrefs, saveKbListPrefs, type KbListPrefs } from '@/utils/kbToc';
import PublicKbFolderTree from './PublicKbFolderTree';
import { TocFontSelect } from './TocSettingsPopover';
import { tocFontFamily } from '@/utils/tocPrefs';
import IconButton from '@/components/common/IconButton';
import JzEmpty from '@/components/common/JzEmpty';

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
  /** 知识库 list presentation (间距/字号/字体/颜色/篇数/大类分组) — its own
   * 目录设置 popover, persisted only on explicit changes. */
  const [listPrefs, setListPrefs] = useState<KbListPrefs>(() => loadKbListPrefs());
  const updateListPrefs = (patch: Partial<KbListPrefs>) => {
    setListPrefs((p) => {
      const next = { ...p, ...patch };
      saveKbListPrefs(next);
      return next;
    });
  };
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
      // 反馈就地化：Select 已显示新值、列表随即重排，成功 toast 与可见状态重复
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
      const { is_favorited } = await docsApi.toggleDocumentFavorite(doc.id);
      // 加入收藏 → 星标处缃金墨点迸发（取消不庆祝；reduce/档位内部自裁决）
      if (is_favorited) burstAtPointer();
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
        <JzEmpty description="无文档" style={{ margin: '8px 0' }} size="sm" />
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
            <IconButton
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
          <section
            className="jz-kb-nav-section jz-kb-nav-kbs"
            aria-labelledby="jz-kb-nav-kb-list-title"
            data-density={listPrefs.density}
            data-size={listPrefs.size}
            data-font={listPrefs.font}
            data-color={listPrefs.color}
            data-counts={listPrefs.counts ? 'on' : 'off'}
            style={{ ['--jz-font-toc' as string]: tocFontFamily(listPrefs.font) } as React.CSSProperties}
          >
            <div className="jz-kb-nav-section-head">
              <h3 id="jz-kb-nav-kb-list-title" className="jz-kb-nav-section-title">
                知识库
              </h3>
              <Popover
                trigger="click"
                placement="bottomRight"
                content={
                  <div className="jz-reader-layout-pop jz-epub-toc-settings" style={{ width: 232 }}>
                    <div className="jz-rl-section">
                      <div className="jz-rl-label">间距</div>
                      <Segmented
                        block
                        size="small"
                        value={listPrefs.density}
                        onChange={(v) => updateListPrefs({ density: v as KbListPrefs['density'] })}
                        options={[
                          { label: '紧凑', value: 'compact' },
                          { label: '标准', value: 'normal' },
                          { label: '宽松', value: 'loose' },
                        ]}
                      />
                    </div>
                    <div className="jz-rl-section">
                      <div className="jz-rl-label">字号</div>
                      <Segmented
                        block
                        size="small"
                        value={listPrefs.size}
                        onChange={(v) => updateListPrefs({ size: v as KbListPrefs['size'] })}
                        options={[
                          { label: '小', value: 's' },
                          { label: '中', value: 'm' },
                          { label: '大', value: 'l' },
                        ]}
                      />
                    </div>
                    <div className="jz-rl-section">
                      <div className="jz-rl-label">字体</div>
                      <TocFontSelect value={listPrefs.font} onChange={(font) => updateListPrefs({ font })} />
                    </div>
                    <div className="jz-rl-section">
                      <div className="jz-rl-label">颜色</div>
                      <Segmented
                        block
                        size="small"
                        value={listPrefs.color}
                        onChange={(v) => updateListPrefs({ color: v as KbListPrefs['color'] })}
                        options={[
                          { label: '正文色', value: 'text', title: '库名用正文色' },
                          { label: '淡显', value: 'muted', title: '全部淡色，当前库高亮' },
                        ]}
                      />
                    </div>
                    <div className="jz-rl-section jz-epub-toc-switches">
                      <label>
                        <span>大类分组</span>
                        <Switch size="small" checked={listPrefs.grouped} onChange={(v) => updateListPrefs({ grouped: v })} />
                      </label>
                      <label>
                        <span>显示篇数</span>
                        <Switch size="small" checked={listPrefs.counts} onChange={(v) => updateListPrefs({ counts: v })} />
                      </label>
                    </div>
                  </div>
                }
              >
                <Tooltip title="列表设置：间距 / 字号 / 字体 / 颜色 / 分组 / 篇数">
                  <IconButton className="jz-epub-toc-tool" icon={<SettingOutlined />} aria-label="知识库列表设置" />
                </Tooltip>
              </Popover>
            </div>
            <ul className="jz-kb-nav-kb-list">
              {/* 大类分组（`/public/kbs/` 自带 category，纯前端）——组头小字 +
                  accent 色点，未分类殿后；EPUB 目录「篇」层的视觉语言。 */}
              {(listPrefs.grouped
                ? groupKbsByCategory(kbs ?? [])
                : [{ category: null, kbs: kbs ?? [] }]
              ).map((group) => (
                <li key={group.category?.id ?? 'uncat'}>
                  {listPrefs.grouped && (group.category || (kbs ?? []).some((k) => k.category)) && (
                    <div
                      className="jz-kb-nav-cat"
                      style={group.category?.accent_color ? ({ ['--jz-cat-accent' as string]: group.category.accent_color } as React.CSSProperties) : undefined}
                    >
                      <i aria-hidden />
                      {group.category?.name ?? '未分类'}
                    </div>
                  )}
                  <ul className="jz-kb-nav-kb-list jz-kb-nav-kb-group">
                    {group.kbs.map((kb) => {
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
                </li>
              ))}
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
                    {(() => {
                      const cat = (kbs ?? []).find((k) => k.slug === tree.slug)?.category;
                      return cat ? `${cat.name} · ${docCount} 篇文档` : `${docCount} 篇文档`;
                    })()}
                  </Text>
                </Link>
                {canManage && (
                  <div className="jz-kb-nav-sort" style={{ marginTop: 10 }}>
                    <Text type="secondary" style={{ fontSize: 'var(--jz-fs-2xs)', display: 'block', marginBottom: 4 }}>
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
