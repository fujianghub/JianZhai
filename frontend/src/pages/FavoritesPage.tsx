import { useCallback, useEffect, useState } from 'react';
import { Button, Empty, Popconfirm, Spin, Tag, Typography, message } from 'antd';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { StarFilled } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  listFavoriteDocuments,
  toggleDocumentFavorite,
  type FavoriteDocument,
} from '@/api/docs';
import { formatApiError } from '@/api/client';
import { docBrowseHref, docEditorHref } from '@/utils/docLinks';
import { useAuthStore } from '@/stores/auth';

const { Text, Title } = Typography;

export default function FavoritesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthor = useAuthStore((s) => !!s.user?.is_staff);
  // Mounted both at /favorites (blog shell) and /admin/favorites (admin
  // shell); the guwen hero belongs to the blog chrome only.
  const inAdmin = location.pathname.startsWith('/admin');
  const [items, setItems] = useState<FavoriteDocument[] | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const load = useCallback(() => {
    void listFavoriteDocuments()
      .then(setItems)
      .catch((err) => {
        message.error(formatApiError(err, '加载收藏失败'));
        setItems([]);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUnfavorite(doc: FavoriteDocument) {
    setRemovingId(doc.id);
    try {
      const { is_favorited } = await toggleDocumentFavorite(doc.id);
      if (!is_favorited) {
        setItems((prev) => (prev ?? []).filter((d) => d.id !== doc.id));
      }
    } catch (err) {
      message.error(formatApiError(err, '取消收藏失败'));
    } finally {
      setRemovingId(null);
    }
  }

  function openBrowse(doc: FavoriteDocument) {
    navigate(docBrowseHref(doc));
  }

  const header = inAdmin ? (
    <div className="jz-favorites-admin-head">
      <Title level={3} style={{ marginBottom: 4 }}>
        我的收藏
      </Title>
      {items && items.length > 0 ? (
        <Text type="secondary">共 {items.length} 篇</Text>
      ) : null}
    </div>
  ) : (
    <section className="jz-hero" aria-label="题记">
      <div className="jz-hero-quote" style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)' }}>
        <span>我 的 收 藏</span>
      </div>
      {items && items.length > 0 ? (
        <div className="jz-hero-attr">
          <span className="jz-hero-attr-rule" aria-hidden />
          <span>共 {items.length} 篇</span>
          <span className="jz-hero-attr-rule" aria-hidden />
        </div>
      ) : null}
    </section>
  );

  if (items === null) {
    return (
      <div className="jz-favorites">
        {header}
        <div className="jz-favorites--loading">
          <Spin />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="jz-favorites">
        {header}
        <Empty description="还没有收藏的文档">
          {isAuthor ? (
            <Link to="/admin/kbs">去知识库</Link>
          ) : (
            <Link to="/">去藏经阁逛逛</Link>
          )}
        </Empty>
      </div>
    );
  }

  return (
    <div className="jz-favorites">
      {header}

      <ul className="jz-favorites-list">
        {items.map((doc) => {
          const canReadPublic = doc.status === 'published' && doc.visibility === 'public';
          return (
            <li key={doc.id} className="jz-favorites-item">
              <div
                className="jz-favorites-item-main"
                role="button"
                tabIndex={0}
                onClick={() => openBrowse(doc)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openBrowse(doc);
                  }
                }}
                aria-label={`浏览 ${doc.title}`}
              >
                <span className="jz-favorites-title">{doc.title}</span>
                <div className="jz-favorites-meta">
                  <Link
                    to={
                      isAuthor
                        ? `/admin/kbs/${doc.knowledge_base.id}`
                        : `/kb/${encodeURIComponent(doc.knowledge_base.slug)}`
                    }
                    className="jz-favorites-kb"
                    style={
                      doc.knowledge_base.accent_color
                        ? { color: doc.knowledge_base.accent_color }
                        : undefined
                    }
                    onClick={(e) => e.stopPropagation()}
                  >
                    {doc.knowledge_base.name}
                  </Link>
                  {isAuthor && (
                    <Tag color={doc.status === 'published' ? 'green' : 'default'}>
                      {doc.status === 'published' ? '已发布' : '草稿'}
                    </Tag>
                  )}
                  {isAuthor &&
                    (doc.visibility === 'public' ? (
                      <Tag color="blue">公开</Tag>
                    ) : (
                      <Tag>私密</Tag>
                    ))}
                  {canReadPublic ? (
                    <Tag color="processing" className="jz-favorites-read-hint">
                      点击阅读
                    </Tag>
                  ) : null}
                </div>
                <Text type="secondary" className="jz-favorites-dates">
                  收藏于 {dayjs(doc.favorited_at).format('YYYY-MM-DD HH:mm')}
                  {' · '}
                  更新于 {dayjs(doc.updated_at).format('YYYY-MM-DD')}
                </Text>
              </div>
              <div className="jz-favorites-actions">
                {isAuthor && (
                  <Link
                    to={docEditorHref(doc.knowledge_base.id, doc.id)}
                    className="jz-favorites-edit"
                    onClick={(e) => e.stopPropagation()}
                  >
                    编辑
                  </Link>
                )}
                <Popconfirm
                  title="取消收藏该文档？"
                  onConfirm={() => void handleUnfavorite(doc)}
                  okText="取消收藏"
                  cancelText="保留"
                >
                  <Button
                    type="text"
                    icon={<StarFilled style={{ color: 'var(--jz-gold, #d4a017)' }} />}
                    loading={removingId === doc.id}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`取消收藏 ${doc.title}`}
                  >
                    取消收藏
                  </Button>
                </Popconfirm>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
