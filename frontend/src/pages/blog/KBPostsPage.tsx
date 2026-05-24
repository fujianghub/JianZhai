import { useEffect, useRef, useState } from 'react';
import {
  Breadcrumb,
  Button,
  Card,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Radio,
  Result,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
import * as attApi from '@/api/attachments';
import { formatApiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import type { PublicFolder, PublicKBTree, PublicPost } from '@/types';
import DocFormatTag from '@/components/common/DocFormatTag';
import BlogKbNavPanel from '@/components/common/BlogKbNavPanel';
import { resolveTagColor } from '@/utils/tagColor';
import {
  NEW_HTML_DOCUMENT_TEMPLATE,
  type NewDocContentKind,
} from '@/utils/htmlTemplate';

const { Title, Paragraph } = Typography;

function postHref(postSlug: string, kbSlug?: string) {
  const path = `/posts/${encodeURIComponent(postSlug)}`;
  return kbSlug ? `${path}?kb=${encodeURIComponent(kbSlug)}` : path;
}

export default function KBPostsPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [tree, setTree] = useState<PublicKBTree | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docForm] = Form.useForm<{ title: string; content_kind: NewDocContentKind }>();
  const singleInputRef = useRef<HTMLInputElement | null>(null);
  const batchInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  /** The blog frontend lazy-loads auth so anonymous readers stay anonymous;
   * but once known, super-admins get inline create/upload affordances. */
  const authUser = useAuthStore((s) => s.user);
  const authLoaded = useAuthStore((s) => s.loaded);
  const loadSession = useAuthStore((s) => s.loadSession);
  useEffect(() => {
    if (!authLoaded) void loadSession();
  }, [authLoaded, loadSession]);
  const canManage = !!authUser?.is_superuser;

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

  async function handleSingleUpload(file: File) {
    if (!tree) return;
    setUploading(true);
    try {
      const doc = await attApi.importFileAsDoc(file, tree.id, null);
      message.success(`已导入 ${file.name}`);
      navigate(`/admin/kbs/${tree.id}/docs/${doc.id}?return=${encodeURIComponent(`/kb/${slug}`)}`);
    } catch (err) {
      message.error(formatApiError(err, '导入失败'));
    } finally {
      setUploading(false);
    }
  }

  async function handleBatchUpload(files: FileList | File[], preserveTree: boolean) {
    if (!tree) return;
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setUploading(true);
    try {
      const items: attApi.BatchImportItem[] = arr.map((f) => ({
        file: f,
        relativePath: preserveTree
          ? (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
          : '',
      }));
      const result = await attApi.importBatch(items, tree.id, null);
      reload();
      const msg = `已导入 ${result.created.length} 个文件` +
        (result.folders_created ? ` · 创建 ${result.folders_created} 个文件夹` : '') +
        (result.errors.length ? ` · ${result.errors.length} 个失败` : '');
      if (result.errors.length) message.warning(msg);
      else message.success(msg);
    } catch (err) {
      message.error(formatApiError(err, '批量上传失败'));
    } finally {
      setUploading(false);
    }
  }

  if (notFound) {
    return <Result status="404" title="未找到该知识库" extra={<Link to="/">返回首页</Link>} />;
  }
  if (!tree) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 300 }}>
        <Spin />
      </div>
    );
  }

  const accent = tree.accent_color || 'var(--jz-accent)';

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/"><HomeOutlined /> 首页</Link> },
          { title: tree.name },
        ]}
      />
      <header
        style={{
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
        }}
      >
        <Space align="start" size="middle">
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 60%, white))`,
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontSize: 24,
              boxShadow: `0 8px 24px color-mix(in srgb, ${accent} 30%, transparent)`,
            }}
          >
            <BookOutlined />
          </div>
          <div>
            <Title level={2} className="jz-post-title" style={{ margin: 0, color: 'var(--jz-text)' }}>
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
                    key: 'single',
                    icon: <FileAddOutlined />,
                    label: '上传单个文件',
                    onClick: () => singleInputRef.current?.click(),
                  },
                  {
                    key: 'batch',
                    icon: <CloudUploadOutlined />,
                    label: '批量上传文件',
                    onClick: () => batchInputRef.current?.click(),
                  },
                  {
                    key: 'folder',
                    icon: <FolderAddOutlined />,
                    label: '上传整个文件夹',
                    onClick: () => folderInputRef.current?.click(),
                  },
                ],
              }}
            >
              <Button icon={<CloudUploadOutlined />} loading={uploading}>
                上传 ▾
              </Button>
            </Dropdown>
            <Link to={`/admin/kbs/${tree.id}`}>
              <Button>在后台管理</Button>
            </Link>
            <input
              ref={singleInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.html,.htm,.md,.markdown,.txt,.jpg,.jpeg,.png,.gif,.webp,.svg,.zip,.csv,.json,.xml"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleSingleUpload(f);
                e.target.value = '';
              }}
            />
            <input
              ref={batchInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.html,.htm,.md,.markdown,.txt,.jpg,.jpeg,.png,.gif,.webp,.svg,.zip,.csv,.json,.xml"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files.length) {
                  void handleBatchUpload(e.target.files, false);
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
                  void handleBatchUpload(e.target.files, true);
                }
                e.target.value = '';
              }}
            />
          </Space>
        )}
      </header>

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

      <KbBody tree={tree} />
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
function KbBody({ tree }: { tree: PublicKBTree }) {
  /** Card-grouping mode toggle, persisted per-browser:
   * - ``folders``: each folder is its own section with the docs it contains
   * - ``flat``: one stream of all docs, regardless of folder
   * Persisted under a KB-scoped key so each library remembers its own
   * preference. */
  const groupKey = `jz-kb-view:${tree.slug}`;
  const densityKey = `jz-kb-density:${tree.slug}`;
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
    return 'summary' as Density;
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

  useEffect(() => {
    try {
      localStorage.setItem(groupKey, view);
    } catch { /* ignore */ }
  }, [groupKey, view]);
  useEffect(() => {
    try {
      localStorage.setItem(densityKey, density);
    } catch { /* ignore */ }
  }, [densityKey, density]);
  useEffect(() => {
    try {
      localStorage.setItem(sidebarKey, String(sidebarWidth));
    } catch { /* ignore */ }
  }, [sidebarKey, sidebarWidth]);

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
      setSidebarWidth(next);
    };
    const onUp = () => setDragging(false);
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
          <BlogKbNavPanel kbSlug={tree.slug} />
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
        <BlogKbNavPanel kbSlug={tree.slug} />
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
                onClick={() => setView('folders')}
                aria-label="按文件夹分组"
              />
            </Tooltip>
            <Tooltip title="平铺所有文章">
              <Button
                size="small"
                type={view === 'flat' ? 'primary' : 'default'}
                icon={<AppstoreOutlined />}
                onClick={() => setView('flat')}
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
                onClick={() => setDensity('summary')}
              >
                摘要
              </Button>
            </Tooltip>
            <Tooltip title="列表视图（标题 + 标签）">
              <Button
                size="small"
                type={density === 'list' ? 'primary' : 'text'}
                icon={<FileTextOutlined />}
                onClick={() => setDensity('list')}
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
      <Link
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
      </Link>
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
      <Link
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
      </Link>
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
