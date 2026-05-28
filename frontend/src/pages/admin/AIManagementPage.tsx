import { useEffect, useState } from 'react';
import {
  Alert,
  Card,
  Col,
  Row,
  Segmented,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  JzAiIcon,
  JzOverviewIcon,
  JzModelIcon,
  JzUsageIcon,
  JzSettingsIcon,
} from '@/components/common/JzIcon';
import {
  getAISettings,
  getCapabilities,
  updateAISettings,
  type AIAdminSettings,
  type AICapabilities,
} from '@/api/ai';
import { apiClient, formatApiError } from '@/api/client';
import {
  type UsageResponse,
  MyModelPreferenceSection,
  OverviewSection,
  ModelsSection,
  UsageSection,
  SettingsSection,
} from '@/components/admin/ai/AIPageSections';

const { Title, Paragraph } = Typography;

export default function AIManagementPage() {
  const [tab, setTab] = useState<'overview' | 'models' | 'usage' | 'settings'>('overview');
  const [cap, setCap] = useState<AICapabilities | null>(null);
  const [settings, setSettings] = useState<AIAdminSettings | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCapabilities(), getAISettings()])
      .then(([c, s]) => {
        if (cancelled) return;
        setCap(c);
        setSettings(s);
      })
      .catch((e) => !cancelled && setError(formatApiError(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<UsageResponse>(`/ai/usage/?days=${days}`)
      .then(({ data }) => !cancelled && setUsage(data))
      .catch((e) => !cancelled && message.warning('用量加载失败：' + formatApiError(e)));
    return () => {
      cancelled = true;
    };
  }, [days, tab]);

  async function patchSettings(p: Partial<AIAdminSettings>) {
    if (!settings) return;
    setSaving(true);
    try {
      const next = await updateAISettings(p);
      setSettings(next);
      message.success('已保存');
    } catch (e) {
      message.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin />
      </div>
    );
  }
  if (error) return <Alert type="error" message={error} showIcon />;
  if (!cap || !settings) return null;

  // Global state — enabled vs disabled by the admin switch.
  const globalStatusTag = !cap.enabled ? (
    <Tag color="warning" icon={<WarningOutlined />}>已禁用</Tag>
  ) : !cap.configured ? (
    <Tag color="default" icon={<WarningOutlined />}>未配置任何 API KEY</Tag>
  ) : (
    <Tag color="success" icon={<CheckCircleOutlined />}>运行中</Tag>
  );

  // Per-provider chips — drives the badge color + tooltip. `providers_configured`
  // is a recent field; legacy backends omit it and we fall back to the single
  // `cap.configured` boolean by hiding the per-provider chips entirely.
  const providers: { id: 'anthropic' | 'qwen'; label: string; envVar: string }[] = [
    { id: 'anthropic', label: 'Anthropic Claude', envVar: 'ANTHROPIC_API_KEY' },
    { id: 'qwen', label: '阿里通义千问', envVar: 'DASHSCOPE_API_KEY' },
  ];
  const providerChips = cap.providers_configured ? providers.map((p) => {
    const ok = cap.providers_configured![p.id];
    return (
      <Tooltip
        key={p.id}
        title={ok ? `${p.envVar} 已配置 — ${p.label} 可用` : `在 backend/.env 设置 ${p.envVar} 并重启 Django`}
      >
        <Tag
          icon={ok ? <CheckCircleOutlined /> : <WarningOutlined />}
          color={ok ? 'success' : 'default'}
        >
          {p.label}{ok ? ' ✓' : ' · 未配置'}
        </Tag>
      </Tooltip>
    );
  }) : null;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Hero */}
      <Card className="jz-ai-hero">
        <Row gutter={[24, 16]} align="middle">
          <Col flex="auto">
            <Title level={3} style={{ marginTop: 0, marginBottom: 8 }}>
              <JzAiIcon size={22} style={{ marginRight: 10, color: 'var(--jz-accent)' }} />
              AI 助手
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 8 }}>
              基于 Anthropic Claude 与阿里通义千问的写作 / 阅读助手。
              所有调用走后端代理，API key 永远不暴露给前端。
            </Paragraph>
            <Space size={8} wrap>
              {globalStatusTag}
              {providerChips}
              <Tooltip title="全局默认模型 — 用户没设置个人偏好时调用此模型">
                <Tag color="blue">默认: {settings.default_model}</Tag>
              </Tooltip>
            </Space>
          </Col>
          <Col>
            <Segmented
              value={tab}
              onChange={(v) => setTab(v as typeof tab)}
              options={[
                {
                  value: 'overview',
                  label: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <JzOverviewIcon /> 概览
                    </span>
                  ),
                },
                {
                  value: 'models',
                  label: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <JzModelIcon /> 模型
                    </span>
                  ),
                },
                {
                  value: 'usage',
                  label: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <JzUsageIcon /> 用量
                    </span>
                  ),
                },
                {
                  value: 'settings',
                  label: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <JzSettingsIcon /> 设置
                    </span>
                  ),
                },
              ]}
            />
          </Col>
        </Row>
      </Card>

      {tab === 'overview' && (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <MyModelPreferenceSection cap={cap} />
          <OverviewSection cap={cap} settings={settings} usage={usage} />
        </Space>
      )}
      {tab === 'models' && (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <MyModelPreferenceSection cap={cap} />
          <ModelsSection
            cap={cap}
            settings={settings}
            saving={saving}
            onPatch={patchSettings}
          />
        </Space>
      )}
      {tab === 'usage' && (
        <UsageSection
          usage={usage}
          days={days}
          onDaysChange={setDays}
        />
      )}
      {tab === 'settings' && (
        <SettingsSection
          settings={settings}
          saving={saving}
          onPatch={patchSettings}
          cap={cap}
        />
      )}
    </Space>
  );
}
