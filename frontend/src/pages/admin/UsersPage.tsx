import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  DeleteOutlined,
  KeyOutlined,
  PlusOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import * as authApi from '@/api/auth';
import * as usersApi from '@/api/users';
import { message } from '@/utils/notify';
import { formatApiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import type { User, UserTag } from '@/types';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import ColorField from '@/components/common/ColorField';

const { Text } = Typography;

interface CreateForm {
  username: string;
  password: string;
  email: string;
  is_staff?: boolean;
  tag_ids?: number[];
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
  const [tags, setTags] = useState<UserTag[]>([]);
  const [filterTag, setFilterTag] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPwd, setResetPwd] = useState('');
  // Per-user tag editing + the tag-vocabulary manager.
  const [tagTarget, setTagTarget] = useState<User | null>(null);
  const [tagTargetIds, setTagTargetIds] = useState<number[]>([]);
  const [tagMgrOpen, setTagMgrOpen] = useState(false);
  const [form] = Form.useForm<CreateForm>();
  const me = useAuthStore((s) => s.user);

  const load = useCallback(
    async (opts?: { tag?: number; search?: string }) => {
      try {
        const data = await usersApi.listUsers({
          tag: opts?.tag ?? filterTag,
          search: opts?.search ?? (search || undefined),
        });
        setUsers(data);
      } catch (e) {
        message.error('加载用户列表失败');
        console.error(e);
      }
    },
    [filterTag, search],
  );

  const loadTags = useCallback(async () => {
    try {
      setTags(await usersApi.listUserTags());
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Reload the list whenever the tag filter changes; search reloads on submit.
  useEffect(() => {
    void load({ tag: filterTag });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterTag]);

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  async function onCreate(values: CreateForm) {
    try {
      await usersApi.createUser({
        username: values.username.trim(),
        password: values.password,
        email: values.email?.trim() || '',
        is_staff: !!values.is_staff,
        tag_ids: values.tag_ids ?? [],
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

  async function onSaveTags() {
    if (!tagTarget) return;
    try {
      await usersApi.updateUser(tagTarget.id, { tag_ids: tagTargetIds });
      message.success(`已更新 ${tagTarget.username} 的标签`);
      setTagTarget(null);
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
          <Space wrap>
            <Button icon={<TagsOutlined />} onClick={() => setTagMgrOpen(true)}>
              标签管理
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建用户
            </Button>
          </Space>
        }
      />

      <div className="jz-admin-panel">
        <Space wrap style={{ marginBottom: 16 }}>
          <Select
            allowClear
            placeholder="按标签筛选"
            style={{ minWidth: 180 }}
            value={filterTag}
            onChange={(v) => setFilterTag(v)}
            options={tags.map((t) => ({ value: t.id, label: t.name }))}
          />
          <Input.Search
            placeholder="搜索用户名 / 邮箱"
            allowClear
            style={{ width: 240 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={(v) => void load({ search: v || undefined })}
          />
        </Space>
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
              title: '标签',
              dataIndex: 'tags',
              render: (_, r) => {
                const list = r.tags ?? [];
                if (!list.length) return <Text type="secondary">—</Text>;
                return (
                  <Space size={4} wrap>
                    {list.map((t) => (
                      <Tag key={t.id} color={t.color || undefined} style={{ marginRight: 0 }}>
                        {t.name}
                      </Tag>
                    ))}
                  </Space>
                );
              },
            },
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
              width: 160,
              render: (_, r) => (
                <Space size={4}>
                  <Tooltip title={canManage(me, r) ? '编辑标签' : '无权操作'}>
                    <Button
                      type="text"
                      size="small"
                      icon={<TagsOutlined />}
                      disabled={!canManage(me, r)}
                      onClick={() => {
                        setTagTarget(r);
                        setTagTargetIds((r.tags ?? []).map((t) => t.id));
                      }}
                    />
                  </Tooltip>
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
            rules={[{ required: true, message: '请输入密码' }, { min: 8, message: '至少 8 位' }]}
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
          <Form.Item label="标签" name="tag_ids">
            <Select
              mode="multiple"
              allowClear
              placeholder="给该用户打标签（可选）"
              optionFilterProp="label"
              options={tags.map((t) => ({ value: t.id, label: t.name }))}
            />
          </Form.Item>
          <Form.Item label="管理员权限" name="is_staff" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={tagTarget ? `编辑「${tagTarget.username}」的标签` : '编辑标签'}
        open={!!tagTarget}
        onCancel={() => setTagTarget(null)}
        onOk={() => void onSaveTags()}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Select
          mode="multiple"
          allowClear
          style={{ width: '100%' }}
          placeholder="选择标签"
          optionFilterProp="label"
          value={tagTargetIds}
          onChange={(v) => setTagTargetIds(v)}
          options={tags.map((t) => ({ value: t.id, label: t.name }))}
        />
      </Modal>

      <Modal
        title="重置密码"
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
          {resetTarget ? `重置「${resetTarget.username}」的密码。` : ''}
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

      <TagManagerModal
        open={tagMgrOpen}
        tags={tags}
        onClose={() => setTagMgrOpen(false)}
        onChanged={() => {
          void loadTags();
          void load();
        }}
      />
    </div>
  );
}

// ── User-tag vocabulary manager ────────────────────────────────────────────

interface TagManagerProps {
  open: boolean;
  tags: UserTag[];
  onClose: () => void;
  onChanged: () => void;
}

function TagManagerModal({ open, tags, onClose, onChanged }: TagManagerProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#10b981');
  // In-app rename dialog (window.prompt is unthemed browser chrome and
  // offers no validation feedback).
  const [renaming, setRenaming] = useState<UserTag | null>(null);
  const [renameValue, setRenameValue] = useState('');

  async function onAdd() {
    const n = name.trim();
    if (!n) {
      message.warning('请输入标签名');
      return;
    }
    try {
      await usersApi.createUserTag({ name: n, color });
      message.success('标签已创建');
      setName('');
      onChanged();
    } catch (e) {
      message.error(formatApiError(e));
    }
  }

  function openRename(tag: UserTag) {
    setRenaming(tag);
    setRenameValue(tag.name);
  }

  async function commitRename() {
    const tag = renaming;
    if (!tag) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      message.warning('标签名不能为空');
      return;
    }
    if (trimmed === tag.name) {
      setRenaming(null);
      return;
    }
    try {
      await usersApi.updateUserTag(tag.id, { name: trimmed });
      message.success('已重命名');
      setRenaming(null);
      onChanged();
    } catch (e) {
      message.error(formatApiError(e));
    }
  }

  async function onRecolor(tag: UserTag, hex: string) {
    try {
      await usersApi.updateUserTag(tag.id, { color: hex });
      onChanged();
    } catch (e) {
      message.error(formatApiError(e));
    }
  }

  async function onDelete(tag: UserTag) {
    try {
      await usersApi.deleteUserTag(tag.id);
      message.success('已删除');
      onChanged();
    } catch (e) {
      message.error(formatApiError(e));
    }
  }

  return (
    <Modal title="用户标签管理" open={open} onCancel={onClose} footer={null} width={520} destroyOnHidden>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="新标签名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: 180 }}
          onPressEnter={() => void onAdd()}
        />
        <ColorField value={color} onChange={setColor} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => void onAdd()}>
          添加
        </Button>
      </Space>
      {tags.length === 0 ? (
        <Empty description="还没有标签" />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          {tags.map((t) => (
            <div
              key={t.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                border: '1px solid var(--jz-border)',
                borderRadius: 8,
              }}
            >
              <Tag color={t.color || undefined}>{t.name}</Tag>
              <Space>
                <ColorField value={t.color || '#10b981'} onChange={(hex) => void onRecolor(t, hex)} />
                <Button size="small" onClick={() => openRename(t)}>
                  重命名
                </Button>
                <Popconfirm
                  title="删除该标签？"
                  description="所有用户身上的此标签将被移除。"
                  onConfirm={() => void onDelete(t)}
                  okText="删除"
                  cancelText="取消"
                >
                  <Button size="small" danger>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            </div>
          ))}
        </Space>
      )}

      <Modal
        title="重命名标签"
        open={renaming !== null}
        onCancel={() => setRenaming(null)}
        onOk={() => void commitRename()}
        okText="重命名"
        cancelText="取消"
        width={360}
        destroyOnHidden
      >
        <Input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={() => void commitRename()}
          placeholder="标签名"
          maxLength={50}
        />
      </Modal>
    </Modal>
  );
}
