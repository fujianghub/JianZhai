import { useState } from 'react';
import { Button, Card, Form, Input, Typography } from 'antd';
import { message } from '@/utils/notify';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { formatApiError } from '@/api/client';
import ThemeSwitcher from '@/components/common/ThemeSwitcher';

const { Title, Paragraph } = Typography;

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);

  async function onFinish(values: { username: string; password: string }) {
    setSubmitting(true);
    try {
      await login(values.username, values.password);
      const next = (location.state as { from?: string } | null)?.from ?? '/admin';
      navigate(next, { replace: true });
    } catch (err) {
      message.error(formatApiError(err, '登录失败'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background:
          'radial-gradient(1200px 600px at 80% -10%, color-mix(in srgb, var(--jz-accent) 18%, transparent), transparent), var(--jz-bg-app)',
        padding: 16,
      }}
    >
      <div style={{ position: 'fixed', top: 16, right: 16 }}>
        <ThemeSwitcher />
      </div>
      <Card
        className="jz-card jz-fade-in"
        style={{ width: 380, maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.10)' }}
      >
        <Title level={2} style={{ marginBottom: 2, letterSpacing: 1.5 }}>简斋 · JianZhai</Title>
        <Paragraph type="secondary" style={{ marginBottom: 24 }}>
          个人知识库 + 个人博客
        </Paragraph>
        <Form
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ username: 'admin', password: 'admin' }}
          requiredMark={false}
        >
          <Form.Item label="用户名" name="username" rules={[{ required: true }]}>
            <Input autoFocus autoComplete="username" size="large" />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={submitting} block size="large">
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}
