import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Breadcrumb,
  Button,
  Card,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Progress,
  Radio,
  Result,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import TransitionLink from '@/components/common/TransitionLink';
import dayjs from 'dayjs';
import {
  AppstoreOutlined,
  BookOutlined,
  CloudUploadOutlined,
  FileAddOutlined,
  FileTextOutlined,
  FolderAddOutlined,
  HomeOutlined,
  PlusOutlined,
  ProfileOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { message } from '@/utils/notify';
import * as kbsApi from '@/api/kbs';
import * as docsApi from '@/api/docs';
import { formatApiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import type { PublicFolder, PublicKBTree, PublicPost } from '@/types';
import DocFormatTag from '@/components/common/DocFormatTag';
import BlogKbNavPanel from '@/components/common/BlogKbNavPanel';
import UploadDropZone from '@/components/common/UploadDropZone';
import {
  collectPickedFiles,
  notifyImportResult,
  runChunkedImport,
  skippedSummary,
  UPLOAD_ACCEPT,
  type CollectedUploads,
} from '@/utils/uploadBatch';
import { resolveTagColor } from '@/utils/tagColor';
import {
  NEW_HTML_DOCUMENT_TEMPLATE,
  type NewDocContentKind,
} from '@/utils/htmlTemplate';
import { signalRouteReady } from '@/utils/routeTransition';

const { Title, Paragraph } = Typography;

/** KB 页头容器/图标样式 —— 正式页头与加载壳共用，保证路由共享元素过渡
 * （jz-kb-hero，见 utils/routeTransition）两端的几何一致。 */
function kbHeaderStyle(accent: string): React.CSSProperties {
  return {
    padding: '24px 28px',
    marginBottom: 24,
    borderRadius: 14,
    border: '1px solid var(--jz-border)',
    background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 18%, var(--jz-surface)), var(--jz-surface))`,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  };
}
function kbHeaderIconStyle(accent: string): React.CSSProperties {
  return {
    width: 56,
    height: 56,
    borderRadius: 14,
    background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 60%, white))`,
    color: '#fff',
    display: 'grid',
    placeItems: 'center',
    fontSize: 24,
    boxShadow: `0 8px 24px color-mix(in srgb, ${accent} 30%, transparent)`,
  };
}

function postHref(postSlug: string, kbSlug?: string) {
  const path = `/posts/${encodeURIComponent(postSlug)}`;
  return kbSlug ? `${path}?kb=${encodeURIComponent(kbSlug)}` : path;
}

