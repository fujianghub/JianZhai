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
  RobotOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import MermaidDiagram from '@/components/common/MermaidDiagram';
import ArchitectureSVG from '@/components/admin/ArchitectureSVG';
import simpleArchDiagram from '@dev-guide/diagrams/simple-arch.mmd?raw';
import saveFlowDiagram from '@dev-guide/diagrams/save-flow.mmd?raw';
import {
  JzAiIcon,
  JzArchitectureIcon,
  JzAttachmentIcon,
  JzBacklinkIcon,
  JzBlogIcon,
  JzExportIcon,
  JzGraphIcon,
  JzKbIcon,
  JzOutlineIcon,
  JzSearchIcon,
  JzTagsIcon,
} from '@/components/common/JzIcon';
import { useAuthStore } from '@/stores/auth';
import { getSystemInfo, type SystemInfo } from '@/api/admin';
import { formatApiError } from '@/api/client';

const { Title, Paragraph, Text } = Typography;

const REFRESH_MS = 30_000;

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

type StackTagClass = 'jz-stack-tag--backend' | 'jz-stack-tag--frontend' | 'jz-stack-tag--infra';

interface StackLayer {
  title: string;
  icon: React.ReactNode;
  tagClass: StackTagClass;
  items: StackItem[];
}

const STACK: StackLayer[] = [
  {
    title: '后端',
    icon: <CodeOutlined />,
    tagClass: 'jz-stack-tag--backend',
    items: [
      { name: 'Python 3.12' },
      { name: 'Django 5.2', hint: 'Web 框架' },
      { name: 'DRF 3.15', hint: 'REST API' },
      { name: 'PostgreSQL 14+', hint: '主存储 + tsvector' },
      { name: 'Redis 5+', hint: '缓存 / Celery broker' },
      { name: 'Celery 5.4', hint: '搜索 / 链接 / 导出' },
      { name: 'apps.ai', hint: 'Claude 代理 · SSE' },
      { name: 'anthropic', hint: '可选 SDK' },
      { name: 'jieba', hint: '中文分词' },
      { name: 'Playwright', hint: 'PDF 导出' },
      { name: 'python-docx', hint: 'Word 导出' },
      { name: 'markdown-it-py', hint: 'Markdown / HTML 解析' },
    ],
  },
  {
    title: '前端',
    icon: <GlobalOutlined />,
    tagClass: 'jz-stack-tag--frontend',
    items: [
      { name: 'React 18 + TS' },
      { name: 'Vite 5', hint: '构建 / 开发代理' },
      { name: 'Ant Design 5', hint: 'UI 组件库' },
      { name: 'Zustand', hint: 'auth / theme' },
      { name: 'React Router v6' },
      { name: 'Tiptap 3', hint: 'Rich / MD / HTML 三模式' },
      { name: 'HtmlPostReader', hint: 'HTML 文章原位阅读' },
      { name: 'react-force-graph-2d', hint: '知识图谱' },
      { name: 'dompurify', hint: '公开端 HTML 净化' },
      { name: 'diff-match-patch', hint: '版本 diff' },
      { name: 'plantuml-encoder', hint: 'PlantUML 嵌入' },
      { name: 'JzIcon', hint: '自制 SVG 图标库' },
    ],
  },
  {
    title: '基础设施',
    icon: <CloudServerOutlined />,
    tagClass: 'jz-stack-tag--infra',
    items: [
      { name: 'Docker Compose', hint: 'postgres + redis' },
      { name: 'Session Auth', hint: 'Django + CSRF' },
      { name: 'owner 多租户', hint: 'scope_queryset' },
      { name: '乐观并发 version', hint: 'PATCH expected_version' },
      { name: 'MEDIA_ROOT', hint: '本地附件' },
      { name: 'PostgreSQL GIN', hint: '全文搜索' },
      { name: 'pnpm + uv', hint: '依赖管理' },
    ],
  },
];

interface FeatureModule {
  title: string;
  desc: string;
  icon: React.ReactNode;
}

