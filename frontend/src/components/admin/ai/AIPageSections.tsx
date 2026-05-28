import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Col,
  Empty,
  InputNumber,
  Progress,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ApiOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { JzAiIcon } from '@/components/common/JzIcon';
import dayjs from 'dayjs';
import {
  type AIAdminSettings,
  type AICapabilities,
  type AIModelOption,
} from '@/api/ai';
import { resolveAIModel, writeAIModel, readAIModelFromStorage } from '@/utils/aiModel';

const { Paragraph, Text } = Typography;

export interface UsageResponse {
  window_days: number;
  totals: {
    calls: number;
    input_tokens: number;
    output_tokens: number;
    failed: number;
  };
  by_model: Array<{ model: string; calls: number; input_tokens: number; output_tokens: number }>;
  by_day: Array<{ day: string; calls: number; input_tokens: number; output_tokens: number }>;
  by_operation: Array<{ operation: string; calls: number }>;
  recent: Array<{
    id: number;
    user: string | null;
    operation: string;
    model: string;
    streaming: boolean;
    input_tokens: number;
    output_tokens: number;
    duration_ms: number;
    succeeded: boolean;
    error: string;
    created_at: string;
  }>;
}

export const OP_LABEL: Record<string, string> = {
  continue: '续写',
  polish: '润色',
  expand: '扩写',
  fix: '纠错',
  summarize: '总结',
  outline: '生成大纲',
  translate_en: '翻译为英文',
  translate_zh: '翻译为中文',
};