export default function KBPostsPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  /** 书卡点击先行带来的 KB 名/accent（route state）——数据未落地时先渲染
   * 页头壳，给共享元素过渡一个承接端；直接访问 URL 时为空、走旧 Spin。 */
  const routeSeed = (location.state ?? {}) as { kbName?: string; kbAccent?: string | null };
  // 路由 VT 的 new 快照等待首帧提交（无过渡进行时为 no-op）
  useLayoutEffect(() => {
    signalRouteReady();
  }, []);
  const [tree, setTree] = useState<PublicKBTree | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [docForm] = Form.useForm<{ title: string; content_kind: NewDocContentKind }>();
  const batchInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  /** The blog frontend lazy-loads auth so anonymous readers stay anonymous;
   * but once known, super-admins get inline create/upload affordances. */
  const authLoaded = useAuthStore((s) => s.loaded);
  const loadSession = useAuthStore((s) => s.loadSession);
  useEffect(() => {
    if (!authLoaded) void loadSession();
  }, [authLoaded, loadSession]);
  const canManage = !!tree?.can_manage;

  useEffect(() => {
    if (!slug) return;
    setTree(null);
    setNotFound(false);
    kbsApi
      .getPublicKBTree(slug)
      .then(setTree)
      .catch(() => setNotFound(true));
  }, [slug]);

  /** Refresh helper used after admin-only mutations (create/upload). */
  const reload = () => {
    if (!slug) return;
    void kbsApi.getPublicKBTree(slug).then(setTree).catch(() => undefined);
  };

  async function handleCreateDoc() {
    let values;
    try {
      values = await docForm.validateFields();
    } catch {
      return;
    }
    if (!tree) return;
    setCreating(true);
    try {
      const isHtml = values.content_kind === 'html';
      const created = await docsApi.createDocument({
        knowledge_base: tree.id,
        folder: null,
        title: values.title,
        raw_content: isHtml ? NEW_HTML_DOCUMENT_TEMPLATE : '',
      });
      setNewDocOpen(false);
      docForm.resetFields();
      message.success('文档已创建，前往编辑');
      const returnQ = `return=${encodeURIComponent(`/kb/${slug}`)}`;
      const modeQ = isHtml ? '&mode=html' : '';
      navigate(`/admin/kbs/${tree.id}/docs/${created.id}?${returnQ}${modeQ}`);
    } catch (err) {
      message.error(formatApiError(err, '新建文档失败'));
    } finally {
      setCreating(false);
    }
  }

  /**
   * 统一上传入口（与个人空间同一套规则）：文件选择器（单/多）、文件夹选择器、
   * 拖拽混合上传全部走这里。客户端先过滤（类型/大小/隐藏文件），再分片顺序
   * 上传 —— 每片完成立即 reload，文章渐进出现。
   * ``openSingle`` 为 true 且恰好导入 1 篇时保留旧行为：直接进编辑器。
   */
  async function handleUpload(collected: CollectedUploads, openSingle = false) {
    if (!tree) return;
    if (collected.skipped.length) message.warning(skippedSummary(collected.skipped));
    if (collected.items.length === 0) {
      if (!collected.skipped.length) message.info('没有可上传的文件');
      return;
    }
    setUploading(true);
    setUploadProgress({ loaded: 0, total: 1 });
    try {
      const result = await runChunkedImport(collected.items, tree.id, null, {
        onProgress: (loaded, total) => setUploadProgress({ loaded, total }),
        onChunkDone: () => reload(),
      });
      notifyImportResult(result);
      if (openSingle && collected.items.length === 1 && result.created.length === 1) {
        navigate(
          `/admin/kbs/${tree.id}/docs/${result.created[0].id}?return=${encodeURIComponent(`/kb/${slug}`)}`
        );
      }
    } finally {
      setUploading(false);
      setUploadProgress(null);
      // 兜底再刷一次 —— 分片中途异常也能看到已落库的文档。
      reload();
    }
  }

  if (notFound) {
    return <Result status="404" title="未找到该知识库" extra={<TransitionLink to="/">返回首页</TransitionLink>} />;
  }
  if (!tree) {
    const seedAccent = routeSeed.kbAccent || 'var(--jz-accent)';
    return (
      <div>
        {routeSeed.kbName ? (
          <>
            <Breadcrumb
              style={{ marginBottom: 16 }}
              items={[
                { title: <TransitionLink to="/"><HomeOutlined /> 首页</TransitionLink> },
                { title: routeSeed.kbName },
              ]}
            />
            <header style={kbHeaderStyle(seedAccent)}>
              <Space align="start" size="middle">
                <div style={kbHeaderIconStyle(seedAccent)}>
                  <BookOutlined />
                </div>
                <div>
                  <Title
                    level={2}
                    className="jz-post-title jz-kb-hero-title"
                    style={{ margin: 0, color: 'var(--jz-text)' }}
                  >
                    {routeSeed.kbName}
                  </Title>
                </div>
              </Space>
            </header>
          </>
        ) : null}
        <div aria-busy="true" aria-label="加载中" style={{ display: 'grid', gap: 12 }}>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="jz-skel" style={{ height: 64, borderRadius: 12 }} />
          ))}
        </div>
      </div>
    );
  }

  const accent = tree.accent_color || 'var(--jz-accent)';

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <TransitionLink to="/"><HomeOutlined /> 首页</TransitionLink> },
          { title: tree.name },
        ]}
      />
      <header style={kbHeaderStyle(accent)}>
        <Space align="start" size="middle">
          <div style={kbHeaderIconStyle(accent)}>
            <BookOutlined />
          </div>
          <div>
            <Title
              level={2}
              className="jz-post-title jz-kb-hero-title"
              style={{ margin: 0, color: 'var(--jz-text)' }}
            >
              {tree.name}
            </Title>
            {tree.description && (
              <Paragraph type="secondary" style={{ margin: '6px 0 8px' }}>
                {tree.description}
              </Paragraph>
            )}
            <Space size={6} wrap>
              {tree.tags.map((t) => (
                <Tag key={t.id} color={resolveTagColor(t)} className="jz-post-tag">
                  {t.name}
                </Tag>
              ))}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                共 {tree.documents.length} 篇
              </Typography.Text>
            </Space>
          </div>
        </Space>

        {canManage && (
          <Space wrap>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setNewDocOpen(true)}
            >
              新建文档
            </Button>
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'files',
                    icon: <FileAddOutlined />,
                    label: '上传文件（单个或多选）',
                    onClick: () => batchInputRef.current?.click(),
                  },
                  {
                    key: 'folder',
                    icon: <FolderAddOutlined />,
                    label: '上传文件夹（保留目录结构）',
                    onClick: () => folderInputRef.current?.click(),
                  },
                  {
                    key: 'hint',
                    disabled: true,
                    label: (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        也可直接拖拽文件 / 多个文件夹到文章列表
                      </Typography.Text>
                    ),
                  },
                ],
              }}
            >
              <Button icon={<CloudUploadOutlined />} loading={uploading}>
                {uploadProgress
                  ? uploadProgress.loaded >= uploadProgress.total
                    ? '服务器处理中…'
                    : `上传中 ${Math.round((uploadProgress.loaded / uploadProgress.total) * 100)}%`
                  : '上传 ▾'}
              </Button>
            </Dropdown>
            <TransitionLink to={`/admin/kbs/${tree.id}`}>
              <Button>个人空间</Button>
            </TransitionLink>
            <input
              ref={batchInputRef}
              type="file"
              multiple
              accept={UPLOAD_ACCEPT}
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files.length) {
                  // 恰好选 1 个文件时沿用旧行为：导入完成直接进编辑器。
                  void handleUpload(
                    collectPickedFiles(e.target.files, false),
                    e.target.files.length === 1
                  );
                }
                e.target.value = '';
              }}
            />
            <input
              ref={folderInputRef}
              type="file"
              multiple
              // @ts-expect-error — webkitdirectory is non-standard but widely supported.
              webkitdirectory="true"
              directory="true"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files.length) {
                  void handleUpload(collectPickedFiles(e.target.files, true));
                }
                e.target.value = '';
              }}
            />
          </Space>
        )}
      </header>

      {uploadProgress && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 14px',
            marginBottom: 16,
            borderRadius: 12,
            border: '1px solid var(--jz-border, rgba(0,0,0,0.08))',
            background: 'var(--jz-card-bg, rgba(255,255,255,0.6))',
          }}
        >
          <CloudUploadOutlined style={{ color: accent }} />
          <Typography.Text style={{ whiteSpace: 'nowrap' }}>
            {uploadProgress.loaded >= uploadProgress.total
              ? '已上传，服务器解析中…'
              : '上传中…'}
          </Typography.Text>
          <Progress
            style={{ flex: 1, margin: 0 }}
            percent={Math.round((uploadProgress.loaded / uploadProgress.total) * 100)}
            status="active"
            strokeColor={accent}
          />
        </div>
      )}

      <Modal
        open={newDocOpen}
        title="新建文档"
        onCancel={() => setNewDocOpen(false)}
        onOk={handleCreateDoc}
        confirmLoading={creating}
        okText="创建并编辑"
        cancelText="取消"
      >
        <Form form={docForm} layout="vertical" initialValues={{ content_kind: 'markdown' }}>
          <Form.Item label="标题" name="title" rules={[{ required: true }]}>
            <Input autoFocus placeholder="如：第三章 · 一夜的春风" />
          </Form.Item>
          <Form.Item label="文档类型" name="content_kind">
            <Radio.Group>
              <Radio value="markdown">Markdown</Radio>
              <Radio value="html">HTML</Radio>
            </Radio.Group>
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            创建后会自动跳转到编辑器，保存并发布后即可在博客前台看到。
          </Typography.Text>
        </Form>
      </Modal>

      <UploadDropZone
        disabled={!canManage}
        accent={accent}
        onDropFiles={(c) => void handleUpload(c)}
      >
        <KbBody tree={tree} onTreeChange={setTree} />
      </UploadDropZone>
    </div>
  );
}

