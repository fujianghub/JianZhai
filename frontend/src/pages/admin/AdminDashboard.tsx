import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Col, Row, Spin, Typography } from 'antd';
import {
  JzAiIcon,
  JzArchitectureIcon,
  JzExportIcon,
  JzGraphIcon,
  JzKbIcon,
  JzTagsIcon,
} from '@/components/common/JzIcon';
import { DeleteOutlined, StarOutlined } from '@ant-design/icons';
import { listKBs } from '@/api/kbs';
import { useAuthStore } from '@/stores/auth';
import type { KnowledgeBase } from '@/types';

const { Title, Paragraph, Text } = Typography;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 14) return '午安';
  if (h < 18) return '下午好';
  return '晚上好';
}

interface QuickEntry {
  to: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  show: boolean;
}

export default function AdminDashboard() {
  const user = useAuthStore((s) => s.user);
  const [kbs, setKbs] = useState<KnowledgeBase[] | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listKBs()
      .then((list) => !cancelled && setKbs(list))
      .catch(() => !cancelled && setErr(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const list = kbs ?? [];
    return {
      kbCount: list.length,
      docCount: list.reduce((n, kb) => n + (kb.document_count || 0), 0),
      publicCount: list.filter((kb) => kb.visibility === 'public').length,
    };
  }, [kbs]);

  const recentKbs = useMemo(
    () => (kbs ?? []).slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6),
    [kbs],
  );

  const entries: QuickEntry[] = [
    { to: '/admin/kbs', title: '知识库', desc: '浏览与管理全部知识库', icon: <JzKbIcon />, show: true },
    { to: '/admin/graph', title: '知识图谱', desc: '文档间的双向链接关系图', icon: <JzGraphIcon />, show: true },
    { to: '/admin/exports', title: '导出', desc: 'Markdown / PDF / HTML / 整站', icon: <JzExportIcon />, show: true },
    { to: '/tags', title: '标签', desc: '按标签浏览与归类内容', icon: <JzTagsIcon />, show: true },
    { to: '/admin/favorites', title: '收藏', desc: '我标星的文档', icon: <StarOutlined />, show: true },
    { to: '/admin/trash', title: '回收站', desc: '已删除内容的恢复与清理', icon: <DeleteOutlined />, show: true },
    { to: '/admin/ai', title: 'AI 助手', desc: '模型、用量与全局设置', icon: <JzAiIcon />, show: !!user?.is_staff },
    { to: '/admin/overview', title: '系统总览', desc: '架构、技术栈与实时统计', icon: <JzArchitectureIcon />, show: !!user?.is_superuser },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section className="jz-dash-hero">
        <p className="jz-dash-hero-greeting">{greeting()}，欢迎回到</p>
        <Title level={2} className="jz-dash-hero-title">
          {user?.username ?? '我'} 的个人空间
        </Title>
        <Paragraph className="jz-dash-hero-sub">
          一份内容，两种形态——在这里管理你的私人笔记与公开博客。下面是你的概览与快捷入口。
        </Paragraph>
        <Row gutter={[16, 16]} style={{ marginTop: 18 }}>
          {[
            { label: '知识库', value: stats.kbCount },
            { label: '文档', value: stats.docCount },
            { label: '已公开知识库', value: stats.publicCount },
          ].map((s) => (
            <Col xs={12} sm={8} key={s.label}>
              <div className="jz-overview-stat">
                <div className="jz-dash-stat-value">{kbs === null && !err ? <Spin size="small" /> : s.value}</div>
                <div className="jz-dash-stat-label">{s.label}</div>
              </div>
            </Col>
          ))}
        </Row>
      </section>

      <section>
        <Title level={4} style={{ marginBottom: 12 }}>快捷入口</Title>
        <Row gutter={[16, 16]}>
          {entries.filter((e) => e.show).map((e) => (
            <Col xs={12} sm={8} lg={6} key={e.to}>
              <Link to={e.to} className="jz-feature-card">
                <div className="jz-feature-card-head">
                  <span className="jz-feature-card-icon">{e.icon}</span>
                  <span className="jz-feature-card-title">{e.title}</span>
                </div>
                <p className="jz-feature-card-desc">{e.desc}</p>
              </Link>
            </Col>
          ))}
        </Row>
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <Title level={4} style={{ margin: 0 }}>最近的知识库</Title>
          <Link to="/admin/kbs"><Text type="secondary">查看全部 →</Text></Link>
        </div>
        {err ? (
          <div className="jz-admin-panel">
            <Text type="secondary">概览加载失败，请稍后重试。</Text>
          </div>
        ) : kbs === null ? (
          <div className="jz-admin-panel" style={{ display: 'grid', placeItems: 'center', minHeight: 120 }}>
            <Spin />
          </div>
        ) : recentKbs.length === 0 ? (
          <div className="jz-admin-panel">
            <Text type="secondary">还没有知识库——去「知识库」页面创建第一个吧。</Text>
          </div>
        ) : (
          <Row gutter={[16, 16]}>
            {recentKbs.map((kb) => (
              <Col xs={24} sm={12} lg={8} key={kb.id}>
                <Link to={`/admin/kbs/${kb.id}`} className="jz-feature-card">
                  <div className="jz-feature-card-head">
                    <span
                      className="jz-feature-card-icon"
                      style={kb.accent_color ? { background: `${kb.accent_color}1f`, color: kb.accent_color } : undefined}
                    >
                      <JzKbIcon />
                    </span>
                    <span className="jz-feature-card-title">{kb.name}</span>
                  </div>
                  <p className="jz-feature-card-desc">
                    {kb.document_count} 篇文档 · {kb.visibility === 'public' ? '已公开' : '私密'}
                  </p>
                </Link>
              </Col>
            ))}
          </Row>
        )}
      </section>
    </div>
  );
}
