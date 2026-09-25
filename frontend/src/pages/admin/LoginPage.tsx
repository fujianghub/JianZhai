import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Form, Input } from 'antd';
import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { message } from '@/utils/notify';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { formatApiError } from '@/api/client';
import ThemeSwitcher from '@/components/common/ThemeSwitcher';
import SliderCaptcha from '@/components/auth/SliderCaptcha';
import BrandSeal from '@/components/common/BrandSeal';
import InkCat from '@/components/auth/InkCat';
import { resolveMood, type LoginField, type LoginMood } from '@/components/auth/loginMood';
import type { CatBehavior } from '@/components/auth/inkcat/catEngine';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useThemeStore } from '@/stores/theme';
import { coatForTheme } from '@/components/auth/inkcat/coats';
import { prefersReducedMotion } from '@/utils/motionPref';

/** 左栏题注：随水墨猫心境换一句 */
const MOOD_CAPTION: Record<LoginMood, string> = {
  idle: '开卷有益，且坐片刻',
  scout: '嗯？来者何人',
  typing: '嗯，再记下邮箱……',
  cover: '非礼勿视！（脸红）',
  peek: '嘿嘿，就看一眼',
  captcha: '往右些……再往右些',
  error: '诶？好像哪里不对……',
  success: '请进～',
};
/** 空闲小动作的题注（仅 idle 心境下替换）：古灵精怪 + 容易害羞 */
const BEHAVIOR_CAPTION: Partial<Record<CatBehavior, string>> = {
  sleep: '打个盹…… zZ',
  wake: '唔！谁？',
  shy: '呀！别、别摸……',
  purr: '……再摸一下也行',
  belly: '（翻出肚皮）',
  wink: '（眨眼）',
  blep: '略略略～',
  hunt: '（盯——）',
  yawn: '哈——欠',
  lick: '先理理毛',
};
const HOVER_CAPTION = '别、别一直盯着我看……';
/** 偷看念出的用户名最多几个字 */
const NAME_PEEK = 6;
/** 目光随光标：输入这么多字时看到最右 */
const TYPING_FULL = 22;