type GroupView = 'folders' | 'flat';
type Density = 'list' | 'summary';

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 560;
const SIDEBAR_DEFAULT = 240;

/**
 * Body of the KB page — renders a folder tree on the left and the article
 * cards on the right. When the KB has no folders at all we fall back to a
 * simple flat list so newer KBs don't get a half-empty sidebar.
 */
function KbBody({
  tree,
  onTreeChange,
}: {
  tree: PublicKBTree;
  onTreeChange: (t: PublicKBTree) => void;
}) {
  /** Card-grouping mode toggle, persisted per-browser:
   * - ``folders``: each folder is its own section with the docs it contains
   * - ``flat``: one stream of all docs, regardless of folder
   * Persisted under a KB-scoped key so each library remembers its own
   * preference. */
  /* v2: preferences are now persisted ONLY on explicit user toggles (see
   * changeView/changeDensity below) — the old mount effect auto-wrote the
   * current value, freezing the computed default (folders-if-any) for every
   * first-time visitor and making later default changes unreachable. The view
   * key is bumped so those frozen auto-writes are discarded (cost: past manual
   * choices reset once, same deal as the density v2 bump). */
  const groupKey = `jz-kb-view-v2:${tree.slug}`;
  const densityKey = `jz-kb-density-v2:${tree.slug}`;
  const sidebarKey = `jz-kb-side-w:${tree.slug}`;

  const initialView = (() => {
    try {
      const v = localStorage.getItem(groupKey);
      if (v === 'folders' || v === 'flat') return v;
    } catch {
      /* ignore */
    }
    return (tree.folders?.length ?? 0) > 0 ? 'folders' : 'flat';
  })();
  const initialDensity = (() => {
    try {
      const v = localStorage.getItem(densityKey);
      if (v === 'list' || v === 'summary') return v;
    } catch {
      /* ignore */
    }
    return 'list' as Density;
  })();
  const initialSidebar = (() => {
    try {
      const v = Number(localStorage.getItem(sidebarKey));
      if (Number.isFinite(v) && v >= SIDEBAR_MIN && v <= SIDEBAR_MAX) return v;
    } catch {
      /* ignore */
    }
    return SIDEBAR_DEFAULT;
  })();

  const [view, setView] = useState<GroupView>(initialView as GroupView);
  const [density, setDensity] = useState<Density>(initialDensity as Density);
  const [sidebarWidth, setSidebarWidth] = useState<number>(initialSidebar);
  /** While the user is dragging the divider we suppress text selection +
   * iframe pointer events on the rest of the page so the cursor doesn't get
   * trapped by a Tippy popover or PDF canvas. */
  const [dragging, setDragging] = useState(false);

  /* 只在用户显式操作时写入偏好 —— 挂载自动回写会把「计算出的默认值」冻结成
   * 「用户的选择」，之后任何默认值调整对回访者永久失效（密度默认值事故同源，
   * 见 CLAUDE.md 陷阱区）。新偏好项一律沿用本模式。 */
  const persistPref = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch { /* ignore */ }
  };
  const changeView = (v: GroupView) => {
    setView(v);
    persistPref(groupKey, v);
  };
  const changeDensity = (d: Density) => {
    setDensity(d);
    persistPref(densityKey, d);
  };
  const changeSidebar = (w: number) => {
    setSidebarWidth(w);
    persistPref(sidebarKey, String(w));
  };
  /** 拖拽期间只更新 state，松手时一次性持久化（onMove 里写 localStorage 太吵）。 */
  const dragWidthRef = useRef<number | null>(null);

  // Drag-resize the sidebar. We attach the move/up listeners to ``document``
  // so a fast drag past the divider doesn't lose the gesture.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      // The grid container starts at the left edge of the page content padding.
      // We measure from the wrapper to stay accurate when the layout reflows.
      const wrapper = document.getElementById('jz-kb-body');
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, e.clientX - rect.left));
      dragWidthRef.current = next;
      setSidebarWidth(next);
    };
    const onUp = () => {
      if (dragWidthRef.current != null) {
        persistPref(sidebarKey, String(dragWidthRef.current));
        dragWidthRef.current = null;
      }
      setDragging(false);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging]);

  const hasFolders = (tree.folders?.length ?? 0) > 0;

  if (tree.documents.length === 0) {
    return (
      <div
        id="jz-kb-body"
        className="jz-kb-body"
        style={{
          display: 'grid',
          gridTemplateColumns: `${sidebarWidth}px 6px 1fr`,
          gap: 0,
          alignItems: 'start',
        }}
      >
        <aside className="jz-kb-side">
          <BlogKbNavPanel kbSlug={tree.slug} tree={tree} onTreeChange={onTreeChange} />
        </aside>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="拖拽调整目录宽度（双击重置）"
          tabIndex={0}
          className={'jz-kb-resizer' + (dragging ? ' is-dragging' : '')}
          onMouseDown={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDoubleClick={() => changeSidebar(SIDEBAR_DEFAULT)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              changeSidebar(Math.max(SIDEBAR_MIN, sidebarWidth - 16));
            } else if (e.key === 'ArrowRight') {
              changeSidebar(Math.min(SIDEBAR_MAX, sidebarWidth + 16));
            }
          }}
        />
        <div style={{ paddingLeft: 18, minWidth: 0 }}>
          <Empty description="还没有公开文章" />
        </div>
      </div>
    );
  }

  return (
    <div
      id="jz-kb-body"
      className="jz-kb-body"
      style={{
        display: 'grid',
        gridTemplateColumns: `${sidebarWidth}px 6px 1fr`,
        gap: 0,
        alignItems: 'start',
      }}
    >
      <aside className="jz-kb-side">
        <BlogKbNavPanel kbSlug={tree.slug} tree={tree} onTreeChange={onTreeChange} />
      </aside>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="拖拽调整目录宽度（双击重置）"
        tabIndex={0}
        className={'jz-kb-resizer' + (dragging ? ' is-dragging' : '')}
        onMouseDown={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            setSidebarWidth((w) => Math.max(SIDEBAR_MIN, w - 16));
          } else if (e.key === 'ArrowRight') {
            setSidebarWidth((w) => Math.min(SIDEBAR_MAX, w + 16));
          }
        }}
      />

      <div style={{ paddingLeft: 18, minWidth: 0 }}>
        <div className="jz-kb-toolbar">
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            共 {tree.documents.length} 篇文档
          </Typography.Text>
          <div style={{ flex: 1 }} />
          <Space size={4}>
            <Tooltip title="按文件夹分组">
              <Button
                size="small"
                type={view === 'folders' ? 'primary' : 'default'}
                icon={<UnorderedListOutlined />}
                onClick={() => changeView('folders')}
                aria-label="按文件夹分组"
              />
            </Tooltip>
            <Tooltip title="平铺所有文章">
              <Button
                size="small"
                type={view === 'flat' ? 'primary' : 'default'}
                icon={<AppstoreOutlined />}
                onClick={() => changeView('flat')}
                aria-label="平铺所有文章"
              />
            </Tooltip>
          </Space>
          <Space size={4}>
            <Tooltip title="摘要视图（标题 + 标签 + 摘要 + 时间）">
              <Button
                size="small"
                type={density === 'summary' ? 'primary' : 'text'}
                icon={<ProfileOutlined />}
                onClick={() => changeDensity('summary')}
              >
                摘要
              </Button>
            </Tooltip>
            <Tooltip title="列表视图（标题 + 标签）">
              <Button
                size="small"
                type={density === 'list' ? 'primary' : 'text'}
                icon={<FileTextOutlined />}
                onClick={() => changeDensity('list')}
              >
                列表
              </Button>
            </Tooltip>
          </Space>
        </div>

        {view === 'flat' || !hasFolders ? (
          <PostList posts={tree.documents} density={density} kbSlug={tree.slug} />
        ) : (
          <Space direction="vertical" size={28} style={{ width: '100%' }}>
            {(tree.folders ?? []).map((f) => (
              <FolderGroup key={f.id} folder={f} depth={0} density={density} kbSlug={tree.slug} />
            ))}
            {(tree.root_documents ?? []).length > 0 && (
              <section>
                <h3 className="jz-kb-folder-heading">
                  <span className="jz-kb-folder-heading-mark" aria-hidden />
                  根目录
                  <span className="jz-kb-folder-count">{(tree.root_documents ?? []).length}</span>
                </h3>
                <PostList posts={tree.root_documents ?? []} density={density} kbSlug={tree.slug} />
              </section>
            )}
          </Space>
        )}
      </div>
    </div>
  );
}