const FEATURE_MODULES: FeatureModule[] = [
  {
    title: '知识库与目录',
    desc: 'KB / 文件夹嵌套、树拖拽排序、软删除回收站、封面与主题色',
    icon: <JzKbIcon size={18} />,
  },
  {
    title: '文档与编辑器',
    desc: 'Rich · Markdown · HTML 三模式；Tiptap 3 扩展（数学、分栏、DocCard、Mermaid 等）',
    icon: <JzOutlineIcon size={18} />,
  },
  {
    title: '历史版本',
    desc: '快照 diff / 回滚；每文档保留 100 个版本',
    icon: <FileTextOutlined style={{ fontSize: 16 }} />,
  },
  {
    title: '双向链接',
    desc: '@提及解析、反向链接、doc 悬浮卡',
    icon: <JzBacklinkIcon size={18} />,
  },
  {
    title: '全文搜索',
    desc: '⌘K 全局搜索；jieba + tsvector GIN 索引',
    icon: <JzSearchIcon size={18} />,
  },
  {
    title: '标签与评论',
    desc: '标签挂 KB / 文件夹 / 文档；Markdown 评论 + block_id 段落定位',
    icon: <JzTagsIcon size={18} />,
  },
  {
    title: '导出',
    desc: 'MD / HTML / PDF / DOCX / 整站 zip；Celery 异步',
    icon: <JzExportIcon size={18} />,
  },
  {
    title: '博客前台',
    desc: '匿名阅读；4 主题 + 纸张样式；RSS；slug 按 KB 消歧 ?kb=',
    icon: <JzBlogIcon size={18} />,
  },
  {
    title: '附件与媒体',
    desc: '上传 / 媒体库 / PDF 内联预览；单文件 50MB',
    icon: <JzAttachmentIcon size={18} />,
  },
  {
    title: '知识图谱',
    desc: 'force-graph 可视化文档引用网络',
    icon: <JzGraphIcon size={18} />,
  },
  {
    title: 'AI 助手',
    desc: '8 种写作操作 + SSE 流式；/admin/ai 配置与用量',
    icon: <JzAiIcon size={18} />,
  },
  {
    title: '视觉系统',
    desc: '玄黑玻璃后台 + 宣纸博客；JzIcon · PWA · 印章 favicon',
    icon: <JzArchitectureIcon size={18} />,
  },
];

