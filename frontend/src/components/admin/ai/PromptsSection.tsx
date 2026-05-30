/**
 * 「自定义 Prompt 模板」管理页。
 *
 * 列出当前用户的模板（list / create / edit / delete）。 模板会自动出现在
 * 编辑器 AI 菜单、选区 AI 浮按钮与右下抽屉里，与内置的 8 种操作并列。
 *
 * 后端接口：/api/v1/ai/templates/ + /<id>/
 */
import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import {
  type AIPromptTemplate,
  createPromptTemplate,
  deletePromptTemplate,
  listPromptTemplates,
  updatePromptTemplate,
} from '@/api/ai';

const { Text, Paragraph } = Typography;

const REPLACE_MODE_LABELS: Record<AIPromptTemplate['replace_mode'], string> = {
  none: '仅显示',
  replace: '替换选中',
  before: '插入到上方',
  after: '插入到下方',
};

interface EditState {
  open: boolean;
  initial: Partial<AIPromptTemplate> | null;
}

export default function PromptsSection() {
  const [items, setItems] = useState<AIPromptTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState<EditState>({ open: false, initial: null });

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await listPromptTemplates();
      setItems(list);
    } catch {
      message.error('加载模板失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const openCreate = () => setEdit({ open: true, initial: { name: '', instruction: '', icon: '✨', requires_selection: true, replace_mode: 'none' } });
  const openEdit = (t: AIPromptTemplate) => setEdit({ open: true, initial: t });
  const closeEdit = () => setEdit({ open: false, initial: null });

  const handleDelete = async (id: number) => {
    try {
      await deletePromptTemplate(id);
      message.success('已删除');
      void refresh();
    } catch {
      message.error('删除失败');
    }
  };

  return (
    <Card
      title="自定义 Prompt 模板"
      size="small"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建模板
        </Button>
      }
    >
      <Paragraph type="secondary" style={{ marginTop: 0 }}>
        自定义模板会出现在编辑器 AI 菜单、选区浮按钮与右下抽屉里，与内置的 8 种操作并列。指令越具体，AI 输出越稳定。
      </Paragraph>
      {items.length === 0 && !loading ? (
        <Empty description="还没有自定义模板" image={Empty.PRESENTED_IMAGE_SIMPLE}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            建一个
          </Button>
        </Empty>
      ) : (
        <Table<AIPromptTemplate>
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={items}
          pagination={false}
          columns={[
            {
              title: '图标',
              dataIndex: 'icon',
              width: 60,
              render: (v: string) => <span style={{ fontSize: 20 }}>{v || '✨'}</span>,
            },
            {
              title: '名称',
              dataIndex: 'name',
            },
            {
              title: '需选中',
              dataIndex: 'requires_selection',
              width: 80,
              render: (v: boolean) => v ? <Tag color="blue">是</Tag> : <Tag>否</Tag>,
            },
            {
              title: '替换模式',
              dataIndex: 'replace_mode',
              width: 120,
              render: (v: AIPromptTemplate['replace_mode']) => REPLACE_MODE_LABELS[v],
            },
            {
              title: '指令',
              dataIndex: 'instruction',
              ellipsis: true,
              render: (v: string) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {v.length > 80 ? v.slice(0, 80) + '…' : v}
                </Text>
              ),
            },
            {
              title: '操作',
              key: 'ops',
              width: 130,
              render: (_, r) => (
                <Space size={2}>
                  <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
                  <Popconfirm title="删除该模板？" onConfirm={() => handleDelete(r.id)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      )}

      <TemplateModal
        open={edit.open}
        initial={edit.initial}
        onClose={closeEdit}
        onSaved={() => { void refresh(); closeEdit(); }}
      />
    </Card>
  );
}

function TemplateModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: Partial<AIPromptTemplate> | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm();
  const isEdit = !!initial?.id;
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && initial) form.setFieldsValue(initial);
    if (open && !initial) form.resetFields();
  }, [open, initial, form]);

  const handleOk = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      if (isEdit && initial?.id) {
        await updatePromptTemplate(initial.id, v);
        message.success('已保存');
      } else {
        await createPromptTemplate(v);
        message.success('已新建');
      }
      onSaved();
    } catch (e) {
      if ((e as { errorFields?: unknown[] }).errorFields) return;
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isEdit ? '编辑模板' : '新建模板'}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={saving}
      okText="保存"
      width={620}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ icon: '✨', requires_selection: true, replace_mode: 'none' }}
      >
        <Form.Item name="name" label="名称" rules={[{ required: true, max: 60 }]}>
          <Input placeholder="如：改成论文风 / 提炼关键词 / 翻译为日语" />
        </Form.Item>
        <Form.Item name="icon" label="图标（emoji）">
          <Input placeholder="✨ / 📝 / 🎯" maxLength={8} style={{ width: 100 }} />
        </Form.Item>
        <Form.Item
          name="instruction"
          label="指令"
          rules={[{ required: true, max: 4000 }]}
          extra="发送给 AI 的指令模板。会与用户选中的内容拼接后一起发送。指令越具体，输出越稳定。"
        >
          <Input.TextArea rows={6} placeholder="如：「把以下内容改写为正式论文语气，保留 Markdown 结构与代码块」" />
        </Form.Item>
        <Form.Item name="replace_mode" label="结果处理方式">
          <Select
            options={Object.entries(REPLACE_MODE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          />
        </Form.Item>
        <Form.Item name="requires_selection" label="是否要求先选中文字" valuePropName="checked">
          <input type="checkbox" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
