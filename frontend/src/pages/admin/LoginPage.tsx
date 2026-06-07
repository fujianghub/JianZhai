import { useState } from 'react';
import { Button, Form, Input } from 'antd';
import { message } from '@/utils/notify';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { formatApiError } from '@/api/client';
import ThemeSwitcher from '@/components/common/ThemeSwitcher';

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
    <div className="jz-glass jz-login">
      <div className="jz-login-glow" aria-hidden />
      <div className="jz-login-theme">
        <ThemeSwitcher />
      </div>

      <div className="jz-login-card jz-fade-in">
        <div className="jz-login-seal" aria-hidden>簡</div>
        <h1 className="jz-login-title">简斋 · JianZhai</h1>
        <p className="jz-login-sub">个 人 知 识 库 · 个 人 博 客</p>

        <Form
          layout="vertical"
          onFinish={onFinish}
          requiredMark={false}
          autoComplete="off"
          className="jz-login-form"
        >
          <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input
              autoFocus
              size="large"
              placeholder="请输入用户名"
              autoComplete="off"
            />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password
              size="large"
              placeholder="请输入密码"
              autoComplete="new-password"
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={submitting} block size="large">
            登 录
          </Button>
        </Form>

        <div className="jz-login-foot" aria-hidden>一份内容 · 两种形态</div>
      </div>
    </div>
  );
}
