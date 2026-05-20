import { useEffect, useMemo, useState } from 'react';
import { Drawer, Empty, Input, Segmented, Spin, Tag as AntTag, Tooltip, Typography } from 'antd';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { publicTagCloud, type PublicTag } from '@/api/tags';
import { listPublicPosts } from '@/api/blog';
import type { PublicPost } from '@/types';

const { Text } = Typography;

/** Subtle per-tag rotation so the印章 wall looks stamped, not stenciled. */
function seedRotation(id: number): number {
  // Deterministic ±3.5° from id
  const r = ((id * 2654435761) >>> 0) % 700;
  return r / 100 - 3.5;
}

type SortKey = 'count' | 'name' | 'docs';

export default function TagCloudPage() {
  const [tags, setTags] = useState<PublicTag[] | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('count');
  const [activeTag, setActiveTag] = useState<PublicTag | null>(null);
  const [posts, setPosts] = useState<PublicPost[] | null>(null);

  useEffect(() => {
    void publicTagCloud().then(setTags);
  }, []);

  useEffect(() => {
    if (!activeTag) return;
    setPosts(null);
    listPublicPosts({ tag: activeTag.slug })
      .then(setPosts)
      .catch(() => setPosts([]));
  }, [activeTag]);

  const filtered = useMemo(() => {
    if (!tags) return [];
    const q = query.trim().toLowerCase();
    const xs = q ? tags.filter((t) => t.name.toLowerCase().includes(q)) : [...tags];
    if (sort === 'count') xs.sort((a, b) => b.count - a.count);
    else if (sort === 'name') xs.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    else if (sort === 'docs') xs.sort((a, b) => (b.doc_count ?? 0) - (a.doc_count ?? 0));
    return xs;
  }, [tags, query, sort]);

  if (tags === null) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 300 }}>
        <Spin />
      </div>
    );
  }
  if (tags.length === 0) {
    return <Empty description="还没有公开标签" />;
  }
  const maxCount = Math.max(...tags.map((t) => t.count));

  return (
    <div className="jz-tagcloud">
      <section className="jz-hero" aria-label="题记">
        <div className="jz-hero-quote" style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)' }}>
          <span>百 名 印 谱</span>
        </div>
        <div className="jz-hero-attr">
          <span className="jz-hero-attr-rule" aria-hidden />
          <span>按类索文 · 一印一题</span>
          <span className="jz-hero-attr-rule" aria-hidden />
        </div>
      </section>

      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 24,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Input.Search
          allowClear
          placeholder="按名称筛选标签…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <Segmented
          value={sort}
          onChange={(v) => setSort(v as SortKey)}
          options={[
            { label: '热度', value: 'count' },
            { label: '字母', value: 'name' },
            { label: '文档最多', value: 'docs' },
          ]}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          共 {filtered.length} 个标签
        </Text>
      </div>

      <div className="jz-tagcloud-wall">
        {filtered.map((t) => {
          // Size scales with use count — most used tags become bigger 印章.
          const w = 0.6 + (t.count / Math.max(maxCount, 1)) * 0.7; // 0.6 .. 1.3
          const fontSize = Math.round(16 + w * 8);
          const pad = Math.round(6 + w * 4);
          const rot = seedRotation(t.id);
          return (
            <Tooltip key={t.id} title={`${t.count} 篇 · 点击查看`}>
              <button
                type="button"
                className="jz-seal-link"
                aria-label={`${t.name}（${t.count} 篇）`}
                onClick={() => setActiveTag(t)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  font: 'inherit',
                }}
              >
                <span
                  className="jz-seal-stamp"
                  style={{
                    fontSize,
                    padding: `${pad}px ${pad + 4}px`,
                    rotate: `${rot}deg`,
                  }}
                >
                  <span className="jz-seal-text">{t.name}</span>
                  <span className="jz-seal-count" aria-hidden>
                    {t.count}
                  </span>
                </span>
              </button>
            </Tooltip>
          );
        })}
      </div>

      <Drawer
        open={!!activeTag}
        onClose={() => setActiveTag(null)}
        title={
          activeTag ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <AntTag color={activeTag.color || 'blue'} style={{ marginInlineEnd: 0 }}>
                {activeTag.name}
              </AntTag>
              <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
                {activeTag.count} 项
              </Text>
            </span>
          ) : null
        }
        width={420}
        destroyOnHidden
      >
        {posts === null ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : posts.length === 0 ? (
          <Empty description="该标签下还没有公开文章" />
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {posts.map((p) => (
              <li
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                  padding: '10px 0',
                  borderBottom: '1px solid var(--jz-border)',
                }}
              >
                <time
                  dateTime={p.published_at}
                  style={{
                    flexShrink: 0,
                    fontSize: 12,
                    color: 'var(--jz-text-muted)',
                    width: 80,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {dayjs(p.published_at).format('YYYY-MM-DD')}
                </time>
                <Link
                  to={`/posts/${encodeURIComponent(p.slug)}`}
                  onClick={() => setActiveTag(null)}
                  style={{
                    flex: 1,
                    color: 'var(--jz-text)',
                    textDecoration: 'none',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    </div>
  );
}