const SAVE_FLOW_DIAGRAM = saveFlowDiagram.trim();
const SIMPLE_ARCH_DIAGRAM = simpleArchDiagram.trim();

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
    <div className="jz-overview-page">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card className="jz-overview-hero">
          <Title level={3} style={{ marginTop: 0, marginBottom: 8 }}>
            <JzArchitectureIcon size={22} style={{ marginRight: 10, color: 'var(--jz-accent)' }} />
            架构总览
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 12, maxWidth: 920 }}>
            简斋 / JianZhai v0.9 — Monorepo 本地单机「个人知识库 + 公开博客」。
            核心理念是<strong>一份内容两形态</strong>（<code>raw_content</code> 私人笔记 ·{' '}
            <code>published_content</code> 发布版），三种编辑器（Rich / Markdown / HTML），
            公开端支持 HTML 原位阅读；AI 全部走后端代理；多账号按 <code>owner</code> 隔离数据。
          </Paragraph>
          <Space size={[8, 8]} wrap>
            <Tag color="processing">v0.9</Tag>
            {info && (
              <>
                <Tag icon={<CodeOutlined />}>Python {info.runtime.python}</Tag>
                <Tag icon={<ThunderboltOutlined />}>Django {info.runtime.django}</Tag>
                <Tag color={info.runtime.debug ? 'orange' : 'default'}>
                  DEBUG = {info.runtime.debug ? 'true' : 'false'}
                </Tag>
                <Tooltip title={info.runtime.platform}>
                  <Tag icon={<CloudServerOutlined />}>{info.runtime.platform.split('-')[0]}</Tag>
                </Tooltip>
                <Tag>服务器时间 {new Date(info.server_time).toLocaleString('zh-CN')}</Tag>
              </>
            )}
          </Space>
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
              <div className="jz-overview-stat">
                <Statistic
                  title="知识库"
                  value={c?.knowledge_bases ?? '—'}
                  prefix={<DatabaseOutlined />}
                  loading={!loadedOnce}
                  valueStyle={{ color: 'var(--jz-accent)' }}
                />
              </div>
            </Col>
            <Col xs={12} sm={8} md={6}>
              <div className="jz-overview-stat">
                <Statistic
                  title="文件夹"
                  value={c?.folders ?? '—'}
                  prefix={<FolderOpenOutlined />}
                  loading={!loadedOnce}
                  valueStyle={{ color: 'var(--jz-accent)' }}
                />
              </div>
            </Col>
            <Col xs={12} sm={8} md={6}>
              <div className="jz-overview-stat">
                <Statistic
                  title="文档总数"
                  value={c?.documents_total ?? '—'}
                  prefix={<FileTextOutlined />}
                  loading={!loadedOnce}
                  valueStyle={{ color: 'var(--jz-accent)' }}
                  suffix={
                    c ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        / 已发布 {c.documents_published} · 草稿 {c.documents_draft}
                      </Text>
                    ) : null
                  }
                />
              </div>
            </Col>
            <Col xs={12} sm={8} md={6}>
              <div className="jz-overview-stat">
                <Statistic
                  title="近 24h 编辑"
                  value={c?.documents_updated_24h ?? '—'}
                  prefix={<ThunderboltOutlined />}
                  loading={!loadedOnce}
                  valueStyle={{ color: 'var(--jz-accent)' }}
                />
              </div>
            </Col>
            <Col xs={12} sm={8} md={6}>
              <div className="jz-overview-stat">
                <Statistic
                  title="公开文档"
                  value={c?.documents_public ?? '—'}
                  prefix={<GlobalOutlined />}
                  loading={!loadedOnce}
                  valueStyle={{ color: 'var(--jz-accent)' }}
                />
              </div>
            </Col>
            <Col xs={12} sm={8} md={6}>
              <div className="jz-overview-stat">
                <Statistic
                  title="HTML 文档"
                  value={c?.documents_html ?? '—'}
                  prefix={<CodeOutlined />}
                  loading={!loadedOnce}
                  valueStyle={{ color: 'var(--jz-accent)' }}
                />
              </div>
            </Col>
            <Col xs={12} sm={8} md={6}>
              <div className="jz-overview-stat">
                <Statistic
                  title="用户"
                  value={c?.users_active ?? '—'}
                  prefix={<TeamOutlined />}
                  loading={!loadedOnce}
                  valueStyle={{ color: 'var(--jz-accent)' }}
                  suffix={
                    c ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        / 共 {c.users_total}
                      </Text>
                    ) : null
                  }
                />
              </div>
            </Col>
            <Col xs={12} sm={8} md={6}>
              <div className="jz-overview-stat">
                <Statistic
                  title="近 24h AI 调用"
                  value={c?.ai_calls_24h ?? '—'}
                  prefix={<RobotOutlined />}
                  loading={!loadedOnce}
                  valueStyle={{ color: 'var(--jz-accent)' }}
                />
              </div>
            </Col>
            <Col xs={12} sm={8} md={6}>
              <div className="jz-overview-stat">
                <Statistic
                  title="附件"
                  value={c?.attachments_total ?? '—'}
                  prefix={<PaperClipOutlined />}
                  loading={!loadedOnce}
                  valueStyle={{ color: 'var(--jz-accent)' }}
                />
              </div>
            </Col>
            <Col xs={12} sm={8} md={6}>
              <div className="jz-overview-stat">
                <Statistic
                  title="附件占用"
                  value={c ? formatBytes(c.attachments_bytes) : '—'}
                  prefix={<DatabaseOutlined />}
                  loading={!loadedOnce}
                  valueStyle={{ color: 'var(--jz-accent)' }}
                />
              </div>
            </Col>
          </Row>
        </Card>

        <Card title="功能模块" size="small">
          <Row gutter={[12, 12]}>
            {FEATURE_MODULES.map((m) => (
              <Col xs={24} sm={12} md={8} lg={6} key={m.title}>
                <div className="jz-feature-card">
                  <div className="jz-feature-card-head">
                    <span className="jz-feature-card-icon">{m.icon}</span>
                    <span className="jz-feature-card-title">{m.title}</span>
                  </div>
                  <p className="jz-feature-card-desc">{m.desc}</p>
                </div>
              </Col>
            ))}
          </Row>
        </Card>

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
                      const tag = (
                        <Tag className={`jz-stack-tag ${layer.tagClass}`}>{it.name}</Tag>
                      );
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

        <ArchitectureSection />

        <Card title="自动保存请求时序" size="small">
          <Paragraph type="secondary">
            编辑器到 PostgreSQL 的完整链路。<code>expected_version</code> 冲突返回 409 并拉取最新；
            <code>transaction.on_commit</code> 确保 Celery 任务在提交后入队，客户端不必等待索引更新。
          </Paragraph>
          <MermaidDiagram source={SAVE_FLOW_DIAGRAM} />
        </Card>
      </Space>
    </div>
  );
}

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
            最小心智模型：用户 → 前端 SPA → 后端 Django → PostgreSQL。
            AI 为外部依赖（虚线），所有调用经后端代理；公开文章 slug 可用 <code>?kb=</code> 按知识库消歧。
          </Paragraph>
          <MermaidDiagram source={SIMPLE_ARCH_DIAGRAM} />
        </>
      ) : (
        <>
          <Paragraph type="secondary">
            四层结构：客户端 SPA → Vite 边缘代理 → Django 应用层（<strong>11</strong> 个 app + Celery worker）→
            持久层（PG / Redis / 本地文件系统）。主路径上的光点表示同步 ORM；虚线为异步 / 匿名 / 外部 API。
            鼠标悬停节点查看说明。
          </Paragraph>
          <ArchitectureSVG />
        </>
      )}
    </Card>
  );
}
