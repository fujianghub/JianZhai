import { useState } from 'react';
import { Alert, Button, Card, Form, Input, Space, Tabs, Tag, Typography, Upload } from 'antd';
import type { UploadFile, RcFile } from 'antd/es/upload';
import ImgCrop from 'antd-img-crop';
import { DeleteOutlined, MailOutlined, UploadOutlined, UserOutlined } from '@ant-design/icons';
import * as authApi from '@/api/auth';
import { formatApiError } from '@/api/client';
import { message } from '@/utils/notify';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import UserAvatar from '@/components/common/UserAvatar';
import { useAuthStore } from '@/stores/auth';

const { Text } = Typography;

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const loadSession = useAuthStore((s) => s.loadSession);

  if (!user) return null;

  return (
    <div>
      <AdminPageHeader title="个人资料" backTo="/admin/kbs" backLabel="知识库" />

      <Card className="jz-profile-card" style={{ marginBottom: 16 }}>
        <Space size="large" align="center">
          <UserAvatar user={user} size={72} />
          <div>
            <Space size={8} align="center">
              <Text strong style={{ fontSize: 18 }}>{user.username}</Text>
              {user.is_root && (
                <Tag color="gold" style={{ marginRight: 0 }}>🛡 根管理员</Tag>
              )}
              {user.is_superuser && !user.is_root && (
                <Tag color="purple">超级管理员</Tag>
              )}
              {!user.is_superuser && user.is_staff && (
                <Tag color="blue">管理员</Tag>
              )}
              {!user.is_active && <Tag color="red">已禁用</Tag>}
            </Space>
            <div style={{ marginTop: 6, color: 'var(--jz-text-muted)' }}>
              <MailOutlined style={{ marginRight: 6 }} />
              {user.email || <Text type="secondary">未设置</Text>}
            </div>
          </div>
        </Space>
      </Card>

      <Tabs
        defaultActiveKey="account"
        items={[
          {
            key: 'account',
            label: <span><UserOutlined /> 账号信息</span>,
            children: (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <UsernameForm onSaved={() => void loadSession()} />
                <EmailForm onSaved={() => void loadSession()} />
                <PasswordForm />
              </Space>
            ),
          },
          {
            key: 'avatar',
            label: '头像',
            children: <AvatarTab onChanged={() => void loadSession()} />,
          },
        ]}
      />
    </div>
  );
}

