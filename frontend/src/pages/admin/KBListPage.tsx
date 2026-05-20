import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  ColorPicker,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { message } from '@/utils/notify';
import { BookOutlined, DeleteOutlined, EditOutlined, ExportOutlined, PlusOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import * as kbsApi from '@/api/kbs';
import { formatApiError } from '@/api/client';
import type { KnowledgeBase, Visibility } from '@/types';
import ExportDialog from '@/components/common/ExportDialog';
import TagPicker from '@/components/common/TagPicker';
import { resolveTagColor } from '@/utils/tagColor';

const { Title, Paragraph, Text } = Typography;

export default function KBListPage() {
  const [items, setItems] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm<{
    name: string;
    description: string;
    visibility: Visibility;
    accent_color?: string;
  }>();
  const [exportTarget, setExportTarget] = useState<KnowledgeBase | null>(null);
  const [editing, setEditing] = useState<KnowledgeBase | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setItems(await kbsApi.listKBs());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleCreate() {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    try {
      await kbsApi.createKB(values);
      message.success('已创建');
      setCreating(false);
      form.resetFields();
      void refresh();
    } catch (err) {
      message.error(formatApiError(err, '新建知识库失败'));
    }
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

  async function handlePatchAccent(kb: KnowledgeBase, color: string) {
    try {
      await kbsApi.updateKB(kb.id, { accent_color: color });
      void refresh();
    } catch (err) {
      message.error(formatApiError(err, '修改主题色失败'));
    }
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <Title level={2} style={{ margin: 0 }}>知识库</Title>
        <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
          新建知识库
        </Button>
      </div>

      {!loading && items.length === 0 ? (
        <Empty description="还没有知识库，先建一个吧" />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16,
          }}
        >
          {items.map((kb) => {
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
                    <Tooltip title="编辑标签 + 主题色">
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => setEditing(kb)}
                      />
                    </Tooltip>
                    <Tooltip title="导出">
                      <Button
                        size="small"
                        icon={<ExportOutlined />}
                        onClick={() => setExportTarget(kb)}
                      />
                    </Tooltip>
                    <Popconfirm title="删除该知识库？" onConfirm={() => handleDelete(kb.id)}>
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                }
              >
                <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ minHeight: 44 }}>
                  {kb.description || '（无描述）'}
                </Paragraph>
                <Space wrap size={6} style={{ marginBottom: 8 }}>
                  {kb.tags.map((t) => (
                    <Tag key={t.id} color={resolveTagColor(t)}>{t.name}</Tag>
                  ))}
                </Space>
                <Space split={<span style={{ opacity: 0.4 }}>·</span>}>
                  <Tag color={kb.visibility === 'public' ? 'green' : 'default'}>
                    {kb.visibility === 'public' ? '公开' : '私密'}
                  </Tag>
                  <Text type="secondary">{kb.document_count} 篇</Text>
                </Space>
              </Card>
            );
          })}
        </div>
      )}

      {exportTarget && (
        <ExportDialog
          open
          onClose={() => setExportTarget(null)}
          scope="kb"
          targetId={exportTarget.id}
          targetLabel={exportTarget.name}
        />
      )}

      <Modal
        open={!!editing}
        title={editing ? `编辑：${editing.name}` : '编辑'}
        onCancel={() => setEditing(null)}
        footer={null}
        destroyOnHidden
      >
        {editing && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <div style={{ color: 'var(--jz-text-muted)', fontSize: 12, marginBottom: 6 }}>
                标签
              </div>
              <TagPicker key={editing.id} target={{ kind: 'kb', id: editing.id }} />
            </div>
            <div>
              <div style={{ color: 'var(--jz-text-muted)', fontSize: 12, marginBottom: 6 }}>
                主题色（用于卡片顶边 / 博客详情 accent）
              </div>
              <ColorPicker
                value={editing.accent_color || '#1677ff'}
                onChangeComplete={(c) => {
                  const hex = c.toHexString();
                  setEditing({ ...editing, accent_color: hex });
                  void handlePatchAccent(editing, hex);
                }}
                showText
              />
            </div>
          </Space>
        )}
      </Modal>

      <Modal
        open={creating}
        title="新建知识库"
        onCancel={() => setCreating(false)}
        onOk={handleCreate}
        okText="创建"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ visibility: 'private' as Visibility, accent_color: '#1677ff' }}
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
          <Form.Item label="主题色（可后续修改）" name="accent_color">
            <Input placeholder="#1677ff" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
