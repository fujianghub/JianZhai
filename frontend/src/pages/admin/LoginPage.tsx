import { useCallback, useState } from 'react';
import { Button, Form, Input } from 'antd';
import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { message } from '@/utils/notify';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { formatApiError } from '@/api/client';
import ThemeSwitcher from '@/components/common/ThemeSwitcher';
import SliderCaptcha from '@/components/auth/SliderCaptcha';

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [captcha, setCaptcha] = useState<{ id: string; x: number } | null>(null);
  const [resetSignal, setResetSignal] = useState(0);

  // Stable callbacks — SliderCaptcha refetches whenever these change, so they
  // must not be recreated every render.
  const onSolved = useCallback((id: string, x: number) => setCaptcha({ id, x }), []);
  const onReset = useCallback(() => setCaptcha(null), []);

  async function onFinish(values: { username: string; password: string; email: string }) {
    if (!captcha) {
      message.warning('请先拖动滑块完成验证');
      return;
    }
    setSubmitting(true);
    try {
      await login(values.username, values.password, values.email.trim(), captcha.id, captcha.x);
      const next = (location.state as { from?: string } | null)?.from ?? '/admin';
      navigate(next, { replace: true });
    } catch (err) {
      message.error(formatApiError(err, '登录失败'));
      // The puzzle is single-use and now spent — issue a fresh one.
      setResetSignal((s) => s + 1);
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
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input
              autoFocus
              size="large"
              placeholder="用户名"
              autoComplete="off"
              prefix={<UserOutlined />}
            />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password
              size="large"
              placeholder="密码"
              autoComplete="new-password"
              prefix={<LockOutlined />}
            />
          </Form.Item>
          <Form.Item
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input
              size="large"
              placeholder="账号绑定的邮箱"
              autoComplete="off"
              prefix={<MailOutlined />}
            />
          </Form.Item>

          <Form.Item>
            <SliderCaptcha onSolved={onSolved} onReset={onReset} resetSignal={resetSignal} />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            loading={submitting}
            disabled={!captcha}
            block
            size="large"
          >
            登 录
          </Button>
        </Form>

        <div className="jz-login-foot" aria-hidden>一份内容 · 两种形态</div>
      </div>
    </div>
  );
}
