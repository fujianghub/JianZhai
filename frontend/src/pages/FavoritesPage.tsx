import { useCallback, useEffect, useState } from 'react';
import { Button, Empty, Spin, Tag, Typography, message } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { StarFilled } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  listFavoriteDocuments,
  toggleDocumentFavorite,
  type FavoriteDocument,
} from '@/api/docs';
import { formatApiError } from '@/api/client';
import { docBrowseHref, docEditorHref } from '@/utils/docLinks';

const { Text } = Typography;

export default function FavoritesPage() {
  const navigate = useNavigate();
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

  async function handleUnfavorite(doc: FavoriteDocument, e: React.MouseEvent) {
    e.stopPropagation();
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

  if (items === null) {
    return (
      <div className="jz-favorites jz-favorites--loading">
        <Spin />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="jz-favorites">
        <section className="jz-hero" aria-label="题记">
          <div className="jz-hero-quote" style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)' }}>
            <span>我 的 收 藏</span>
          </div>
        </section>
        <Empty description="还没有收藏的文档">
          <Link to="/admin/kbs">去知识库</Link>
        </Empty>
      </div>
    );
  }

  return (
    <div className="jz-favorites">
      <section className="jz-hero" aria-label="题记">
        <div className="jz-hero-quote" style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)' }}>
          <span>我 的 收 藏</span>
        </div>
        <div className="jz-hero-attr">
          <span className="jz-hero-attr-rule" aria-hidden />
          <span>共 {items.length} 篇</span>
          <span className="jz-hero-attr-rule" aria-hidden />
        </div>
      </section>

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
                    to={`/admin/kbs/${doc.knowledge_base.id}`}
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
                  <Tag color={doc.status === 'published' ? 'green' : 'default'}>
                    {doc.status === 'published' ? '已发布' : '草稿'}
                  </Tag>
                  {doc.visibility === 'public' ? (
                    <Tag color="blue">公开</Tag>
                  ) : (
                    <Tag>私密</Tag>
                  )}
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
                <Link
                  to={docEditorHref(doc.knowledge_base.id, doc.id)}
                  className="jz-favorites-edit"
                  onClick={(e) => e.stopPropagation()}
                >
                  编辑
                </Link>
                <Button
                  type="text"
                  icon={<StarFilled style={{ color: 'var(--jz-gold, #d4a017)' }} />}
                  loading={removingId === doc.id}
                  onClick={(e) => void handleUnfavorite(doc, e)}
                  aria-label={`取消收藏 ${doc.title}`}
                >
                  取消收藏
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
