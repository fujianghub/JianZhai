import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Collapse,
  Form,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { message } from '@/utils/notify';
import {
  BookOutlined,
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
  FolderOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import TransitionLink from '@/components/common/TransitionLink';
import * as kbsApi from '@/api/kbs';
import * as usersApi from '@/api/users';
import { formatApiError } from '@/api/client';
import type {
  AudienceMode,
  KBCategory,
  KnowledgeBase,
  User,
  UserTag,
  Visibility,
} from '@/types';
import ExportDialog from '@/components/common/ExportDialog';
import TagPicker from '@/components/common/TagPicker';
import ColorField from '@/components/common/ColorField';
import AudienceControl from '@/components/admin/AudienceControl';
import { resolveTagColor } from '@/utils/tagColor';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { useAuthStore } from '@/stores/auth';
import JzEmpty from '@/components/common/JzEmpty';
import { SepDot } from '@/components/common/symbols';
import IconButton from '@/components/common/IconButton';
import { ICON_SIZE } from '@/components/common/iconSize';
import {
  JzCardViewIcon,
  JzCollapseAllIcon,
  JzExpandAllIcon,
  JzFlatViewIcon,
  JzGroupViewIcon,
  JzRowsViewIcon,
  JzSearchIcon,
} from '@/components/common/JzIcon';
import {
  filterKbs,
  groupKbs,
  isFiltering,
  KB_GROUP_KEY,
  KB_GROUP_MODES,
  KB_SORT_KEY,
  KB_SORT_KEYS,
  KB_VIEW_KEY,
  KB_VIEW_MODES,
  loadChoice,
  loadFolds,
  saveChoice,
  saveFolds,
  sortKbs,
  type KbGroupMode,
  type KbSection,
  type KbSortKey,
  type KbViewMode,
  type KbVisFilter,
} from '@/utils/adminKbList';

const { Paragraph, Text } = Typography;

const SORT_OPTIONS: Array<{ value: KbSortKey; label: string }> = [
  { value: 'default', label: '默认顺序' },
  { value: 'updated', label: '最近更新' },
  { value: 'docs', label: '篇数最多' },
  { value: 'name', label: '名称' },
];

const AUDIENCE_LABEL: Record<string, string> = {
  exclude: '部分读者不可见（黑名单）',
  include: '仅指定读者可见（白名单）',
};

function fmtDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = dayjs(iso);
  if (!d.isValid()) return '';
  return d.year() === dayjs().year() ? d.format('MM-DD') : d.format('YYYY-MM-DD');
}

type AudienceFormValues = {
  audience_mode?: AudienceMode;
  audience_user_ids?: number[];
  audience_tag_ids?: number[];
};

type KBFormValues = {
  name: string;
  description: string;
  visibility: Visibility;
  accent_color?: string;
  cover_image?: string;
  category_id?: number | null;
} & AudienceFormValues;

type CategoryFormValues = {
  name: string;
  description?: string;
  accent_color?: string;
} & AudienceFormValues;