function UsernameForm({ onSaved }: { onSaved: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!user) return null;

  const onSubmit = async (v: { new_username: string; password: string }) => {
    setSaving(true);
    try {
      await authApi.changeUsername(v.new_username.trim(), v.password);
      message.success('用户名已更新');
      onSaved();
      setConfirmOpen(false);
      form.resetFields(['password']);
    } catch (err) {
      message.error(formatApiError(err, '修改失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={<span><UserOutlined /> 用户名</span>} size="small">
      <Form
        form={form}
        layout="vertical"
        initialValues={{ new_username: user.username }}
        onFinish={(v) => void onSubmit(v)}
      >
        <Form.Item
          label="新用户名"
          name="new_username"
          rules={[
            { required: true, message: '请输入新用户名' },
            { min: 2, max: 30, message: '长度 2-30' },
            {
              pattern: /^[A-Za-z0-9_.\-]+$/,
              message: '只允许字母、数字、下划线、点和连字符',
            },
          ]}
          extra="改完后下次登录用新用户名。修改根管理员名会让 fengfujiang 失去根权限。"
        >
          <Input placeholder="新用户名" />
        </Form.Item>
        {confirmOpen && (
          <Form.Item
            label="当前密码（用于确认）"
            name="password"
            rules={[{ required: true, message: '需要当前密码确认' }]}
          >
            <Input.Password placeholder="当前密码" autoFocus />
          </Form.Item>
        )}
        <Space>
          {!confirmOpen ? (
            <Button
              type="primary"
              onClick={() => {
                void form.validateFields(['new_username']).then(() => setConfirmOpen(true));
              }}
            >
              修改用户名
            </Button>
          ) : (
            <>
              <Button type="primary" htmlType="submit" loading={saving}>确认修改</Button>
              <Button onClick={() => setConfirmOpen(false)} disabled={saving}>取消</Button>
            </>
          )}
        </Space>
      </Form>
    </Card>
  );
}

function EmailForm({ onSaved }: { onSaved: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const onSubmit = async (v: { email: string; password: string }) => {
    setSaving(true);
    try {
      await authApi.changeEmail(v.email.trim(), v.password);
      message.success('邮箱已更新');
      onSaved();
      form.resetFields(['password']);
    } catch (err) {
      message.error(formatApiError(err, '修改失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={<span><MailOutlined /> 邮箱</span>} size="small">
      <Form
        form={form}
        layout="vertical"
        initialValues={{ email: user.email || '' }}
        onFinish={(v) => void onSubmit(v)}
      >
        <Form.Item
          label="新邮箱"
          name="email"
          rules={[
            { required: true, message: '请输入邮箱' },
            { type: 'email', message: '邮箱格式不正确' },
          ]}
        >
          <Input placeholder="user@example.com" />
        </Form.Item>
        <Form.Item
          label="当前密码"
          name="password"
          rules={[{ required: true, message: '需要当前密码确认' }]}
        >
          <Input.Password placeholder="当前密码" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={saving}>修改邮箱</Button>
      </Form>
    </Card>
  );
}

function PasswordForm() {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const onSubmit = async (v: { old_password: string; new_password: string; confirm: string }) => {
    if (v.new_password !== v.confirm) {
      message.error('两次输入的新密码不一致');
      return;
    }
    setSaving(true);
    try {
      await authApi.changePassword(v.old_password, v.new_password);
      message.success('密码已更新，请记好新密码');
      form.resetFields();
    } catch (err) {
      message.error(formatApiError(err, '修改失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="修改密码" size="small">
      <Alert
        type="info"
        showIcon
        message="改完无需重新登录；下次登录使用新密码。"
        style={{ marginBottom: 12 }}
      />
      <Form form={form} layout="vertical" onFinish={(v) => void onSubmit(v)}>
        <Form.Item
          label="当前密码"
          name="old_password"
          rules={[{ required: true, message: '请输入当前密码' }]}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          label="新密码"
          name="new_password"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 8, message: '至少 8 个字符' },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          label="再次确认新密码"
          name="confirm"
          rules={[{ required: true, message: '请再次输入新密码' }]}
          dependencies={['new_password']}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={saving}>修改密码</Button>
      </Form>
    </Card>
  );
}

function AvatarTab({ onChanged }: { onChanged: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  if (!user) return null;

  async function handleSave() {
    if (!pendingFile) {
      message.warning('请先选择并裁剪头像');
      return;
    }
    setUploading(true);
    try {
      await authApi.uploadAvatar(pendingFile);
      onChanged();
      setPendingFile(null);
      setFileList([]);
      message.success('头像已更新');
    } catch (err) {
      message.error(formatApiError(err, '上传失败'));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setUploading(true);
    try {
      await authApi.deleteAvatar();
      onChanged();
      setPendingFile(null);
      setFileList([]);
      message.success('已恢复默认头像');
    } catch (err) {
      message.error(formatApiError(err, '移除失败'));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="jz-profile-card">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <ImgCrop rotationSlider cropShape="round" aspect={1} quality={0.92}>
          <Upload
            listType="picture-circle"
            maxCount={1}
            fileList={fileList}
            accept="image/jpeg,image/png,image/webp,image/gif"
            beforeUpload={(file: RcFile) => {
              setPendingFile(file);
              setFileList([
                {
                  uid: '-1',
                  name: file.name,
                  status: 'done',
                  originFileObj: file,
                },
              ]);
              return false;
            }}
            onRemove={() => {
              setPendingFile(null);
              setFileList([]);
            }}
          >
            <button type="button" style={{ border: 0, background: 'none' }}>
              <UploadOutlined />
              <div style={{ marginTop: 8 }}>选择图片</div>
            </button>
          </Upload>
        </ImgCrop>
        <Text type="secondary" style={{ fontSize: 13 }}>
          支持 JPEG / PNG / WebP / GIF，最大 5MB，将自动裁剪为圆形。
        </Text>
        <Space>
          <Button type="primary" loading={uploading} onClick={() => void handleSave()}>
            保存头像
          </Button>
          <Button
            icon={<DeleteOutlined />}
            loading={uploading}
            disabled={!user.avatar_url && !pendingFile}
            onClick={() => void handleRemove()}
          >
            移除头像
          </Button>
        </Space>
      </Space>
    </Card>
  );
}
