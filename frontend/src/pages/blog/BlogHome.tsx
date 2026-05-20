import { useEffect, useState } from 'react';
import { Button, Empty, Space, Spin, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { ArrowRightOutlined, PlusOutlined } from '@ant-design/icons';
import * as kbsApi from '@/api/kbs';
import { useAuthStore } from '@/stores/auth';
import type { PublicKB } from '@/types';
import { resolveTagColor } from '@/utils/tagColor';

const { Text } = Typography;

export default function BlogHome() {
  const [kbs, setKbs] = useState<PublicKB[] | null>(null);

  /** Surface a "新建知识库 / 进入后台" affordance when a super-admin session is
   * already active. Anonymous readers see nothing extra. */
  const authUser = useAuthStore((s) => s.user);
  const authLoaded = useAuthStore((s) => s.loaded);
  const loadSession = useAuthStore((s) => s.loadSession);
  useEffect(() => {
    if (!authLoaded) void loadSession();
  }, [authLoaded, loadSession]);
  const canManage = !!authUser?.is_superuser;

  useEffect(() => {
    void kbsApi.listPublicKBs().then(setKbs);
  }, []);

  const adminBar = canManage ? (
    <div style={{ textAlign: 'right', marginBottom: 16 }}>
      <Space>
        <Link to="/admin/kbs">
          <Button icon={<PlusOutlined />} type="primary">
            新建 / 管理知识库
          </Button>
        </Link>
      </Space>
    </div>
  ) : null;

  if (kbs === null) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 300 }}>
        <Spin />
      </div>
    );
  }

  if (kbs.length === 0) {
    return (
      <div>
        {adminBar}
        <Empty description="还没有公开的知识库" />
      </div>
    );
  }

  return (
    <div>
      {adminBar}
      <section className="jz-hero" aria-label="题记">
        <div className="jz-hero-quote">
          <span>年与时驰</span>
          <span className="jz-hero-quote-sep">·</span>
          <span>意与日去</span>
          <span className="jz-hero-quote-sep">·</span>
          <span>遂成枯落</span>
          <span className="jz-hero-seal" aria-label="印章">
            <span className="jz-hero-seal-text">简斋</span>
          </span>
        </div>
        <div className="jz-hero-attr">
          <span className="jz-hero-attr-rule" aria-hidden />
          <span>诸葛亮 · 诫子书</span>
          <span className="jz-hero-attr-rule" aria-hidden />
        </div>
        <div className="jz-hero-sub">
          <h2 className="jz-hero-cangjingge" aria-label="藏经阁">
            <span className="jz-hero-cangjingge-char">藏</span>
            <span className="jz-hero-cangjingge-char">经</span>
            <span className="jz-hero-cangjingge-char">阁</span>
          </h2>
          <div className="jz-hero-couplet" aria-label="藏书千卷 · 请君启一函">
            <span className="jz-hero-couplet-line">藏书千卷</span>
            <span className="jz-hero-couplet-dot" aria-hidden>·</span>
            <span className="jz-hero-couplet-line">请君启一函</span>
          </div>
        </div>
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 24,
        }}
      >
        {kbs.map((kb) => (
          <Link
            key={kb.id}
            to={`/kb/${encodeURIComponent(kb.slug)}`}
            className="jz-book jz-fade-in"
          >
            <div className="jz-book-label">
              <span className="jz-book-label-text">{kb.name}</span>
            </div>
            <div className="jz-book-desc">
              {kb.description || '（暂无简介）'}
            </div>
            <div className="jz-book-tags">
              <Space size={6} wrap>
                {kb.tags.length === 0 ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>无标签</Text>
                ) : (
                  kb.tags.map((t) => (
                    <Tag key={t.id} color={resolveTagColor(t)}>
                      {t.name}
                    </Tag>
                  ))
                )}
              </Space>
            </div>
            <div className="jz-book-meta">
              <span>共 {kb.post_count} 卷 · {dayjs(kb.updated_at).format('YYYY-MM-DD')}</span>
              <span className="jz-book-meta-action">
                阅 <ArrowRightOutlined />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