export default function KBListPage() {
  const navigate = useNavigate();
  // Deleting a KB / category is root-only (irreversible structural change);
  // hide the buttons for non-root authors. Backend enforces the real gate.
  const isRoot = !!useAuthStore((s) => s.user?.is_root);
  const [items, setItems] = useState<KnowledgeBase[]>([]);
  const [categories, setCategories] = useState<KBCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createForm] = Form.useForm<KBFormValues>();
  const [editForm] = Form.useForm<KBFormValues>();
  const [exportTarget, setExportTarget] = useState<KnowledgeBase | null>(null);
  const [editing, setEditing] = useState<KnowledgeBase | null>(null);
  const [categoryModal, setCategoryModal] = useState(false);
  const [categoryForm] = Form.useForm<CategoryFormValues>();
  const [editingCategory, setEditingCategory] = useState<KBCategory | null>(null);
  // Audience targeting options (WeChat-Moments visibility): readers + user tags.
  const [audienceUsers, setAudienceUsers] = useState<User[]>([]);
  const [userTags, setUserTags] = useState<UserTag[]>([]);
  /** 新建时预填的大类（分组头「在此新建」）。 */
  const [createCategory, setCreateCategory] = useState<number | null>(null);

  // 视图偏好：只在显式操作时写入（冻结默认值陷阱，见 utils/adminKbList.ts）。
  const [view, setView] = useState<KbViewMode>(() => loadChoice(KB_VIEW_KEY, KB_VIEW_MODES, 'card'));
  const [groupMode, setGroupMode] = useState<KbGroupMode>(() =>
    loadChoice(KB_GROUP_KEY, KB_GROUP_MODES, 'category'),
  );
  const [sort, setSort] = useState<KbSortKey>(() => loadChoice(KB_SORT_KEY, KB_SORT_KEYS, 'default'));
  const [folds, setFolds] = useState<Set<string>>(loadFolds);
  // 筛选不持久化；筛选期间的折叠是临时的，不污染已保存的折叠状态。
  const [q, setQ] = useState('');
  const [vis, setVis] = useState<KbVisFilter>('all');
  const [searchFolds, setSearchFolds] = useState<Set<string>>(new Set());

  async function refresh() {
    setLoading(true);
    try {
      const [kbs, cats] = await Promise.all([kbsApi.listKBs(), kbsApi.listKBCategories()]);
      setItems(kbs);
      setCategories(cats);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // Audience pickers need the reader + tag vocabulary; load once. Failures
    // are non-fatal (the KB form still works, just without targeting options).
    void (async () => {
      try {
        const [u, t] = await Promise.all([usersApi.listUsers(), usersApi.listUserTags()]);
        // Only readers are targetable — authors (admin/root) share the whole
        // content pool and always bypass audience filtering, so offering them
        // here would be a no-op (and confusing).
        setAudienceUsers(u.filter((x) => !x.is_staff && !x.is_superuser));
        setUserTags(t);
      } catch {
        /* non-fatal */
      }
    })();
  }, []);

  const filter = useMemo(() => ({ q, vis }), [q, vis]);
  const filtering = isFiltering(filter);
  useEffect(() => setSearchFolds(new Set()), [q, vis]);

  const visible = useMemo(() => sortKbs(filterKbs(items, filter), sort), [items, filter, sort]);
  const sections = useMemo(
    () => groupKbs(visible, categories, !filtering),
    [visible, categories, filtering],
  );
  const totalDocs = useMemo(() => items.reduce((n, kb) => n + (kb.document_count || 0), 0), [items]);

  const activeFolds = filtering ? searchFolds : folds;
  const activeKeys = sections.filter((s) => !activeFolds.has(s.key)).map((s) => s.key);
  const anyExpanded = activeKeys.length > 0;

  function applyFolds(next: Set<string>) {
    if (filtering) {
      setSearchFolds(next);
    } else {
      setFolds(next);
      saveFolds(next);
    }
  }
  function onCollapseChange(keys: string | string[]) {
    const open = new Set(Array.isArray(keys) ? keys : [keys]);
    // 只改动当前可见分组的折叠位，保留其它（如空大类在筛选时隐藏）的已存状态。
    const next = new Set(activeFolds);
    for (const s of sections) {
      if (open.has(s.key)) next.delete(s.key);
      else next.add(s.key);
    }
    applyFolds(next);
  }
  function toggleAll() {
    const next = new Set(activeFolds);
    for (const s of sections) {
      if (anyExpanded) next.add(s.key);
      else next.delete(s.key);
    }
    applyFolds(next);
  }
  function changeView(v: KbViewMode) {
    setView(v);
    saveChoice(KB_VIEW_KEY, v);
  }
  function changeGroup(g: KbGroupMode) {
    setGroupMode(g);
    saveChoice(KB_GROUP_KEY, g);
  }
  function changeSort(s: KbSortKey) {
    setSort(s);
    saveChoice(KB_SORT_KEY, s);
  }
  function openCreate(categoryId: number | null = null) {
    setCreateCategory(categoryId);
    setCreating(true);
  }

  async function handleCreate() {
    let values: KBFormValues;
    try {
      values = await createForm.validateFields();
    } catch {
      return;
    }
    try {
      await kbsApi.createKB(values);
      message.success('已创建');
      setCreating(false);
      createForm.resetFields();
      void refresh();
    } catch (err) {
      message.error(formatApiError(err, '新建知识库失败'));
    }
  }

  async function handleSaveEdit() {
    if (!editing) return;
    let values: KBFormValues;
    try {
      values = await editForm.validateFields();
    } catch {
      return;
    }
    try {
      await kbsApi.updateKB(editing.id, values);
      message.success('已保存');
      setEditing(null);
      void refresh();
    } catch (err) {
      message.error(formatApiError(err, '保存失败'));
    }
  }

  function openEdit(kb: KnowledgeBase) {
    setEditing(kb);
    editForm.setFieldsValue({
      name: kb.name,
      description: kb.description,
      visibility: kb.visibility,
      accent_color: kb.accent_color || '#10b981',
      cover_image: kb.cover_image,
      category_id: kb.category?.id ?? null,
      audience_mode: kb.audience_mode ?? 'all',
      audience_user_ids: (kb.audience_users ?? []).map((u) => u.id),
      audience_tag_ids: (kb.audience_tags ?? []).map((t) => t.id),
    });
  }

  async function handleDelete(id: number) {
    try {
      await kbsApi.deleteKB(id);
      message.success('已删除');
      void refresh();
    } catch (err) {
      message.error(formatApiError(err, '删除失败'));
    }
  }

  async function handleSaveCategory() {
    let values;
    try {
      values = await categoryForm.validateFields();
    } catch {
      return;
    }
    try {
      if (editingCategory) {
        await kbsApi.updateKBCategory(editingCategory.id, values);
        message.success('大类已更新');
      } else {
        await kbsApi.createKBCategory(values);
        message.success('大类已创建');
      }
      setCategoryModal(false);
      setEditingCategory(null);
      categoryForm.resetFields();
      void refresh();
    } catch (err) {
      message.error(formatApiError(err, '保存大类失败'));
    }
  }

  function renderAudienceTag(kb: KnowledgeBase) {
    const mode = kb.audience_mode;
    if (!mode || mode === 'all') return null;
    return (
      <Tooltip title={AUDIENCE_LABEL[mode]}>
        <Tag className="jz-admin-kb-audience" onClick={() => openEdit(kb)}>
          定向
        </Tag>
      </Tooltip>
    );
  }

  function renderVisibilityTag(kb: KnowledgeBase) {
    return (
      <Tag
        color={kb.visibility === 'public' ? 'green' : 'default'}
        style={{ cursor: 'pointer', marginInlineEnd: 0 }}
        onClick={() => openEdit(kb)}
      >
        {kb.visibility === 'public' ? '公开' : '私密'}
      </Tag>
    );
  }

  function renderKbBadge(kb: KnowledgeBase, small = false) {
    const accent = kb.accent_color || 'var(--jz-accent)';
    return (
      <span
        className={'jz-admin-kb-badge' + (small ? ' is-sm' : '')}
        style={{ ['--kb-accent' as string]: accent }}
        aria-hidden
      >
        <BookOutlined />
      </span>
    );
  }

  function renderKbCard(kb: KnowledgeBase) {
    const accent = kb.accent_color || 'var(--jz-accent)';
    return (
      <Card
        key={kb.id}
        className="jz-card jz-fade-in jz-kb-card"
        style={{ borderTop: `4px solid ${accent}`, borderRadius: 12 }}
        title={
          <span className="jz-admin-kb-card-title">
            {renderKbBadge(kb)}
            <TransitionLink to={`/admin/kbs/${kb.id}`} className="jz-admin-kb-card-name" title={kb.name}>
              {kb.name}
            </TransitionLink>
          </span>
        }
        extra={
          <Space>
            <Tooltip title="编辑设置">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(kb)} aria-label="编辑知识库" />
            </Tooltip>
            <Tooltip title="导出">
              <Button size="small" icon={<ExportOutlined />} onClick={() => setExportTarget(kb)} aria-label="导出知识库" />
            </Tooltip>
            {isRoot && (
              <Popconfirm title="删除该知识库？" onConfirm={() => handleDelete(kb.id)}>
                <Button size="small" danger icon={<DeleteOutlined />} aria-label="删除知识库" />
              </Popconfirm>
            )}
          </Space>
        }
      >
        <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ minHeight: 44 }}>
          {kb.description || '（无描述）'}
        </Paragraph>
        {kb.tags.length > 0 && (
          <Space wrap size={6} style={{ marginBottom: 8 }}>
            {kb.tags.map((t) => (
              <Tag key={t.id} color={resolveTagColor(t)}>
                {t.name}
              </Tag>
            ))}
          </Space>
        )}
        <div className="jz-admin-kb-card-meta">
          <Space split={<SepDot />} size={6}>
            <Space size={4}>
              {renderVisibilityTag(kb)}
              {renderAudienceTag(kb)}
            </Space>
            <Text type="secondary">{kb.document_count} 篇</Text>
          </Space>
          {kb.updated_at && (
            <Text type="secondary" className="jz-admin-kb-date" title={dayjs(kb.updated_at).format('YYYY-MM-DD HH:mm')}>
              更新于 {fmtDate(kb.updated_at)}
            </Text>
          )}
        </div>
      </Card>
    );
  }

  function renderKbRow(kb: KnowledgeBase) {
    return (
      <div key={kb.id} className="jz-admin-kb-row" role="listitem">
        <div className="jz-admin-kb-row-main">
          {renderKbBadge(kb, true)}
          <div className="jz-admin-kb-row-text">
            <TransitionLink to={`/admin/kbs/${kb.id}`} className="jz-admin-kb-row-name">
              {kb.name}
            </TransitionLink>
            {kb.description && (
              <Text type="secondary" ellipsis={{ tooltip: kb.description }} className="jz-admin-kb-row-desc">
                {kb.description}
              </Text>
            )}
          </div>
        </div>
        <div className="jz-admin-kb-row-tags">
          {kb.tags.map((t) => (
            <Tag key={t.id} color={resolveTagColor(t)}>
              {t.name}
            </Tag>
          ))}
        </div>
        <div className="jz-admin-kb-row-vis">
          {renderVisibilityTag(kb)}
          {renderAudienceTag(kb)}
        </div>
        <Text type="secondary" className="jz-admin-kb-row-count">
          {kb.document_count} 篇
        </Text>
        <Text
          type="secondary"
          className="jz-admin-kb-row-date"
          title={kb.updated_at ? dayjs(kb.updated_at).format('YYYY-MM-DD HH:mm') : undefined}
        >
          {fmtDate(kb.updated_at)}
        </Text>
        <div className="jz-admin-kb-row-actions">
          <IconButton tooltip="编辑设置" icon={<EditOutlined />} onClick={() => openEdit(kb)} aria-label="编辑知识库" />
          <IconButton tooltip="导出" icon={<ExportOutlined />} onClick={() => setExportTarget(kb)} aria-label="导出知识库" />
          {isRoot && (
            <Popconfirm title="删除该知识库？" onConfirm={() => handleDelete(kb.id)}>
              <IconButton tone="danger" icon={<DeleteOutlined />} aria-label="删除知识库" />
            </Popconfirm>
          )}
        </div>
      </div>
    );
  }

  function renderKbs(kbs: KnowledgeBase[]) {
    if (view === 'list') {
      return (
        <div className="jz-admin-kb-list" role="list">
          <div className="jz-admin-kb-row is-head" aria-hidden>
            <span>知识库</span>
            <span>标签</span>
            <span>可见性</span>
            <span>篇数</span>
            <span>更新</span>
            <span />
          </div>
          {kbs.map(renderKbRow)}
        </div>
      );
    }
    return <div className="jz-admin-kb-grid">{kbs.map(renderKbCard)}</div>;
  }

  function renderSectionBody(section: KbSection) {
    if (section.kbs.length) return renderKbs(section.kbs);
    return (
      <JzEmpty size="sm" description="这个大类下还没有知识库">
        <Button size="small" icon={<PlusOutlined />} onClick={() => openCreate(section.category?.id ?? null)}>
          在此新建
        </Button>
      </JzEmpty>
    );
  }

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }));
  const showGrouped = groupMode === 'category';

  return (
    <div>
      <AdminPageHeader
        backTo="/admin"
        backLabel="工作台"
        title="知识库"
        meta={
          items.length > 0 ? (
            <Text type="secondary">
              {items.length} 个知识库 <SepDot /> {categories.length} 个大类 <SepDot /> {totalDocs} 篇
            </Text>
          ) : undefined
        }
        actions={
          <Space wrap>
            <Button icon={<FolderOutlined />} onClick={() => setCategoryModal(true)}>
              管理大类
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>
              新建知识库
            </Button>
          </Space>
        }
      />

      {items.length > 0 && (
        <div className="jz-kb-toolbar jz-admin-kb-toolbar">
          <Input
            allowClear
            className="jz-admin-kb-search"
            prefix={<JzSearchIcon size={ICON_SIZE.sm} />}
            placeholder="搜索名称 / 描述 / 标签 / 大类"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="搜索知识库"
          />
          <Segmented
            size="small"
            value={vis}
            onChange={(v) => setVis(v as KbVisFilter)}
            aria-label="可见性筛选"
            options={[
              { value: 'all', label: '全部' },
              { value: 'public', label: '公开' },
              { value: 'private', label: '私密' },
            ]}
          />
          <Select
            size="small"
            className="jz-admin-kb-sort"
            value={sort}
            onChange={changeSort}
            options={SORT_OPTIONS}
            aria-label="排序"
            popupMatchSelectWidth={false}
          />
          <span className="jz-admin-kb-toolbar-spacer" />
          <Segmented
            size="small"
            className="jz-kb-toolbar-seg"
            value={groupMode}
            onChange={(v) => changeGroup(v as KbGroupMode)}
            aria-label="分组"
            options={[
              { value: 'category', icon: <JzGroupViewIcon size={ICON_SIZE.md} />, label: '分组', title: '按大类分组' },
              { value: 'flat', icon: <JzFlatViewIcon size={ICON_SIZE.md} />, label: '平铺', title: '平铺所有知识库' },
            ]}
          />
          {showGrouped && sections.length > 0 && (
            <IconButton
              size="md"
              tooltip={anyExpanded ? '折叠全部大类' : '展开全部大类'}
              icon={anyExpanded ? <JzCollapseAllIcon size={ICON_SIZE.lg} /> : <JzExpandAllIcon size={ICON_SIZE.lg} />}
              onClick={toggleAll}
              aria-label={anyExpanded ? '折叠全部大类' : '展开全部大类'}
            />
          )}
          <Segmented
            size="small"
            className="jz-kb-toolbar-seg"
            value={view}
            onChange={(v) => changeView(v as KbViewMode)}
            aria-label="视图"
            options={[
              { value: 'card', icon: <JzCardViewIcon size={ICON_SIZE.md} />, label: '卡片', title: '卡片视图' },
              { value: 'list', icon: <JzRowsViewIcon size={ICON_SIZE.md} />, label: '列表', title: '列表视图' },
            ]}
          />
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="jz-admin-kb-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} style={{ minHeight: 168 }}>
              <Skeleton active title paragraph={{ rows: 2 }} />
            </Card>
          ))}
        </div>
      ) : items.length === 0 ? (
        <JzEmpty
          description="还没有知识库，先建一个吧"
          style={{ padding: '48px 0' }}
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>
            立即创建
          </Button>
        </JzEmpty>
      ) : visible.length === 0 ? (
        <JzEmpty description="没有匹配的知识库" style={{ padding: '48px 0' }}>
          <Button
            onClick={() => {
              setQ('');
              setVis('all');
            }}
          >
            清除筛选
          </Button>
        </JzEmpty>
      ) : showGrouped ? (
        <Collapse
          className="jz-admin-kb-sections"
          activeKey={activeKeys}
          onChange={onCollapseChange}
          items={sections.map((section) => ({
            key: section.key,
            label: (
              <Space>
                {section.accent && (
                  <span className="jz-admin-kb-cat-dot" style={{ background: section.accent }} />
                )}
                <span>{section.title}</span>
                <Text type="secondary" style={{ fontSize: 'var(--jz-fs-xs)' }}>
                  {section.kbs.length} 个知识库
                  {section.kbs.length > 0 && (
                    <>
                      {' '}
                      <SepDot /> {section.kbs.reduce((n, kb) => n + (kb.document_count || 0), 0)} 篇
                    </>
                  )}
                </Text>
              </Space>
            ),
            extra: (
              <span onClick={(e) => e.stopPropagation()}>
                <IconButton
                  size="xs"
                  tooltip={section.category ? `在「${section.title}」下新建知识库` : '新建未分类知识库'}
                  icon={<PlusOutlined />}
                  onClick={() => openCreate(section.category?.id ?? null)}
                  aria-label="在此大类新建知识库"
                />
              </span>
            ),
            children: renderSectionBody(section),
          }))}
        />
      ) : (
        renderKbs(visible)
      )}

      {exportTarget && (
        <ExportDialog
          open
          onClose={() => setExportTarget(null)}
          scope="kb"
          targetId={exportTarget.id}
          targetLabel={exportTarget.name}
          onSubmitted={() => navigate('/admin/exports')}
        />
      )}

      <Modal
        open={!!editing}
        title="编辑知识库"
        onCancel={() => setEditing(null)}
        onOk={handleSaveEdit}
        okText="保存"
        cancelText="取消"
        width={520}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical">
          <Form.Item label="名称" name="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="可见性" name="visibility">
            <Select
              options={[
                { value: 'private', label: '私密' },
                { value: 'public', label: '公开（博客前台展示）' },
              ]}
            />
          </Form.Item>
          <Form.Item label="大类" name="category_id">
            <Select allowClear placeholder="未分类" options={categoryOptions} />
          </Form.Item>
          <Form.Item label="封面图 URL" name="cover_image">
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item label="主题色" name="accent_color">
            <ColorField />
          </Form.Item>
          <AudienceControl users={audienceUsers} tags={userTags} />
          {editing && (
            <Form.Item label="标签">
              <TagPicker target={{ kind: 'kb', id: editing.id }} />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        open={creating}
        title="新建知识库"
        onCancel={() => setCreating(false)}
        afterOpenChange={(open) => {
          if (open) createForm.setFieldsValue({ category_id: createCategory });
        }}
        onOk={handleCreate}
        okText="创建"
        cancelText="取消"
        width={520}
      >
        <Form
          form={createForm}
          layout="vertical"
          initialValues={{ visibility: 'private' as Visibility, accent_color: '#10b981' }}
        >
          <Form.Item label="名称" name="name" rules={[{ required: true }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="可见性" name="visibility">
            <Select
              options={[
                { value: 'private', label: '私密' },
                { value: 'public', label: '公开（博客前台展示）' },
              ]}
            />
          </Form.Item>
          <Form.Item label="大类" name="category_id">
            <Select allowClear placeholder="未分类" options={categoryOptions} />
          </Form.Item>
          <Form.Item label="封面图 URL" name="cover_image">
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item label="主题色" name="accent_color">
            <ColorField />
          </Form.Item>
          <AudienceControl users={audienceUsers} tags={userTags} />
        </Form>
      </Modal>

      <Modal
        open={categoryModal}
        title="知识库大类"
        onCancel={() => {
          setCategoryModal(false);
          setEditingCategory(null);
          categoryForm.resetFields();
        }}
        footer={null}
        width={560}
        destroyOnHidden
      >
        <Form
          form={categoryForm}
          layout="vertical"
          onFinish={handleSaveCategory}
          style={{ marginBottom: 16 }}
        >
          <Form.Item label="大类名称" name="name" rules={[{ required: true }]}>
            <Input placeholder="例如：AI" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="标题色" name="accent_color">
            <ColorField />
          </Form.Item>
          <AudienceControl users={audienceUsers} tags={userTags} />
          <Button type="primary" htmlType="submit">
            {editingCategory ? '更新大类' : '添加大类'}
          </Button>
          {editingCategory && (
            <Button
              style={{ marginLeft: 8 }}
              onClick={() => {
                setEditingCategory(null);
                categoryForm.resetFields();
              }}
            >
              取消编辑
            </Button>
          )}
        </Form>
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          {categories.map((c) => (
            <div
              key={c.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                border: '1px solid var(--jz-border)',
                borderRadius: 8,
              }}
            >
              <Space>
                {c.accent_color && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: c.accent_color,
                    }}
                  />
                )}
                <Text strong>{c.name}</Text>
                {c.description && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {c.description}
                  </Text>
                )}
              </Space>
              <Space>
                <Button
                  size="small"
                  onClick={() => {
                    setEditingCategory(c);
                    categoryForm.setFieldsValue({
                      name: c.name,
                      description: c.description,
                      accent_color: c.accent_color,
                      audience_mode: c.audience_mode ?? 'all',
                      audience_user_ids: (c.audience_users ?? []).map((u) => u.id),
                      audience_tag_ids: (c.audience_tags ?? []).map((t) => t.id),
                    });
                  }}
                >
                  编辑
                </Button>
                {isRoot && (
                  <Popconfirm
                    title="删除该大类？关联知识库将变为未分类"
                    onConfirm={async () => {
                      try {
                        await kbsApi.deleteKBCategory(c.id);
                        message.success('已删除');
                        void refresh();
                      } catch (err) {
                        message.error(formatApiError(err));
                      }
                    }}
                  >
                    <Button size="small" danger>
                      删除
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            </div>
          ))}
        </Space>
      </Modal>
    </div>
  );
}
