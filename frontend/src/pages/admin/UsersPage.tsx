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
import { DeleteOutlined, KeyOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import * as authApi from '@/api/auth';
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
  email: string;
  is_staff?: boolean;
}

/** Can the current operator act on this target row? Mirrors backend
 *  ``can_manage_user``: root can touch anyone but self; non-root staff
 *  can only touch non-superuser users. */
function canManage(me: { id: number; is_root?: boolean } | null, target: User): boolean {
  if (!me) return false;
  if (target.id === me.id) return false;
  if (me.is_root) return true;
  return !target.is_superuser && !target.is_root;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPwd, setResetPwd] = useState('');
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
      if (next) await authApi.enableUser(user.id);
      else await authApi.disableUser(user.id);
      message.success(next ? '已启用' : '已禁用');
      void load();
    } catch (e) {
      message.error(formatApiError(e));
    }
  }

  async function onResetPassword() {
    if (!resetTarget) return;
    if (!resetPwd || resetPwd.length < 8) {
      message.warning('新密码至少 8 个字符');
      return;
    }
    try {
      await authApi.resetUserPassword(resetTarget.id, resetPwd);
      message.success(`已重置 ${resetTarget.username} 的密码`);
      setResetTarget(null);
      setResetPwd('');
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
                {r.is_root && <Tag color="gold" style={{ marginRight: 0 }}>🛡 根</Tag>}
                {r.is_superuser && !r.is_root && <Tag color="purple">超级</Tag>}
                {me?.id === r.id && <Tag color="blue">当前</Tag>}
              </Space>
            ),
          },
          { title: '邮箱', dataIndex: 'email', render: (v) => v || <Text type="secondary">—</Text> },
          {
            title: '管理员',
            dataIndex: 'is_staff',
            width: 100,
            render: (v: boolean, r) => {
              const disabled = r.is_superuser || !canManage(me, r);
              return (
                <Tooltip
                  title={
                    r.is_root
                      ? '根管理员，只能本人修改'
                      : r.is_superuser
                        ? '超级管理员，无法降级'
                        : !canManage(me, r)
                          ? '无权修改'
                          : ''
                  }
                >
                  <Switch checked={v} disabled={disabled} onChange={(next) => onToggleStaff(r, next)} />
                </Tooltip>
              );
            },
          },
          {
            title: '启用',
            dataIndex: 'is_active',
            width: 80,
            render: (v: boolean, r) => {
              const disabled = r.is_root || !canManage(me, r);
              return (
                <Tooltip
                  title={
                    r.is_root
                      ? '根管理员账号不能禁用'
                      : !canManage(me, r)
                        ? '无权操作此账号'
                        : ''
                  }
                >
                  <Switch
                    checked={v}
                    disabled={disabled}
                    onChange={(next) => onToggleActive(r, next)}
                  />
                </Tooltip>
              );
            },
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
            width: 130,
            render: (_, r) => (
              <Space size={4}>
                <Tooltip title={canManage(me, r) ? '重置该用户的密码' : '无权操作'}>
                  <Button
                    type="text"
                    size="small"
                    icon={<KeyOutlined />}
                    disabled={!canManage(me, r)}
                    onClick={() => {
                      setResetTarget(r);
                      setResetPwd('');
                    }}
                  />
                </Tooltip>
                <Popconfirm
                  title="删除用户"
                  description={`确定删除 ${r.username}？此操作不可撤销。`}
                  onConfirm={() => onDelete(r)}
                  okText="删除"
                  cancelText="取消"
                  disabled={!canManage(me, r) || r.is_root}
                >
                  <Tooltip title={r.is_root ? '根管理员不能删除' : ''}>
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      disabled={!canManage(me, r) || r.is_root}
                    />
                  </Tooltip>
                </Popconfirm>
              </Space>
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
          <Form.Item
            label="邮箱"
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="管理员权限" name="is_staff" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={resetTarget ? `重置「${resetTarget.username}」的密码` : '重置密码'}
        open={!!resetTarget}
        onCancel={() => {
          setResetTarget(null);
          setResetPwd('');
        }}
        onOk={() => void onResetPassword()}
        okText="重置"
        cancelText="取消"
        destroyOnHidden
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          重置后该用户用新密码登录。请把新密码安全地传给本人。
        </Text>
        <Input.Password
          value={resetPwd}
          onChange={(e) => setResetPwd(e.target.value)}
          placeholder="新密码（至少 8 位）"
          autoFocus
          onPressEnter={() => void onResetPassword()}
        />
      </Modal>
    </div>
  );
}
