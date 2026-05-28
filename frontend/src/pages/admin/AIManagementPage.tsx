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

  const statusTag = !cap.configured ? (
    <Tag color="default" icon={<WarningOutlined />}>未配置 API KEY</Tag>
  ) : !cap.enabled ? (
    <Tag color="warning" icon={<WarningOutlined />}>已禁用</Tag>
  ) : (
    <Tag color="success" icon={<CheckCircleOutlined />}>运行中</Tag>
  );

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
              基于 Anthropic Claude 的写作 / 阅读助手。
              所有调用走后端代理，API key 永远不暴露给前端。
            </Paragraph>
            <Space size={8}>{statusTag}<Tag>{settings.default_model}</Tag></Space>
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