/** Wrapper that picks summary-card vs compact-row rendering for a list of posts. */
function PostList({
  posts,
  density,
  kbSlug,
}: {
  posts: PublicPost[];
  density: Density;
  kbSlug?: string;
}) {
  if (density === 'list') {
    return (
      <ul className="jz-post-list">
        {posts.map((p) => (
          <PostRow key={p.id} post={p} kbSlug={kbSlug} />
        ))}
      </ul>
    );
  }
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {posts.map((p) => (
        <PostCard key={p.id} post={p} kbSlug={kbSlug} />
      ))}
    </Space>
  );
}

/** Recursive renderer for a single folder + its docs, plus nested subfolders. */
function FolderGroup({
  folder,
  depth,
  density,
  kbSlug,
}: {
  folder: PublicFolder;
  depth: number;
  density: Density;
  kbSlug?: string;
}) {
  const totalDocs =
    folder.documents.length +
    folder.children.reduce(function rec(n, c): number {
      return n + c.documents.length + c.children.reduce(rec, 0);
    }, 0);

  return (
    <section style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
      <h3
        className="jz-kb-folder-heading"
        style={{ fontSize: depth === 0 ? 18 : 16 }}
      >
        <span className="jz-kb-folder-heading-mark" aria-hidden />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>{folder.name}</span>
          {(folder.tags ?? []).map((t) => (
            <Tag
              key={t.id}
              color={resolveTagColor(t)}
              className="jz-folder-tag jz-post-tag"
              style={{ fontWeight: 400, letterSpacing: 0 }}
            >
              {t.name}
            </Tag>
          ))}
        </span>
        <span className="jz-kb-folder-count">{totalDocs}</span>
      </h3>
      {folder.documents.length > 0 && (
        <PostList posts={folder.documents} density={density} kbSlug={kbSlug} />
      )}
      {folder.children.length > 0 && (
        <Space direction="vertical" size={20} style={{ width: '100%', marginTop: 16 }}>
          {folder.children.map((c) => (
            <FolderGroup key={c.id} folder={c} depth={depth + 1} density={density} kbSlug={kbSlug} />
          ))}
        </Space>
      )}
    </section>
  );
}

