import { useEffect, useState } from 'react';
import { Button, Empty, Space, Tag, Typography } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { ArrowRightOutlined, PlusOutlined } from '@ant-design/icons';
import * as kbsApi from '@/api/kbs';
import { useAuthStore } from '@/stores/auth';
import type { PublicKB, PublicKBCategoryGroup } from '@/types';
import { resolveTagColor } from '@/utils/tagColor';
import HeroQuoteRotator from '@/components/blog/HeroQuoteRotator';
import { useRevealOnScroll } from '@/hooks/useRevealOnScroll';
import { isPlainLeftClick, navigateWithTransition } from '@/utils/routeTransition';

const { Text } = Typography;

function KBCard({ kb }: { kb: PublicKB }) {
  const navigate = useNavigate();
  return (
    <Link
      to={`/kb/${encodeURIComponent(kb.slug)}`}
      className="jz-book jz-reveal"
      onClick={(e) => {
        // 一镜到底：书卡标签 → KB 页头标题的共享元素过渡（View Transition）。
        // 修饰键/中键交还浏览器默认行为；KB 名/accent 经 route state 先行，
        // 目标页在数据落地前即可渲染页头壳承接（KBPostsPage routeSeed）。
        if (!isPlainLeftClick(e.nativeEvent)) return;
        e.preventDefault();
        const label = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.jz-book-label');
        navigateWithTransition(
          () =>
            navigate(`/kb/${encodeURIComponent(kb.slug)}`, {
              state: { kbName: kb.name, kbAccent: kb.accent_color || null },
            }),
          { el: label, name: 'jz-kb-hero' },
        );
      }}
      style={
        {
          ['--jz-book-accent' as string]: kb.accent_color || 'var(--jz-accent)',
        } as React.CSSProperties
      }
    >
      <div className="jz-book-label">
        <span className="jz-book-label-text">{kb.name}</span>
      </div>
      <div className="jz-book-desc">{kb.description || '（暂无简介）'}</div>
      <div className="jz-book-tags">
        <Space size={6} wrap>
          {kb.tags.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              无标签
            </Text>
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
        <span>
          共 {kb.post_count} 卷 · {dayjs(kb.updated_at).format('YYYY-MM-DD')}
        </span>
        <span className="jz-book-meta-action">
          阅 <ArrowRightOutlined />
        </span>
      </div>
    </Link>
  );
}

export default function BlogHome() {
  const [groups, setGroups] = useState<PublicKBCategoryGroup[] | null>(null);

  const authUser = useAuthStore((s) => s.user);
  const authLoaded = useAuthStore((s) => s.loaded);
  const loadSession = useAuthStore((s) => s.loadSession);
  useEffect(() => {
    if (!authLoaded) void loadSession();
  }, [authLoaded, loadSession]);
  useEffect(() => {
    void kbsApi
      .listPublicKBCategories()
      .then(setGroups)
      .catch(() => setGroups([]));
  }, []);
  // KB cards float up as they enter the viewport, staggered per row
  useRevealOnScroll('.jz-kb-category-grid .jz-book', groups);

  const totalKbs =
    groups?.reduce((n, g) => n + g.knowledge_bases.length, 0) ?? 0;

  const homeToolbar = authUser ? (
    <div className="jz-blog-home-toolbar">
      <Link to="/admin/kbs">
        <Button type="primary" icon={<PlusOutlined />}>
          新建 / 管理知识库
        </Button>
      </Link>
    </div>
  ) : null;

  if (groups === null) {
    // 骨架保持书卡网格几何，数据落地不跳版（shimmer 见 theme.css .jz-skel）
    return (
      <div className="jz-kb-category-grid" aria-busy="true" aria-label="加载中">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="jz-book jz-book-skel" aria-hidden>
            <div className="jz-skel jz-skel-title" />
            <div className="jz-skel jz-skel-line" />
            <div className="jz-skel jz-skel-line" style={{ width: '78%' }} />
            <div className="jz-skel jz-skel-line" style={{ width: '42%', marginTop: 26 }} />
          </div>
        ))}
      </div>
    );
  }

  if (totalKbs === 0) {
    return (
      <div>
        {homeToolbar}
        <Empty description="还没有公开的知识库" />
      </div>
    );
  }

  return (
    <div>
      {homeToolbar}
      <section className="jz-hero" aria-label="题记">
        {/* Quote + 印章 + 署名行 — driven by the singleton /api/v1/public/hero/.
            Falls back to the original 诸葛亮 quote when the API is unreachable
            so an offline / first-boot homepage still has a banner. Managed
            from /admin/profile (题记 Tab). */}
        <HeroQuoteRotator />
        <div className="jz-hero-sub">
          <h2 className="jz-hero-cangjingge" aria-label="藏经阁">
            <span className="jz-hero-cangjingge-char">藏</span>
            <span className="jz-hero-cangjingge-char">经</span>
            <span className="jz-hero-cangjingge-char">阁</span>
          </h2>
          <div className="jz-hero-couplet" aria-label="藏书千卷 · 请君启一函">
            <span className="jz-hero-couplet-line">藏书千卷</span>
            <span className="jz-hero-couplet-dot" aria-hidden>
              ·
            </span>
            <span className="jz-hero-couplet-line">请君启一函</span>
          </div>
        </div>
      </section>

      {groups.map((group) => (
        <section key={group.category?.id ?? 'uncategorized'} className="jz-kb-category-section">
          <header
            className="jz-kb-category-head"
            style={
              group.category?.accent_color
                ? ({
                    ['--jz-category-accent' as string]: group.category.accent_color,
                  } as React.CSSProperties)
                : undefined
            }
          >
            <h2 className="jz-kb-category-title">
              {group.category?.name ?? '其他'}
            </h2>
            {group.category?.description ? (
              <Text type="secondary" className="jz-kb-category-desc">
                {group.category.description}
              </Text>
            ) : null}
          </header>
          <div className="jz-kb-category-grid">
            {group.knowledge_bases.map((kb) => (
              <KBCard key={kb.id} kb={kb} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
