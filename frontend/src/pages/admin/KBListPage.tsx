import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Collapse,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { message } from '@/utils/notify';
import {
  BookOutlined,
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
  FolderOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
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

const { Paragraph, Text } = Typography;

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

  const grouped = useMemo(() => {
    const byCat = new Map<number | 'none', KnowledgeBase[]>();
    for (const kb of items) {
      const key = kb.category?.id ?? 'none';
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key)!.push(kb);
    }
    const sections: Array<{ key: string; title: string; accent?: string; kbs: KnowledgeBase[] }> = [];
    for (const cat of categories) {
      const kbs = byCat.get(cat.id) ?? [];
      if (kbs.length) sections.push({ key: `cat-${cat.id}`, title: cat.name, accent: cat.accent_color, kbs });
    }
    const uncategorized = byCat.get('none') ?? [];
    if (uncategorized.length) {
      sections.push({ key: 'none', title: '未分类', kbs: uncategorized });
    }
    return sections;
  }, [items, categories]);

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

  function renderKbCard(kb: KnowledgeBase) {
    const accent = kb.accent_color || 'var(--jz-accent)';
    return (
      <Card
        key={kb.id}
        className="jz-card jz-fade-in jz-kb-card"
        loading={loading}
        style={{ borderTop: `4px solid ${accent}`, borderRadius: 12 }}
        title={
          <Space>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 60%, white))`,
                color: '#fff',
                display: 'inline-grid',
                placeItems: 'center',
                fontSize: 14,
              }}
            >
              <BookOutlined />
            </span>
            <Link to={`/admin/kbs/${kb.id}`}>{kb.name}</Link>
          </Space>
        }
        extra={
          <Space>
            <Tooltip title="编辑设置">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(kb)} />
            </Tooltip>
            <Tooltip title="导出">
              <Button size="small" icon={<ExportOutlined />} onClick={() => setExportTarget(kb)} />
            </Tooltip>
            {isRoot && (
              <Popconfirm title="删除该知识库？" onConfirm={() => handleDelete(kb.id)}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            )}
          </Space>
        }
      >
        <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ minHeight: 44 }}>
          {kb.description || '（无描述）'}
        </Paragraph>
        <Space wrap size={6} style={{ marginBottom: 8 }}>
          {kb.tags.map((t) => (
            <Tag key={t.id} color={resolveTagColor(t)}>
              {t.name}
            </Tag>
          ))}
        </Space>
        <Space split={<span style={{ opacity: 0.4 }}>·</span>}>
          <Tag
            color={kb.visibility === 'public' ? 'green' : 'default'}
            style={{ cursor: 'pointer' }}
            onClick={() => openEdit(kb)}
          >
            {kb.visibility === 'public' ? '公开' : '私密'}
          </Tag>
          <Text type="secondary">{kb.document_count} 篇</Text>
        </Space>
      </Card>
    );
  }

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div>
      <AdminPageHeader
        backTo="/admin"
        backLabel="工作台"
        title="知识库"
        actions={
          <Space wrap>
            <Button icon={<FolderOutlined />} onClick={() => setCategoryModal(true)}>
              管理大类
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              新建知识库
            </Button>
          </Space>
        }
      />

      {loading && items.length === 0 ? (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} style={{ minHeight: 168 }}>
              <Skeleton active title paragraph={{ rows: 2 }} />
            </Card>
          ))}
        </div>
      ) : !loading && items.length === 0 ? (
        <Empty
          description="还没有知识库，先建一个吧"
          style={{ padding: '48px 0' }}
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            立即创建
          </Button>
        </Empty>
      ) : grouped.length > 0 ? (
        <Collapse
          defaultActiveKey={grouped.map((s) => s.key)}
          items={grouped.map((section) => ({
            key: section.key,
            label: (
              <Space>
                {section.accent && (
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: section.accent,
                      display: 'inline-block',
                    }}
                  />
                )}
                <span>{section.title}</span>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {section.kbs.length} 个知识库
                </Text>
              </Space>
            ),
            children: (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: 16,
                }}
              >
                {section.kbs.map(renderKbCard)}
              </div>
            ),
          }))}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16,
          }}
        >
          {items.map(renderKbCard)}
        </div>
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
