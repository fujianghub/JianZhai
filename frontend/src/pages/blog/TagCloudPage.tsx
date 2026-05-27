import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Drawer,
  Empty,
  Grid,
  Input,
  Segmented,
  Spin,
  Tag as AntTag,
  Tooltip,
  Typography,
} from 'antd';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  getPublicTagEntries,
  publicTagCloud,
  type PublicTag,
  type PublicTagEntries,
} from '@/api/tags';
import { resolveTagColor, resolveTagCssColor } from '@/utils/tagColor';

const { Text } = Typography;

function seedRotation(id: number): number {
  const r = ((id * 2654435761) >>> 0) % 700;
  return r / 100 - 3.5;
}

type SortKey = 'count' | 'name' | 'docs';

function sealSizeTier(docCount: number, p33: number, p66: number): 'sm' | 'md' | 'lg' {
  if (docCount >= p66) return 'lg';
  if (docCount >= p33) return 'md';
  return 'sm';
}

function TagEntriesBody({
  loading,
  entries,
  onNavigate,
}: {
  loading: boolean;
  entries: PublicTagEntries | null;
  onNavigate?: () => void;
}) {
  if (loading || entries === null) {
    return (
      <div className="jz-tagcloud-drawer-loading">
        <Spin />
      </div>
    );
  }
  if (entries.posts.length === 0) {
    return <Empty description="该标签下还没有公开文章" />;
  }
  return (
    <ul className="jz-tagcloud-post-list">
      {entries.posts.map((p) => (
        <li key={p.id} className="jz-tagcloud-post-item">
          <time dateTime={p.published_at} className="jz-tagcloud-post-date">
            {dayjs(p.published_at).format('YYYY-MM-DD')}
          </time>
          <Link
            to={`/posts/${encodeURIComponent(p.slug)}`}
            onClick={onNavigate}
            className="jz-archive-title"
          >
            {p.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function TagCloudPage() {
  const screens = Grid.useBreakpoint();
  const useDrawer = !screens.md;
  const autoSelectedRef = useRef(false);

  const [tags, setTags] = useState<PublicTag[] | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('docs');
  const [activeTag, setActiveTag] = useState<PublicTag | null>(null);
  const [entries, setEntries] = useState<PublicTagEntries | null>(null);
  const [entriesLoading, setEntriesLoading] = useState(false);

  useEffect(() => {
    void publicTagCloud()
      .then(setTags)
      .catch(() => setTags([]));
  }, []);

  const visibleTags = useMemo(
    () => (tags ?? []).filter((t) => (t.doc_count ?? 0) > 0),
    [tags],
  );

  useEffect(() => {
    if (tags === null || autoSelectedRef.current || visibleTags.length !== 1) return;
    autoSelectedRef.current = true;
    setActiveTag(visibleTags[0]);
  }, [tags, visibleTags]);

  useEffect(() => {
    if (!activeTag) {
      setEntries(null);
      return;
    }
    setEntries(null);
    setEntriesLoading(true);
    void getPublicTagEntries(activeTag.id)
      .then(setEntries)
      .catch(() =>
        setEntries({
          tag: activeTag,
          posts: [],
        }),
      )
      .finally(() => setEntriesLoading(false));
  }, [activeTag]);

  const docCountTiers = useMemo(() => {
    const counts = visibleTags.map((t) => t.doc_count ?? 0).sort((a, b) => a - b);
    if (counts.length === 0) return { p33: 0, p66: 0 };
    const p33 = counts[Math.floor(counts.length * 0.33)] ?? 0;
    const p66 = counts[Math.floor(counts.length * 0.66)] ?? 0;
    return { p33, p66 };
  }, [visibleTags]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const xs = q ? visibleTags.filter((t) => t.name.toLowerCase().includes(q)) : [...visibleTags];
    if (sort === 'count') xs.sort((a, b) => (b.doc_count ?? 0) - (a.doc_count ?? 0));
    else if (sort === 'name') xs.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    else if (sort === 'docs') xs.sort((a, b) => (b.doc_count ?? 0) - (a.doc_count ?? 0));
    return xs;
  }, [visibleTags, query, sort]);

  if (tags === null) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 300 }}>
        <Spin />
      </div>
    );
  }
  if (visibleTags.length === 0) {
    return <Empty description="还没有带公开文章的标签" />;
  }

  const drawerTitle = activeTag ? (
    <span className="jz-tagcloud-drawer-title">
      <AntTag color={resolveTagColor(activeTag)} style={{ marginInlineEnd: 0 }}>
        {activeTag.name}
      </AntTag>
      <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
        {activeTag.doc_count ?? 0} 篇
      </Text>
    </span>
  ) : null;

  return (
    <div className="jz-tagcloud jz-tagcloud--glass">
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

      <div className="jz-tagcloud-toolbar">
        <Input.Search
          allowClear
          placeholder="按名称筛选标签…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="jz-tagcloud-search"
        />
        <Segmented
          value={sort}
          onChange={(v) => setSort(v as SortKey)}
          options={[
            { label: '文档数', value: 'docs' },
            { label: '字母', value: 'name' },
          ]}
        />
        <Text type="secondary" className="jz-tagcloud-toolbar-meta">
          共 {filtered.length} 个标签
        </Text>
      </div>

      <p className="jz-tagcloud-hint">点击印章查看该标签下的公开文章</p>

      <div className="jz-tagcloud-wall-bg">
        <div className="jz-tagcloud-wall">
          {filtered.map((t) => {
            const docN = t.doc_count ?? 0;
            const tier = sealSizeTier(docN, docCountTiers.p33, docCountTiers.p66);
            const rot = seedRotation(t.id);
            const isActive = activeTag?.id === t.id;
            return (
              <Tooltip key={t.id} title={`${docN} 篇`}>
                <button
                  type="button"
                  className="jz-seal-link"
                  aria-label={`${t.name}（${docN} 篇）`}
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => setActiveTag(t)}
                >
                  <span
                    className={`jz-seal-stamp jz-seal-stamp--${tier}${isActive ? ' jz-seal-stamp--active' : ''}`}
                    style={{
                      rotate: `${rot}deg`,
                      ['--jz-seal-c' as string]: resolveTagCssColor(t),
                    }}
                  >
                    <span className="jz-seal-text">{t.name}</span>
                    <span className="jz-seal-count" aria-hidden>
                      {docN}
                    </span>
                  </span>
                </button>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {!useDrawer && activeTag ? (
        <section className="jz-tagcloud-inline-entries" aria-labelledby="jz-tagcloud-inline-heading">
          <header className="jz-tagcloud-inline-head">
            <h2 id="jz-tagcloud-inline-heading" className="jz-tagcloud-inline-title">
              <AntTag color={resolveTagColor(activeTag)}>{activeTag.name}</AntTag>
              <Text type="secondary" className="jz-tagcloud-inline-meta">
                {activeTag.doc_count ?? 0} 篇公开文章
              </Text>
            </h2>
          </header>
          <TagEntriesBody loading={entriesLoading} entries={entries} />
        </section>
      ) : null}

      {useDrawer ? (
        <Drawer
          open={!!activeTag}
          onClose={() => setActiveTag(null)}
          title={drawerTitle}
          width={420}
          destroyOnHidden
          className="jz-tagcloud-drawer"
          styles={{
            header: { background: 'transparent' },
            body: { background: 'transparent' },
          }}
        >
          <TagEntriesBody
            loading={entriesLoading}
            entries={entries}
            onNavigate={() => setActiveTag(null)}
          />
        </Drawer>
      ) : null}
    </div>
  );
}
