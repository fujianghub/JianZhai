import { useEffect, useState } from 'react';
import { Empty, List, Spin, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { getBacklinks, getPublicBacklinks, type Backlink } from '@/api/linking';

const { Title, Text } = Typography;

interface Props {
  documentId: number;
  /** Where to link the source document. 'admin' (default) deep-links to the KB workspace; 'public' goes to /posts/<slug>. */
  variant?: 'admin' | 'public';
  /** When true, hides the section header and removes the top border / margin (used inside the tabbed sidebar). */
  compact?: boolean;
}

export default function BacklinkPanel({ documentId, variant = 'admin', compact = false }: Props) {
  const [items, setItems] = useState<Backlink[] | null>(null);

  useEffect(() => {
    setItems(null);
    const fetcher = variant === 'public' ? getPublicBacklinks : getBacklinks;
    fetcher(documentId)
      .then(setItems)
      .catch(() => setItems([]));
  }, [documentId, variant]);

  if (items === null) {
    return (
      <div style={{ padding: 16 }}>
        <Spin />
      </div>
    );
  }

  // Public variant: only show backlinks whose source is itself public+published
  const visible =
    variant === 'public'
      ? items.filter((b) => b.source.status === 'published' && b.source.visibility === 'public')
      : items;

  return (
    <div style={compact ? { padding: '8px 0' } : { borderTop: '1px solid #f0f0f0', paddingTop: 16, marginTop: 24 }}>
      {!compact && (
        <Title level={5} style={{ marginBottom: 8 }}>
          ← 反向链接 <Text type="secondary">({visible.length})</Text>
        </Title>
      )}
      {visible.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有其他文档引用本文" />
      ) : (
        <List
          size="small"
          dataSource={visible}
          renderItem={(b) => {
            const href =
              variant === 'public'
                ? `/posts/${encodeURIComponent(b.source.slug)}`
                : `/admin/kbs/${b.source.knowledge_base}?doc=${b.source.id}`;
            return (
              <List.Item>
                <div style={{ width: '100%' }}>
                  <Link to={href} style={{ fontWeight: 500 }}>
                    {b.source.title}
                  </Link>
                  {variant === 'admin' && (
                    <Tag color={b.source.status === 'published' ? 'green' : 'default'} style={{ marginLeft: 8 }}>
                      {b.source.status === 'published' ? '已发布' : '草稿'}
                    </Tag>
                  )}
                  <div style={{ color: 'var(--jz-text-muted)', fontSize: 12, marginTop: 4 }}>{b.context}</div>
                </div>
              </List.Item>
            );
          }}
        />
      )}
    </div>
  );
}
