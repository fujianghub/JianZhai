import { useEffect, useState } from 'react';
import { Alert, Card, Col, Radio, Row, Space, Statistic, Tag, Tooltip, Typography } from 'antd';
import {
  CloudServerOutlined,
  CodeOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  PaperClipOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import MermaidDiagram from '@/components/common/MermaidDiagram';
import ArchitectureSVG from '@/components/admin/ArchitectureSVG';
import { useAuthStore } from '@/stores/auth';
import { getSystemInfo, type SystemInfo } from '@/api/admin';
import { formatApiError } from '@/api/client';

const { Title, Paragraph, Text } = Typography;

const REFRESH_MS = 30_000;

/** Convert bytes → human MB/GB with one decimal. Used by the attachments
 *  storage stat card. */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

interface StackItem {
  name: string;
  hint?: string;
}

interface StackLayer {
  title: string;
  icon: React.ReactNode;
  color: string;
  items: StackItem[];
}

const STACK: StackLayer[] = [
  {
    title: '后端',
    icon: <CodeOutlined />,
    color: 'geekblue',
    items: [
      { name: 'Python 3.12' },
      { name: 'Django 5.2', hint: 'Web 框架' },
      { name: 'DRF', hint: 'REST API' },
      { name: 'PostgreSQL 14+', hint: '主存储 + tsvector' },
      { name: 'Redis 7+', hint: '缓存 / Celery broker' },
      { name: 'Celery', hint: '异步任务（搜索分词 / 双向链接 / 导出）' },
      { name: 'jieba', hint: '中文分词' },
      { name: 'Playwright', hint: 'PDF 导出' },
      { name: 'python-docx', hint: 'Word 导出' },
      { name: 'markdown-it-py', hint: 'Markdown 解析' },
    ],
  },
  {
    title: '前端',
    icon: <GlobalOutlined />,
    color: 'magenta',
    items: [
      { name: 'React 18 + TypeScript' },
      { name: 'Vite', hint: '构建 / 开发代理' },
      { name: 'Ant Design 5', hint: 'UI 组件库' },
      { name: 'Zustand', hint: '状态管理' },
      { name: 'React Router v6' },
      { name: 'Tiptap', hint: '富文本编辑器（ProseMirror）' },
      { name: 'tiptap-markdown', hint: 'Markdown ↔ 富文本互转' },
      { name: 'lowlight + highlight.js', hint: '代码高亮' },
      { name: 'Mermaid', hint: '流程图 / 时序图' },
      { name: 'KaTeX', hint: '数学公式' },
    ],
  },
  {
    title: '基础设施',
    icon: <CloudServerOutlined />,
    color: 'green',
    items: [
      { name: 'Docker Compose', hint: 'postgres + redis 一键起' },
      { name: 'Session Auth', hint: 'Django 自带' },
      { name: '本地文件系统', hint: 'MEDIA_ROOT' },
      { name: 'PostgreSQL GIN', hint: '全文搜索索引' },
      { name: 'pnpm + uv', hint: '依赖管理' },
    ],
  },
];

/** 自动保存请求时序 — 体现 on_commit + Celery 把重活移出请求路径。
 *
 *  ``Note`` 文本里避免使用 ``<`` ``()`` 等会被 Mermaid 当作 HTML / 形状符的字符；
 *  消息文本同理。中文标点都 OK。
 */
const SAVE_FLOW_DIAGRAM = `
sequenceDiagram
  autonumber
  participant U as 用户
  participant E as Tiptap 编辑器
  participant FE as React 父组件
  participant API as Django + DRF
  participant DB as PostgreSQL
  participant Q as Celery 队列
  participant W as Celery Worker

  U->>E: 敲键盘
  Note over E: onUpdate 200ms 防抖
  E->>FE: 推送 Markdown
  Note over FE: 自动保存 5s 防抖
  FE->>API: PATCH 文档
  API->>DB: UPDATE document
  Note over API,DB: transaction.on_commit
  API->>Q: 入队 刷新搜索向量
  API->>Q: 入队 重建双向链接
  API-->>FE: 200 OK 约 50ms
  FE-->>U: 已保存
  W->>Q: 拉取任务
  W->>DB: jieba 分词 写入 tsvector
  W->>DB: 解析 mention 写入 DocumentLink
`.trim();

export default function SystemOverviewPage() {
  const { user } = useAuthStore();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function tick() {
      try {
        const data = await getSystemInfo();
        if (cancelled) return;
        setInfo(data);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(formatApiError(e));
      } finally {
        if (!cancelled) setLoadedOnce(true);
      }
    }

    void tick();
    timer = window.setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, []);

  if (!user?.is_superuser) {
    return (
      <Alert
        type="warning"
        showIcon
        message="权限不足"
        description="本页面仅对超级管理员开放。"
      />
    );
  }

  const c = info?.counts;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* ─── Hero ───────────────────────────────────────────── */}
      <Card>
        <Title level={3} style={{ marginTop: 0 }}>
          架构总览
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          简斋 / JianZhai 是一个本地单机部署的「个人知识库 + 个人博客」一体化系统。
          前端 React + Tiptap 富文本编辑器，后端 Django + DRF，PostgreSQL 全文搜索（jieba 中文分词预处理），
          重活通过 Celery 异步化以保证编辑器自动保存秒级响应。
        </Paragraph>
        {info && (
          <div style={{ marginTop: 12 }}>
            <Space size={[8, 8]} wrap>
              <Tag icon={<CodeOutlined />}>Python {info.runtime.python}</Tag>
              <Tag icon={<ThunderboltOutlined />}>Django {info.runtime.django}</Tag>
              <Tag color={info.runtime.debug ? 'orange' : 'default'}>
                DEBUG = {info.runtime.debug ? 'true' : 'false'}
              </Tag>
              <Tooltip title={info.runtime.platform}>
                <Tag icon={<CloudServerOutlined />}>{info.runtime.platform.split('-')[0]}</Tag>
              </Tooltip>
              <Tag>服务器时间 {new Date(info.server_time).toLocaleString('zh-CN')}</Tag>
            </Space>
          </div>
        )}
        {error && (
          <Alert
            type="error"
            showIcon
            message="加载系统信息失败"
            description={error}
            style={{ marginTop: 12 }}
          />
        )}
      </Card>

      {/* ─── Live stats ─────────────────────────────────────── */}
      <Card
        title="实时数据"
        size="small"
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            每 30 秒自动刷新
          </Text>
        }
      >
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={8} md={6}>
            <Statistic
              title="知识库"
              value={c?.knowledge_bases ?? '—'}
              prefix={<DatabaseOutlined />}
              loading={!loadedOnce}
            />
          </Col>
          <Col xs={12} sm={8} md={6}>
            <Statistic
              title="文件夹"
              value={c?.folders ?? '—'}
              prefix={<FolderOpenOutlined />}
              loading={!loadedOnce}
            />
          </Col>
          <Col xs={12} sm={8} md={6}>
            <Statistic
              title="文档总数"
              value={c?.documents_total ?? '—'}
              prefix={<FileTextOutlined />}
              loading={!loadedOnce}
              suffix={
                c ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    / 已发布 {c.documents_published}
                  </Text>
                ) : null
              }
            />
          </Col>
          <Col xs={12} sm={8} md={6}>
            <Statistic
              title="近 24h 编辑"
              value={c?.documents_updated_24h ?? '—'}
              prefix={<ThunderboltOutlined />}
              loading={!loadedOnce}
            />
          </Col>
          <Col xs={12} sm={8} md={6}>
            <Statistic
              title="公开文档"
              value={c?.documents_public ?? '—'}
              prefix={<GlobalOutlined />}
              loading={!loadedOnce}
            />
          </Col>
          <Col xs={12} sm={8} md={6}>
            <Statistic
              title="用户"
              value={c?.users_active ?? '—'}
              prefix={<TeamOutlined />}
              loading={!loadedOnce}
              suffix={
                c ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    / 共 {c.users_total}
                  </Text>
                ) : null
              }
            />
          </Col>
          <Col xs={12} sm={8} md={6}>
            <Statistic
              title="附件"
              value={c?.attachments_total ?? '—'}
              prefix={<PaperClipOutlined />}
              loading={!loadedOnce}
            />
          </Col>
          <Col xs={12} sm={8} md={6}>
            <Statistic
              title="附件占用"
              value={c ? formatBytes(c.attachments_bytes) : '—'}
              prefix={<DatabaseOutlined />}
              loading={!loadedOnce}
            />
          </Col>
        </Row>
      </Card>

      {/* ─── Tech stack ─────────────────────────────────────── */}
      <Card title="技术栈" size="small">
        <Row gutter={[16, 16]}>
          {STACK.map((layer) => (
            <Col xs={24} md={8} key={layer.title}>
              <Card
                size="small"
                title={
                  <Space size={6}>
                    {layer.icon}
                    <span>{layer.title}</span>
                  </Space>
                }
                style={{ height: '100%' }}
              >
                <Space size={[6, 8]} wrap>
                  {layer.items.map((it) => {
                    const tag = <Tag color={layer.color}>{it.name}</Tag>;
                    return it.hint ? (
                      <Tooltip key={it.name} title={it.hint}>
                        {tag}
                      </Tooltip>
                    ) : (
                      <span key={it.name}>{tag}</span>
                    );
                  })}
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      {/* ─── Architecture diagram ───────────────────────────── */}
      <ArchitectureSection />

      {/* ─── Save flow ─────────────────────────────────────── */}
      <Card title="自动保存请求时序" size="small">
        <Paragraph type="secondary">
          编辑器到 PostgreSQL 的完整链路。<code>transaction.on_commit</code>{' '}
          确保任务在数据库写入提交之后才入队，避免 worker 拉到旧状态；客户端不必等待索引/链接更新即可拿到 200。
        </Paragraph>
        <MermaidDiagram source={SAVE_FLOW_DIAGRAM} />
      </Card>
    </Space>
  );
}

const SIMPLE_ARCH_DIAGRAM = `flowchart LR
  user([👤 用户])
  fe[🎨 React SPA<br/>localhost:3001]
  be[🐍 Django + DRF<br/>localhost:8002]
  db[(🗄️ PostgreSQL)]
  ai[🤖 Anthropic Claude API]

  user -->|浏览/编辑| fe
  fe -->|REST + SSE| be
  be -->|ORM| db
  be -.->|AI 助手| ai

  classDef ext stroke:#999,stroke-dasharray:4 4
  class ai ext`;

/**
 * Simple vs Detailed architecture diagrams. Detail toggle lives on this card
 * so newcomers can grok the 4-box overview, then drill into the full SVG with
 * Celery / Redis / each Django app.
 */
function ArchitectureSection() {
  const [mode, setMode] = useState<'simple' | 'detailed'>('simple');
  return (
    <Card
      title="系统架构图"
      size="small"
      extra={
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} size="small">
          <Radio.Button value="simple">简单版</Radio.Button>
          <Radio.Button value="detailed">详细版</Radio.Button>
        </Radio.Group>
      }
    >
      {mode === 'simple' ? (
        <>
          <Paragraph type="secondary">
            最小心智模型：用户 → 前端 SPA → 后端 Django →
            PostgreSQL。AI 助手是外部依赖（虚线），所有 AI 调用都走后端代理。
          </Paragraph>
          <MermaidDiagram source={SIMPLE_ARCH_DIAGRAM} />
        </>
      ) : (
        <>
          <Paragraph type="secondary">
            四层结构：客户端 SPA → Vite 边缘代理 → Django 应用层（10 个 app + Celery worker）→ 持久层（PG / Redis / 本地文件系统）。
            主请求路径上的紫色光点交错流动 —— 浏览器到 PostgreSQL 的同步 ORM 调用；虚线箭头是异步 / 公开访问。
            鼠标悬停每个节点会显示更详细的说明。
          </Paragraph>
          <ArchitectureSVG />
        </>
      )}
    </Card>
  );
}

// AI settings moved to a dedicated /admin/ai page — see AIManagementPage.tsx