/** Compact single-row rendering: title + tags, no excerpt. */
function PostRow({ post: p, kbSlug }: { post: PublicPost; kbSlug?: string }) {
  return (
    <li className="jz-post-row">
      <TransitionLink
        to={postHref(p.slug, kbSlug)}
        className="jz-post-row-link"
      >
        <span className="jz-post-row-title" title={p.title}>{p.title}</span>
        <DocFormatTag format={p.doc_format} size="default" />
        {p.tags.length > 0 && (
          <span className="jz-post-row-tags">
            {p.tags.map((t) => (
              <Tag
                key={t.id}
                color={resolveTagColor(t)}
                className="jz-post-tag"
                style={{ marginInlineEnd: 0 }}
              >
                {t.name}
              </Tag>
            ))}
          </span>
        )}
        <span className="jz-post-row-date">
          {dayjs(p.published_at).format('YYYY-MM-DD')}
        </span>
      </TransitionLink>
    </li>
  );
}

/** Single article card — extracted so both the flat and grouped views share it. */
function PostCard({ post: p, kbSlug }: { post: PublicPost; kbSlug?: string }) {
  return (
    <Card
      className="jz-card jz-fade-in jz-post-card"
      hoverable
      style={{ borderRadius: 12 }}
    >
      <TransitionLink
        to={postHref(p.slug, kbSlug)}
        style={{ color: 'inherit', textDecoration: 'none' }}
      >
        <Title
          level={4}
          className="jz-post-card-title"
          style={{ marginTop: 0, marginBottom: 6, color: 'var(--jz-text)' }}
        >
          <Space size={8}>
            <span>{p.title}</span>
            <DocFormatTag format={p.doc_format} size="default" />
          </Space>
        </Title>
      </TransitionLink>
      <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 8 }}>
        {p.excerpt || '（无摘要）'}
      </Paragraph>
      <Space size={8} wrap split={<span style={{ color: 'var(--jz-divider)' }}>·</span>}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {dayjs(p.published_at).format('YYYY-MM-DD HH:mm')}
        </Typography.Text>
        {p.tags.length > 0 && (
          <Space size={4}>
            {p.tags.map((t) => (
              <Tag key={t.id} color={resolveTagColor(t)} className="jz-post-tag">
                {t.name}
              </Tag>
            ))}
          </Space>
        )}
      </Space>
    </Card>
  );
}
