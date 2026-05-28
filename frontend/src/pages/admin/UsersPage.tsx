import { useEffect, useState } from 'react';
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import * as usersApi from '@/api/users';
import { message } from '@/utils/notify';
import { formatApiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import type { User } from '@/types';
import AdminPageHeader from '@/components/admin/AdminPageHeader';

const { Text } = Typography;

interface CreateForm {
  username: string;
  password: string;
  email?: string;
  is_staff?: boolean;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<CreateForm>();
  const me = useAuthStore((s) => s.user);

  async function load() {
    try {
      const data = await usersApi.listUsers();
      setUsers(data);
    } catch (e) {
      message.error('加载用户列表失败');
      console.error(e);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(values: CreateForm) {
    try {
      await usersApi.createUser({
        username: values.username.trim(),
        password: values.password,
        email: values.email?.trim() || '',
        is_staff: !!values.is_staff,
      });
      message.success('用户已创建');
      setCreateOpen(false);
      form.resetFields();
      void load();
    } catch (e) {
      message.error(formatApiError(e));
    }
  }

  async function onToggleStaff(user: User, next: boolean) {
    try {
      await usersApi.updateUser(user.id, { is_staff: next });
      message.success(next ? '已设为管理员' : '已取消管理员');
      void load();
    } catch (e) {
      message.error(formatApiError(e));
    }
  }

  async function onToggleActive(user: User, next: boolean) {
    try {
      await usersApi.updateUser(user.id, { is_active: next });
      message.success(next ? '已启用' : '已禁用');
      void load();
    } catch (e) {
      message.error(formatApiError(e));
    }
  }

  async function onDelete(user: User) {
    try {
      await usersApi.deleteUser(user.id);
      message.success(`已删除 ${user.username}`);
      void load();
    } catch (e) {
      message.error(formatApiError(e));
    }
  }

  return (
    <div>
      <AdminPageHeader
        backTo="/admin"
        backLabel="工作台"
        title="用户管理"
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建用户
          </Button>
        }
      />

      <div className="jz-admin-panel">
      <Table<User>
        rowKey="id"
        dataSource={users ?? []}
        loading={users === null}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        columns={[
          {
            title: '用户名',
            dataIndex: 'username',
            render: (v: string, r) => (
              <Space>
                <Text strong>{v}</Text>
                {r.is_superuser && <Tag color="gold">超级</Tag>}
                {me?.id === r.id && <Tag color="blue">当前</Tag>}
              </Space>
            ),
          },
          { title: '邮箱', dataIndex: 'email', render: (v) => v || <Text type="secondary">—</Text> },
          {
            title: '管理员',
            dataIndex: 'is_staff',
            width: 100,
            render: (v: boolean, r) => (
              <Tooltip title={r.is_superuser ? '超级管理员，无法降级' : r.id === me?.id ? '不能取消自己' : ''}>
                <Switch
                  checked={v}
                  disabled={r.is_superuser || r.id === me?.id}
                  onChange={(next) => onToggleStaff(r, next)}
                />
              </Tooltip>
            ),
          },
          {
            title: '启用',
            dataIndex: 'is_active',
            width: 80,
            render: (v: boolean, r) => (
              <Switch
                checked={v}
                disabled={r.id === me?.id || r.is_superuser}
                onChange={(next) => onToggleActive(r, next)}
              />
            ),
          },
          {
            title: '创建时间',
            dataIndex: 'date_joined',
            width: 160,
            render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm'),
          },
          {
            title: '最近登录',
            dataIndex: 'last_login',
            width: 160,
            render: (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : <Text type="secondary">从未</Text>),
          },
          {
            title: '操作',
            width: 80,
            render: (_, r) => (
              <Popconfirm
                title="删除用户"
                description={`确定删除 ${r.username}？此操作不可撤销。`}
                onConfirm={() => onDelete(r)}
                okText="删除"
                cancelText="取消"
                disabled={r.is_superuser || r.id === me?.id}
              >
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  disabled={r.is_superuser || r.id === me?.id}
                />
              </Popconfirm>
            ),
          },
        ]}
      />
      </div>

      <Modal
        title="新建用户"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        okText="创建"
        cancelText="取消"
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={onCreate}
          initialValues={{ is_staff: false }}
          preserve={false}
        >
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名' }, { max: 150 }]}
          >
            <Input autoFocus />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }, { min: 4, message: '至少 4 位' }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item label="邮箱（可选）" name="email" rules={[{ type: 'email', message: '邮箱格式不正确' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="管理员权限" name="is_staff" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
