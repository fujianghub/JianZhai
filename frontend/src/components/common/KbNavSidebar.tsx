import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Empty, Spin, Tooltip, Typography } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import * as kbsApi from '@/api/kbs';
import type { PublicKBTree } from '@/types';
import DocFormatTag from './DocFormatTag';

const { Text } = Typography;

interface Props {
  kbSlug: string;
  /** Slug of the currently-open post; highlighted in the list. */
  currentSlug?: string;
  /** Optional collapse handler; when provided, a close button is shown. */
  onClose?: () => void;
}

/**
 * Left-rail document list for the current knowledge base. Lets the reader
 * switch between posts without going back to the KB landing page.
 */
export default function KbNavSidebar({ kbSlug, currentSlug, onClose }: Props) {
  const [tree, setTree] = useState<PublicKBTree | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTree(null);
    kbsApi
      .getPublicKBTree(kbSlug)
      .then((t) => {
        if (!cancelled) setTree(t);
      })
      .catch(() => {
        if (!cancelled) setTree(null);
      });
    return () => {
      cancelled = true;
    };
  }, [kbSlug]);

  if (!tree) {
    return (
      <div style={{ padding: 16, textAlign: 'center' }}>
        <Spin size="small" />
      </div>
    );
  }

  return (
    <nav className="jz-kb-nav" aria-label="知识库文档列表">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4, marginBottom: 8 }}>
        <Link
          to={`/kb/${encodeURIComponent(tree.slug)}`}
          style={{ color: 'inherit', textDecoration: 'none', flex: 1, minWidth: 0 }}
        >
          <Text type="secondary" style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>
            知识库
          </Text>
          <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.4, marginTop: 2 }}>
            {tree.name}
          </div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {tree.documents.length} 篇文档
          </Text>
        </Link>
        {onClose && (
          <Tooltip title="隐藏文档列表">
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={onClose}
              aria-label="隐藏文档列表"
            />
          </Tooltip>
        )}
      </div>

      {tree.documents.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无文档" style={{ margin: '12px 0' }} />
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {tree.documents.map((d) => {
            const active = d.slug === currentSlug;
            return (
              <li key={d.id} style={{ marginBottom: 2 }}>
                <Link
                  to={`/posts/${encodeURIComponent(d.slug)}`}
                  className={'jz-kb-nav-link' + (active ? ' is-active' : '')}
                  style={{
                    display: 'block',
                    padding: '6px 10px',
                    fontSize: 13,
                    lineHeight: 1.4,
                    borderRadius: 6,
                    color: active ? 'var(--jz-accent)' : 'var(--jz-text)',
                    background: active ? 'color-mix(in srgb, var(--jz-accent) 10%, transparent)' : 'transparent',
                    fontWeight: active ? 600 : 400,
                    textDecoration: 'none',
                    borderLeft: `2px solid ${active ? 'var(--jz-accent)' : 'transparent'}`,
                    transition: 'background-color 120ms ease, color 120ms ease',
                  }}
                  title={d.title}
                >
                  <span
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      wordBreak: 'break-all',
                    }}
                  >
                    {d.title}
                  </span>
                  <DocFormatTag format={d.doc_format} size="default" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
