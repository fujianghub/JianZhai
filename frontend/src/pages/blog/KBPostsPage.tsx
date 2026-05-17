import { useEffect, useState } from 'react';
import { Breadcrumb, Card, Empty, Result, Space, Spin, Tag, Typography } from 'antd';
import { Link, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { BookOutlined, HomeOutlined } from '@ant-design/icons';
import * as kbsApi from '@/api/kbs';
import type { PublicKBTree } from '@/types';
import DocFormatTag from '@/components/common/DocFormatTag';

const { Title, Paragraph } = Typography;

export default function KBPostsPage() {
  const { slug } = useParams<{ slug: string }>();
  const [tree, setTree] = useState<PublicKBTree | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setTree(null);
    setNotFound(false);
    kbsApi
      .getPublicKBTree(slug)
      .then(setTree)
      .catch(() => setNotFound(true));
  }, [slug]);

  if (notFound) {
    return <Result status="404" title="未找到该知识库" extra={<Link to="/">返回首页</Link>} />;
  }
  if (!tree) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 300 }}>
        <Spin />
      </div>
    );
  }

  const accent = tree.accent_color || 'var(--jz-accent)';

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/"><HomeOutlined /> 首页</Link> },
          { title: tree.name },
        ]}
      />
      <header
        style={{
          padding: '24px 28px',
          marginBottom: 24,
          borderRadius: 14,
          border: '1px solid var(--jz-border)',
          background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 18%, var(--jz-surface)), var(--jz-surface))`,
        }}
      >
        <Space align="start" size="middle">
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 60%, white))`,
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontSize: 24,
              boxShadow: `0 8px 24px color-mix(in srgb, ${accent} 30%, transparent)`,
            }}
          >
            <BookOutlined />
          </div>
          <div>
            <Title level={2} style={{ margin: 0 }}>{tree.name}</Title>
            {tree.description && (
              <Paragraph type="secondary" style={{ margin: '6px 0 8px' }}>
                {tree.description}
              </Paragraph>
            )}
            <Space size={6} wrap>
              {tree.tags.map((t) => (
                <Tag key={t.id} color={t.color || 'blue'}>
                  {t.name}
                </Tag>
              ))}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                共 {tree.documents.length} 篇
              </Typography.Text>
            </Space>
          </div>
        </Space>
      </header>

      {tree.documents.length === 0 ? (
        <Empty description="还没有公开文章" />
      ) : (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {tree.documents.map((p) => (
            <Card
              key={p.id}
              className="jz-card jz-fade-in jz-post-card"
              hoverable
              style={{ borderRadius: 12 }}
            >
              <Link
                to={`/posts/${encodeURIComponent(p.slug)}`}
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                <Title level={4} style={{ marginTop: 0, marginBottom: 6 }}>
                  <Space size={8}>
                    <span>{p.title}</span>
                    <DocFormatTag format={p.doc_format} size="default" />
                  </Space>
                </Title>
              </Link>
              <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 8 }}>
                {p.excerpt || '（无摘要）'}
              </Paragraph>
              <Space size={8} wrap split={<span style={{ color: '#ccc' }}>·</span>}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {dayjs(p.published_at).format('YYYY-MM-DD HH:mm')}
                </Typography.Text>
                {p.tags.length > 0 && (
                  <Space size={4}>
                    {p.tags.map((t) => (
                      <Tag key={t.id} color={t.color || 'blue'}>
                        {t.name}
                      </Tag>
                    ))}
                  </Space>
                )}
              </Space>
            </Card>
          ))}
        </Space>
      )}
    </div>
  );
}