/* ─── My model preference (localStorage, global for editor / selection AI) ─ */
export function MyModelPreferenceSection({ cap }: { cap: AICapabilities }) {
  const [preferredId, setPreferredId] = useState(() => resolveAIModel(cap, readAIModelFromStorage()));

  useEffect(() => {
    const sync = () => setPreferredId(resolveAIModel(cap, readAIModelFromStorage()));
    window.addEventListener('jz-ai-model-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('jz-ai-model-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, [cap]);

  return (
    <Card title="我的 AI 模型" size="small">
      <Paragraph type="secondary" style={{ marginBottom: 12 }}>
        此选择对编辑器工具栏、选区 AI、文档 AI 面板全局生效，保存在本浏览器。
      </Paragraph>
      <Row gutter={[16, 16]}>
        {cap.models.map((m) => {
          const active = preferredId === m.id;
          return (
            <Col xs={24} md={8} key={m.id}>
              <Card
                size="small"
                hoverable
                onClick={() => {
                  writeAIModel(m.id);
                  setPreferredId(m.id);
                  message.success(`已切换为 ${m.label}`);
                }}
                className={'jz-model-card' + (active ? ' is-active' : '')}
                style={{
                  cursor: 'pointer',
                  borderColor: active ? 'var(--jz-accent)' : undefined,
                  background: active
                    ? 'color-mix(in srgb, var(--jz-accent) 8%, var(--jz-surface))'
                    : undefined,
                }}
              >
                <Space direction="vertical" style={{ width: '100%' }} size={4}>
                  <Space size={6}>
                    <JzAiIcon
                      size={16}
                      style={{ color: active ? 'var(--jz-accent)' : 'var(--jz-text-muted)' }}
                    />
                    <Text strong style={{ fontSize: 15 }}>
                      {m.label}
                    </Text>
                    {m.provider === 'qwen' && (
                      <Tag color="orange" style={{ marginRight: 0 }}>阿里</Tag>
                    )}
                    {active && <Tag color="success">当前</Tag>}
                  </Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {m.hint}
                  </Text>
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>
    </Card>
  );
}

/* ─── Overview ───────────────────────────────────────────────────────── */
export function OverviewSection({
  cap,
  settings,
  usage,
}: {
  cap: AICapabilities;
  settings: AIAdminSettings;
  usage: UsageResponse | null;
}) {
  const totals = usage?.totals ?? { calls: 0, input_tokens: 0, output_tokens: 0, failed: 0 };
  const topModel = usage?.by_model?.[0];
  const successRate = totals.calls
    ? Math.round(((totals.calls - totals.failed) / totals.calls) * 100)
    : 100;

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={6}>
        <Card>
          <Statistic
            title="最近 30 天调用"
            value={totals.calls}
            prefix={<ApiOutlined />}
            valueStyle={{ color: 'var(--jz-accent)' }}
          />
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card>
          <Statistic title="输入 Token" value={totals.input_tokens} groupSeparator="," />
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card>
          <Statistic
            title="输出 Token"
            value={totals.output_tokens}
            groupSeparator=","
            valueStyle={{ color: 'var(--jz-gold)' }}
          />
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card>
          <Statistic
            title="成功率"
            value={successRate}
            suffix="%"
            prefix={<CheckCircleOutlined />}
            valueStyle={{ color: successRate >= 95 ? '#52c41a' : '#faad14' }}
          />
          <Progress percent={successRate} showInfo={false} size="small" style={{ marginTop: 4 }} />
        </Card>
      </Col>
      <Col xs={24} md={12} style={{ display: 'flex' }}>
        <CurrentModelCard cap={cap} settings={settings} />
      </Col>
      <Col xs={24} md={12} style={{ display: 'flex' }}>
        <Card title="用量最高的模型" size="small" style={{ width: '100%', height: '100%' }}>
          {topModel ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--jz-text)' }}>
                {cap.models.find((m) => m.id === topModel.model)?.label ?? topModel.model}
              </div>
              <Space size={16} style={{ marginTop: 8 }}>
                <Text>调用 <strong>{topModel.calls}</strong> 次</Text>
                <Text type="secondary">
                  in {topModel.input_tokens.toLocaleString()} / out {topModel.output_tokens.toLocaleString()}
                </Text>
              </Space>
            </>
          ) : (
            <Empty description="近期无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>
      </Col>
    </Row>
  );
}

/** "当前模型" — shows the user's *effective* model (the personal preference
 *  from localStorage if set, otherwise the admin global default). Reacts to
 *  jz-ai-model-changed events so toggles from MyModelPreferenceSection or the
 *  header AIModelBadge update in real time. */
function CurrentModelCard({
  cap,
  settings,
}: {
  cap: AICapabilities;
  settings: AIAdminSettings;
}) {
  const [preferredId, setPreferredId] = useState(() =>
    resolveAIModel(cap, readAIModelFromStorage()),
  );
  useEffect(() => {
    const sync = () => setPreferredId(resolveAIModel(cap, readAIModelFromStorage()));
    window.addEventListener('jz-ai-model-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('jz-ai-model-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, [cap]);

  const effective = cap.models.find((m) => m.id === preferredId);
  const defaultModel = cap.models.find((m) => m.id === settings.default_model);
  const personalOverride = preferredId !== settings.default_model;

  return (
    <Card title="当前模型" size="small" style={{ width: '100%', height: '100%' }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 22, fontWeight: 600, color: 'var(--jz-text)' }}>
            {effective?.label ?? preferredId}
          </span>
          {personalOverride && (
            <Tag color="processing" style={{ marginRight: 0 }}>个人偏好</Tag>
          )}
        </div>
        <Text type="secondary">{effective?.hint}</Text>
        {personalOverride && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            全局默认：{defaultModel?.label ?? settings.default_model}
          </Text>
        )}
        <Text type="secondary" style={{ fontSize: 12 }}>
          单次输出上限：{settings.max_tokens.toLocaleString()} token
        </Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          最后更新：{settings.updated_at ? dayjs(settings.updated_at).format('YYYY-MM-DD HH:mm') : '—'}
        </Text>
      </Space>
    </Card>
  );
}

/* ─── Models ─────────────────────────────────────────────────────────── */
export function ModelsSection({
  cap,
  settings,
  saving,
  onPatch,
}: {
  cap: AICapabilities;
  settings: AIAdminSettings;
  saving: boolean;
  onPatch: (p: Partial<AIAdminSettings>) => Promise<void>;
}) {
  return (
    <Card title="模型切换" size="small">
      <Paragraph type="secondary">
        点击任意模型设为站点全局默认（后端配置）。个人偏好请在上方「我的 AI 模型」中选择。
      </Paragraph>
      <Row gutter={[16, 16]}>
        {cap.models.map((m) => {
          const active = settings.default_model === m.id;
          return (
            <Col xs={24} md={8} key={m.id}>
              <Card
                size="small"
                hoverable
                onClick={() => !active && !saving && onPatch({ default_model: m.id })}
                className={'jz-model-card' + (active ? ' is-active' : '')}
                style={{
                  cursor: active ? 'default' : 'pointer',
                  borderColor: active ? 'var(--jz-accent)' : undefined,
                  background: active ? 'color-mix(in srgb, var(--jz-accent) 8%, var(--jz-surface))' : undefined,
                }}
              >
                <Space direction="vertical" style={{ width: '100%' }} size={4}>
                  <Space size={6}>
                    <JzAiIcon
                      size={16}
                      style={{ color: active ? 'var(--jz-accent)' : 'var(--jz-text-muted)' }}
                    />
                    <Text strong style={{ fontSize: 15 }}>{m.label}</Text>
                    {active && <Tag color="success">默认</Tag>}
                  </Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>{m.hint}</Text>
                  <Text type="secondary" style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>
                    {m.id}
                  </Text>
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>
    </Card>
  );
}

/* ─── Usage ──────────────────────────────────────────────────────────── */
export function UsageSection({
  usage,
  days,
  onDaysChange,
}: {
  usage: UsageResponse | null;
  days: number;
  onDaysChange: (d: number) => void;
}) {
  const sparkData = usage?.by_day ?? [];
  const maxCalls = useMemo(() => Math.max(1, ...sparkData.map((d) => d.calls)), [sparkData]);

  const opCols = [
    { title: '操作', dataIndex: 'operation', render: (op: string) => OP_LABEL[op] ?? op },
    { title: '调用次数', dataIndex: 'calls', align: 'right' as const },
  ];
  const modelCols = [
    { title: '模型', dataIndex: 'model' },
    { title: '调用次数', dataIndex: 'calls', align: 'right' as const },
    {
      title: '输入 Token',
      dataIndex: 'input_tokens',
      align: 'right' as const,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: '输出 Token',
      dataIndex: 'output_tokens',
      align: 'right' as const,
      render: (v: number) => v.toLocaleString(),
    },
  ];
  const recentCols = [
    {
      title: '时间',
      dataIndex: 'created_at',
      render: (v: string) => (
        <span style={{ fontSize: 12 }}>{dayjs(v).format('MM-DD HH:mm:ss')}</span>
      ),
    },
    {
      title: '用户',
      dataIndex: 'user',
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: '操作',
      dataIndex: 'operation',
      render: (op: string) => OP_LABEL[op] ?? op,
    },
    { title: '模型', dataIndex: 'model', render: (v: string) => <Text style={{ fontSize: 11 }}>{v}</Text> },
    {
      title: 'Token (in/out)',
      key: 'tokens',
      render: (_: unknown, r: UsageResponse['recent'][number]) => (
        <span style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>
          {r.input_tokens} / {r.output_tokens}
        </span>
      ),
    },
    {
      title: '耗时',
      dataIndex: 'duration_ms',
      render: (v: number) => (
        <span style={{ fontSize: 12, color: v > 5000 ? '#faad14' : 'inherit' }}>
          {(v / 1000).toFixed(1)}s
        </span>
      ),
    },
    {
      title: '状态',
      key: 'status',
      render: (_: unknown, r: UsageResponse['recent'][number]) =>
        r.succeeded ? (
          <Tag color="success">成功</Tag>
        ) : (
          <Tag color="error" title={r.error}>失败</Tag>
        ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card
        size="small"
        title={<span><ClockCircleOutlined /> 时间窗口</span>}
        extra={
          <Radio.Group value={days} onChange={(e) => onDaysChange(e.target.value)} size="small">
            <Radio.Button value={7}>7 天</Radio.Button>
            <Radio.Button value={30}>30 天</Radio.Button>
            <Radio.Button value={90}>90 天</Radio.Button>
            <Radio.Button value={365}>1 年</Radio.Button>
          </Radio.Group>
        }
      >
        {!usage || usage.by_day.length === 0 ? (
          <Empty description="该窗口内无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div className="jz-spark">
            {sparkData.map((d) => (
              <div key={d.day} className="jz-spark-col" title={`${d.day}：${d.calls} 次`}>
                <div
                  className="jz-spark-bar"
                  style={{ height: `${Math.max(2, (d.calls / maxCalls) * 100)}%` }}
                />
                <div className="jz-spark-label">{dayjs(d.day).format('MM-DD')}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title="按操作分组" size="small">
            <Table
              size="small"
              pagination={false}
              rowKey="operation"
              dataSource={usage?.by_operation ?? []}
              columns={opCols}
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="按模型分组" size="small">
            <Table
              size="small"
              pagination={false}
              rowKey="model"
              dataSource={usage?.by_model ?? []}
              columns={modelCols}
            />
          </Card>
        </Col>
      </Row>

      <Card title="最近调用" size="small">
        <Table
          size="small"
          pagination={false}
          rowKey="id"
          dataSource={usage?.recent ?? []}
          columns={recentCols}
        />
      </Card>
    </Space>
  );
}

/* ─── Settings ───────────────────────────────────────────────────────── */
export function SettingsSection({
  settings,
  saving,
  onPatch,
  cap,
}: {
  settings: AIAdminSettings;
  saving: boolean;
  onPatch: (p: Partial<AIAdminSettings>) => Promise<void>;
  cap: AICapabilities;
}) {
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card title="主开关" size="small">
        <Row align="middle" gutter={16}>
          <Col flex="auto">
            <Text strong>启用 AI 功能</Text>
            <div style={{ fontSize: 12, color: 'var(--jz-text-muted)', marginTop: 4 }}>
              关闭后所有 /ai/* 接口返回 503；前端按钮自动置灰。
            </div>
          </Col>
          <Col>
            <Switch
              checked={settings.enabled}
              disabled={saving}
              checkedChildren="启用"
              unCheckedChildren="禁用"
              onChange={(v) => void onPatch({ enabled: v })}
            />
          </Col>
        </Row>
      </Card>

      <Card title="默认模型" size="small">
        <Select
          value={settings.default_model}
          onChange={(v) => void onPatch({ default_model: v })}
          disabled={saving}
          style={{ width: '100%', maxWidth: 360 }}
          options={cap.models.map((m: AIModelOption) => ({
            value: m.id,
            label: `${m.label} — ${m.hint}`,
          }))}
        />
      </Card>

      <Card title="单次最大 Token" size="small">
        <Row align="middle" gutter={16}>
          <Col>
            <InputNumber
              min={64}
              max={8192}
              step={128}
              value={settings.max_tokens}
              disabled={saving}
              onChange={(v) => v != null && void onPatch({ max_tokens: Number(v) })}
              style={{ width: 160 }}
            />
          </Col>
          <Col flex="auto">
            <Text type="secondary" style={{ fontSize: 12 }}>
              较大值允许 AI 输出更长文本，但单次调用费用更高。范围 64–8192。
            </Text>
          </Col>
        </Row>
      </Card>

      <Card
        title={
          <span>
            <ThunderboltOutlined /> API 状态
          </span>
        }
        size="small"
      >
        <Row gutter={[8, 8]}>
          <Col xs={24} md={12}>
            <Text type="secondary">环境变量 ANTHROPIC_API_KEY：</Text>{' '}
            {cap.configured ? <Tag color="success">已配置</Tag> : <Tag color="error">未配置</Tag>}
          </Col>
          <Col xs={24} md={12}>
            <Text type="secondary">限流：</Text>
            <Tag>30 次 / 分钟 / 用户</Tag>
          </Col>
        </Row>
      </Card>
    </Space>
  );
}
