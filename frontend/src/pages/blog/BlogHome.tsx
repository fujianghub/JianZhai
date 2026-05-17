import { useEffect, useState } from 'react';
import { Empty, Space, Spin, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { ArrowRightOutlined } from '@ant-design/icons';
import * as kbsApi from '@/api/kbs';
import type { PublicKB } from '@/types';

const { Title, Text } = Typography;

export default function BlogHome() {
  const [kbs, setKbs] = useState<PublicKB[] | null>(null);

  useEffect(() => {
    void kbsApi.listPublicKBs().then(setKbs);
  }, []);

  if (kbs === null) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 300 }}>
        <Spin />
      </div>
    );
  }

  if (kbs.length === 0) {
    return <Empty description="还没有公开的知识库" />;
  }

  return (
    <div>
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
          <Title level={4} style={{ margin: 0, fontWeight: 500, letterSpacing: 4 }}>藏经阁</Title>
          <Text type="secondary">藏书千卷 · 请君启一函</Text>
        </div>
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 24,
        }}
      >
        {kbs.map((kb) => {
          return (
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
                      <Tag key={t.id} color={t.color || 'blue'}>
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
          );
        })}
      </div>
    </div>
  );
}