const ERROR_MS = 2400;
const SUCCESS_DELAY_MS = 760; // 猫跳起 + 盖「准」印

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [captcha, setCaptcha] = useState<{ id: string; x: number } | null>(null);
  const [resetSignal, setResetSignal] = useState(0);

  // 水墨猫心境输入
  const [focus, setFocus] = useState<LoginField | null>(null);
  const [pwdVisible, setPwdVisible] = useState(false);
  const [captchaProgress, setCaptchaProgress] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const password: string | undefined = Form.useWatch('password', form);
  const username: string | undefined = Form.useWatch('username', form);
  // 毛色只有黑白：浅色系主题黑猫、暗色系主题白猫
  const coat = coatForTheme(useThemeStore((s) => s.mode));
  const [typingLen, setTypingLen] = useState(0);
  const [keyPulse, setKeyPulse] = useState({ tick: 0, del: false });
  const [catBehavior, setCatBehavior] = useState<CatBehavior>('none');
  const [catHover, setCatHover] = useState(false);
  const lens = useRef<Record<string, number>>({});
  const wide = useMediaQuery('(min-width: 900px)');
  const errorTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(errorTimer.current), []);

  const mood = resolveMood({
    focus,
    passwordVisible: pwdVisible,
    passwordFilled: !!password,
    captchaProgress,
    error,
    success,
  });

  // Stable callbacks — SliderCaptcha refetches whenever these change, so they
  // must not be recreated every render.
  const onSolved = useCallback((id: string, x: number) => setCaptcha({ id, x }), []);
  const onReset = useCallback(() => setCaptcha(null), []);

  const focusProps = (field: LoginField) => ({
    onFocus: () => {
      setFocus(field);
      setTypingLen(String(form.getFieldValue(field) ?? '').length);
    },
    onBlur: () => setFocus((f) => (f === field ? null : f)),
  });

  function flagError() {
    window.clearTimeout(errorTimer.current);
    setError(false);
    // 下一帧再置位，保证连续失败时抖动/摇头动画重播
    requestAnimationFrame(() => setError(true));
    errorTimer.current = window.setTimeout(() => setError(false), ERROR_MS);
  }

  async function onFinish(values: { username: string; password: string; email: string }) {
    if (!captcha) {
      message.warning('请先拖动滑块完成验证');
      return;
    }
    setSubmitting(true);
    try {
      await login(values.username, values.password, values.email.trim(), captcha.id, captcha.x);
      const next = (location.state as { from?: string } | null)?.from ?? '/admin';
      window.clearTimeout(errorTimer.current);
      setError(false);
      setSuccess(true);
      if (!prefersReducedMotion()) await new Promise((r) => setTimeout(r, SUCCESS_DELAY_MS));
      navigate(next, { replace: true });
    } catch (err) {
      message.error(formatApiError(err, '登录失败'));
      flagError();
      // The puzzle is single-use and now spent — issue a fresh one.
      setResetSignal((s) => s + 1);
    } finally {
      setSubmitting(false);
    }
  }

  // 打字：目光随长度右移 + 每键一次脉冲（删除时反向歪头）
  function onValuesChange(changed: Record<string, unknown>) {
    const [field, value] = Object.entries(changed)[0] ?? [];
    if (!field) return;
    const len = String(value ?? '').length;
    const prev = lens.current[field] ?? 0;
    lens.current[field] = len;
    setTypingLen(len);
    setKeyPulse((k) => ({ tick: k.tick + 1, del: len < prev }));
  }

  const name = (username ?? '').trim();
  const caption =
    mood === 'scout' && name
      ? `嗯？是『${[...name].slice(0, NAME_PEEK).join('')}${[...name].length > NAME_PEEK ? '…' : ''}』吗` // 题注外层已有「」，内层用『』
      : mood !== 'idle'
        ? MOOD_CAPTION[mood]
        : (BEHAVIOR_CAPTION[catBehavior] ?? (catHover ? HOVER_CAPTION : MOOD_CAPTION.idle));
  // 题注淡入只在「换一种心情」时重播；逐字念名字时不闪
  const captionKey = `${mood}|${catBehavior}|${catHover}`;
  const catProps = {
    mood,
    coat,
    captchaProgress,
    typingProgress: Math.min(1, typingLen / TYPING_FULL),
    keyPulse,
  };

  function onPwdKey(e: React.KeyboardEvent) {
    setCapsOn(e.getModifierState?.('CapsLock') ?? false);
  }

  return (
    <div className="jz-glass jz-login">
      <div className="jz-login-glow" aria-hidden />
      <div className="jz-login-theme">
        <ThemeSwitcher />
      </div>

      <div className={`jz-login-shell jz-fade-in${error ? ' is-error' : ''}`} data-mood={mood}>
        <aside className="jz-login-art">
          {wide && (
            <div className="jz-login-art-cat" aria-hidden>
              <InkCat {...catProps} onBehavior={setCatBehavior} onHover={setCatHover} />
            </div>
          )}
          <p className="jz-login-art-caption" key={captionKey} aria-hidden>
            {caption}
          </p>
          <div className="jz-login-art-foot" aria-hidden>
            一份内容 · 两种形态
          </div>
        </aside>

        <div className="jz-login-card jz-seal-host">
          {!wide && (
            <div className="jz-login-peek" aria-hidden>
              <InkCat {...catProps} variant="peek" />
            </div>
          )}
          <BrandSeal size="lg" className="jz-login-seal" />
          <h1 className="jz-login-title">简斋 · JianZhai</h1>
          <p className="jz-login-sub">个 人 知 识 库 · 个 人 博 客</p>

          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            onValuesChange={onValuesChange}
            requiredMark={false}
            autoComplete="off"
            className="jz-login-form"
          >
            <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input
                autoFocus
                size="large"
                placeholder="用户名"
                aria-label="用户名"
                autoComplete="off"
                prefix={<UserOutlined />}
                {...focusProps('username')}
              />
            </Form.Item>
            <Form.Item
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
              extra={capsOn && focus === 'password' ? <span className="jz-login-caps">大写锁定已开启</span> : undefined}
            >
              <Input.Password
                size="large"
                placeholder="密码"
                aria-label="密码"
                autoComplete="new-password"
                prefix={<LockOutlined />}
                visibilityToggle={{ visible: pwdVisible, onVisibleChange: setPwdVisible }}
                onKeyDown={onPwdKey}
                onKeyUp={onPwdKey}
                {...focusProps('password')}
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
                aria-label="账号绑定的邮箱"
                autoComplete="off"
                prefix={<MailOutlined />}
                {...focusProps('email')}
              />
            </Form.Item>

            <Form.Item>
              <SliderCaptcha
                onSolved={onSolved}
                onReset={onReset}
                resetSignal={resetSignal}
                onDragProgress={setCaptchaProgress}
              />
            </Form.Item>

            <Button
              type="primary"
              htmlType="submit"
              loading={submitting || success}
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
    </div>
  );
}
