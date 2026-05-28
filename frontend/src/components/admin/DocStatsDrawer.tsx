import { useEffect, useMemo, useState } from 'react';
import { Avatar, Drawer, Empty, Skeleton, Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import {
  getDocumentStats,
  type DocumentStats,
  type DocumentContributor,
} from '@/api/docs';
import { resolveTagCssColor } from '@/utils/tagColor';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  documentId: number;
}

/* ── helpers ─────────────────────────────────────────────────────────── */

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = dayjs(iso);
  const diff = dayjs().diff(t, 'minute');
  if (diff < 1) return '刚刚';
  if (diff < 60) return `${diff} 分钟前`;
  if (diff < 60 * 24) return `${Math.floor(diff / 60)} 小时前`;
  if (diff < 60 * 24 * 30) return `${Math.floor(diff / 60 / 24)} 天前`;
  return t.format('YYYY-MM-DD');
}

function Avatars({ users }: { users: DocumentContributor[] }) {
  if (users.length === 0) return <Text type="secondary">—</Text>;
  return (
    <Avatar.Group max={{ count: 6 }} size="small">
      {users.map((u) => (
        <Tooltip key={u.id} title={u.username + (u.is_staff ? ' · 管理员' : '')}>
          <Avatar style={{ background: 'var(--jz-accent)', fontSize: 12 }}>
            {u.username.slice(0, 1).toUpperCase()}
          </Avatar>
        </Tooltip>
      ))}
    </Avatar.Group>
  );
}

function Sparkline({ buckets }: { buckets: { date: string; count: number }[] }) {
  const W = 110;
  const H = 28;
  const PAD = 2;
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const stepX = (W - PAD * 2) / Math.max(1, buckets.length - 1);
  const points = buckets
    .map((b, i) => {
      const x = PAD + stepX * i;
      const y = H - PAD - ((b.count / max) * (H - PAD * 2));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const total = buckets.reduce((n, b) => n + b.count, 0);
  return (
    <Tooltip
      title={
        <div style={{ fontSize: 11 }}>
          {buckets.map((b) => (
            <div key={b.date}>{b.date}：{b.count} 次</div>
          ))}
        </div>
      }
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <svg width={W} height={H} aria-label="近 7 天编辑趋势" style={{ flexShrink: 0 }}>
          <polyline
            points={points}
            fill="none"
            stroke="var(--jz-accent)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {buckets.map((b, i) => {
            const x = PAD + stepX * i;
            const y = H - PAD - ((b.count / max) * (H - PAD * 2));
            return b.count > 0 ? (
              <circle key={b.date} cx={x} cy={y} r={1.8} fill="var(--jz-accent)" />
            ) : null;
          })}
        </svg>
        <Text type="secondary" style={{ fontSize: 12 }}>{total} 次/7 天</Text>
      </span>
    </Tooltip>
  );
}

/* ── small row primitives ───────────────────────────────────────────── */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="jz-stats-row">
      <span className="jz-stats-row-label">{label}</span>
      <span className="jz-stats-row-value">{children}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="jz-stats-section">
      <h4 className="jz-stats-section-title">{title}</h4>
      <div className="jz-stats-section-body">{children}</div>
    </section>
  );
}

function Pill({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="jz-stats-pill">
      <strong>{value}</strong>
      <span className="jz-stats-pill-label">{label}</span>
    </span>
  );
}

/* ── main drawer ─────────────────────────────────────────────────────── */

export default function DocStatsDrawer({ open, onClose, documentId }: Props) {
  const [stats, setStats] = useState<DocumentStats | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setStats(null);
    setErr(false);
    getDocumentStats(documentId)
      .then((s) => { if (mounted) setStats(s); })
      .catch(() => { if (mounted) setErr(true); });
    return () => { mounted = false; };
  }, [open, documentId]);

  const headingLine = useMemo(() => {
    if (!stats) return '';
    const h = stats.structure.headings;
    const pieces: string[] = [];
    (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const).forEach((k) => {
      if (h[k] > 0) pieces.push(`${k.toUpperCase()} × ${h[k]}`);
    });
    return pieces.join(' · ') || '无';
  }, [stats]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="文档信息"
      width={420}
      destroyOnHidden
      className="jz-stats-drawer"
    >
      {err ? (
        <Empty description="加载统计失败" />
      ) : !stats ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <>
          <Section title="规模">
            <div className="jz-stats-pill-row">
              <Pill label="字" value={stats.word_count.toLocaleString()} />
              <Pill label="字符" value={stats.char_count.toLocaleString()} />
              <Pill label="分钟阅读" value={stats.reading_minutes} />
            </div>
          </Section>

          <Section title="活动">
            <Row label="创建">
              <Tooltip title={stats.created_at ?? ''}>
                <span>{timeAgo(stats.created_at)}</span>
              </Tooltip>
              {stats.created_by && (
                <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                  · {stats.created_by.username}
                </Text>
              )}
            </Row>
            <Row label="最后编辑">
              <Tooltip title={stats.updated_at ?? ''}>
                <span>{timeAgo(stats.updated_at)}</span>
              </Tooltip>
              {stats.last_edited_by && (
                <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                  · {stats.last_edited_by.username}
                </Text>
              )}
            </Row>
            {stats.published_at && (
              <Row label="发布">
                <Tooltip title={stats.published_at}>
                  <span>{timeAgo(stats.published_at)}</span>
                </Tooltip>
              </Row>
            )}
            <Row label="版本">{stats.version_count} 个快照</Row>
            <Row label="近 7 天">
              <Sparkline buckets={stats.edits_last_7d} />
            </Row>
            {stats.contributors.length > 1 && (
              <Row label="参与者">
                <Avatars users={stats.contributors} />
              </Row>
            )}
          </Section>

          <Section title="结构">
            <Row label="标题">{headingLine}</Row>
            <div className="jz-stats-pill-row">
              <Pill label="列表项" value={stats.structure.lists} />
              <Pill label="代码块" value={stats.structure.code_blocks} />
              <Pill label="图片" value={stats.structure.images} />
              <Pill label="表格" value={stats.structure.tables} />
              <Pill label="链接" value={stats.structure.links} />
            </div>
          </Section>

          <Section title="引用">
            <Row label="出链">{stats.links.outgoing_count} 篇</Row>
            <Row label="入链">{stats.links.incoming_count} 篇</Row>
          </Section>

          {stats.tags.length > 0 && (
            <Section title="标签">
              <div className="jz-stats-tags">
                {stats.tags.map((t) => {
                  const c = resolveTagCssColor(t);
                  return (
                    <Tag
                      key={t.id}
                      style={{ marginRight: 0, borderColor: c, color: c }}
                    >
                      {t.name}
                    </Tag>
                  );
                })}
              </div>
            </Section>
          )}
        </>
      )}
    </Drawer>
  );
}
