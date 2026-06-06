import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Col, Modal, Row, Select, Skeleton, Typography } from 'antd';
import { CalendarOutlined, PlusOutlined } from '@ant-design/icons';
import { dailyNote } from '@/api/docs';
import { formatApiError } from '@/api/client';
import { message } from '@/utils/notify';
import WritingHeatmap from '@/components/admin/WritingHeatmap';
import {
  JzAiIcon,
  JzArchitectureIcon,
  JzExportIcon,
  JzGraphIcon,
  JzKbIcon,
  JzTagIcon,
  JzTrashIcon,
} from '@/components/common/JzIcon';
import { StarOutlined } from '@ant-design/icons';
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

const JOURNAL_KB_KEY = 'jz-journal-kb';

export default function AdminDashboard() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [kbs, setKbs] = useState<KnowledgeBase[] | null>(null);
  const [err, setErr] = useState(false);
  const [journalModalOpen, setJournalModalOpen] = useState(false);
  const [journalKbId, setJournalKbId] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem(JOURNAL_KB_KEY);
      return v ? Number(v) || null : null;
    } catch {
      return null;
    }
  });
  const [journalLoading, setJournalLoading] = useState(false);

  // Single mounted-flag across the component lifetime — every in-flight
  // listKBs() races through this one gate, so focus/visibilitychange refetches
  // don't pile up orphan cancellation tokens and can't setState after unmount.
  useEffect(() => {
    let mounted = true;
    const refetch = () => {
      listKBs()
        .then((list) => { if (mounted) { setKbs(list); setErr(false); } })
        .catch(() => { if (mounted) setErr(true); });
    };
    refetch();
    const onFocus = () => { refetch(); };
    const onVis = () => { if (document.visibilityState === 'visible') refetch(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      mounted = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
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

  const openDailyNote = useCallback(async (kbId: number) => {
    setJournalLoading(true);
    try {
      const res = await dailyNote(kbId);
      try { localStorage.setItem(JOURNAL_KB_KEY, String(kbId)); } catch { /* ignore */ }
      setJournalKbId(kbId);
      setJournalModalOpen(false);
      navigate(`/admin/kbs/${res.knowledge_base}/docs/${res.id}`);
      if (res.created) {
        message.success(`已创建 ${res.title}`);
      }
    } catch (e) {
      message.error(formatApiError(e, '打开今日笔记失败'));
    } finally {
      setJournalLoading(false);
    }
  }, [navigate]);

  const onJournalClick = useCallback(() => {
    if (journalKbId && (kbs?.some((k) => k.id === journalKbId) ?? false)) {
      void openDailyNote(journalKbId);
    } else {
      setJournalModalOpen(true);
    }
  }, [journalKbId, kbs, openDailyNote]);

  const recentKbs = useMemo(
    () => (kbs ?? []).slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6),
    [kbs],
  );

  const entries: QuickEntry[] = [
    { to: '/admin/kbs', title: '知识库', desc: '浏览与管理全部知识库', icon: <JzKbIcon />, show: true },
    { to: '/admin/graph', title: '知识图谱', desc: '文档间的双向链接关系图', icon: <JzGraphIcon />, show: true },
    { to: '/admin/exports', title: '导出', desc: 'Markdown / PDF / HTML / 整站', icon: <JzExportIcon />, show: true },
    { to: '/tags', title: '标签', desc: '按标签浏览与归类内容', icon: <JzTagIcon />, show: true },
    { to: '/admin/favorites', title: '收藏', desc: '我标星的文档', icon: <StarOutlined />, show: true },
    { to: '/admin/trash', title: '回收站', desc: '已删除内容的恢复与清理', icon: <JzTrashIcon />, show: true },
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
        <div style={{ marginTop: 14 }}>
          <Button
            type="primary"
            icon={<CalendarOutlined />}
            loading={journalLoading}
            onClick={onJournalClick}
            disabled={kbs !== null && kbs.length === 0}
          >
            打开今日笔记
          </Button>
        </div>
        <Row gutter={[16, 16]} style={{ marginTop: 18 }}>
          {[
            { label: '知识库', value: stats.kbCount },
            { label: '文档', value: stats.docCount },
            { label: '已公开知识库', value: stats.publicCount },
          ].map((s) => (
            <Col xs={12} sm={8} key={s.label}>
              <div className="jz-overview-stat">
                <div className="jz-dash-stat-value">
                  {kbs === null && !err ? (
                    <Skeleton.Input active size="small" style={{ width: 56, minWidth: 56, height: 28 }} />
                  ) : (
                    s.value
                  )}
                </div>
                <div className="jz-dash-stat-label">{s.label}</div>
              </div>
            </Col>
          ))}
        </Row>
      </section>

      <WritingHeatmap days={365} />

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
          <div className="jz-admin-panel">
            <Skeleton active paragraph={{ rows: 3, width: ['80%', '60%', '70%'] }} />
          </div>
        ) : recentKbs.length === 0 ? (
          <div className="jz-admin-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <Text type="secondary">还没有知识库——一切就绪,创建你的第一个吧。</Text>
            <Link to="/admin/kbs">
              <Button type="primary" icon={<PlusOutlined />}>新建知识库</Button>
            </Link>
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

      <Modal
        title="选择记录到哪个知识库"
        open={journalModalOpen}
        onCancel={() => setJournalModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <p style={{ color: 'var(--jz-text-muted)', marginTop: 0 }}>
          今日笔记会用 <code>daily-YYYYMMDD</code> 作为 slug,同一天再点会打开同一篇。
          选择会记到 localStorage,下次直接打开。
        </p>
        <Select
          autoFocus
          placeholder="选择一个知识库…"
          style={{ width: '100%' }}
          value={journalKbId ?? undefined}
          onChange={(v) => setJournalKbId(v)}
          options={(kbs ?? []).map((kb) => ({ value: kb.id, label: kb.name }))}
        />
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <Button onClick={() => setJournalModalOpen(false)} style={{ marginRight: 8 }}>
            取消
          </Button>
          <Button
            type="primary"
            loading={journalLoading}
            disabled={!journalKbId}
            onClick={() => journalKbId && void openDailyNote(journalKbId)}
          >
            打开今日笔记
          </Button>
        </div>
      </Modal>
    </div>
  );
}
