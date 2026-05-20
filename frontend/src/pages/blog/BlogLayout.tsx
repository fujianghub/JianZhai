import { useEffect, useState } from 'react';
import { Button, Layout, Space } from 'antd';
import { Link, NavLink, Outlet } from 'react-router-dom';
import ThemeSwitcher from '@/components/common/ThemeSwitcher';
import LiveClock from '@/components/common/LiveClock';
import GlobalSearch from '@/components/common/GlobalSearch';
import {
  JzArchiveIcon,
  JzTagsIcon,
  JzRssIcon,
  JzAdminIcon,
  JzSearchIcon,
} from '@/components/common/JzIcon';

const { Header, Content, Footer } = Layout;

export default function BlogLayout() {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        className="blog-header"
        style={{
          borderBottom: '1px solid var(--jz-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
        }}
      >
        <Link to="/" className="jz-brand" aria-label="简斋 / JianZhai">
          <span className="jz-brand-cn">简斋</span>
          <span className="jz-brand-sep" aria-hidden>·</span>
          <span className="jz-brand-en">JianZhai</span>
        </Link>
        <Space size={20} wrap align="center">
          <NavLink to="/archive" className="jz-nav-link">
            <JzArchiveIcon style={{ marginRight: 4 }} /> 归档
          </NavLink>
          <NavLink to="/tags" className="jz-nav-link">
            <JzTagsIcon style={{ marginRight: 4 }} /> 标签
          </NavLink>
          <a href="/feed.xml" target="_blank" rel="noreferrer" className="jz-nav-link">
            <JzRssIcon style={{ marginRight: 4 }} /> RSS
          </a>
          <NavLink to="/admin" className="jz-nav-link">
            <JzAdminIcon style={{ marginRight: 4 }} /> 后台
          </NavLink>
          <Button
            type="text"
            icon={<JzSearchIcon />}
            onClick={() => setSearchOpen(true)}
            aria-label="搜索 (Ctrl+K)"
            style={{ color: 'var(--jz-text-muted)' }}
          />
          <LiveClock compact />
          <ThemeSwitcher />
        </Space>
      </Header>
      <Content
        className="blog-content jz-fade-in"
        style={{ padding: '32px 48px', maxWidth: 1440, margin: '0 auto', width: '100%' }}
      >
        <Outlet />
      </Content>
      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        resultUrl={(r) => r.visibility === 'public' && r.status === 'published'
          ? `/posts/${encodeURIComponent(r.slug)}`
          : `/admin/kbs/${r.knowledge_base.id}?doc=${r.id}`
        }
      />
      <Footer
        style={{
          textAlign: 'center',
          color: 'var(--jz-text-muted)',
          fontSize: 12,
          padding: '14px 24px 18px',
          lineHeight: 1.5,
          background: 'transparent',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            letterSpacing: 1,
          }}
        >
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 28,
              height: 1,
              background: 'linear-gradient(to right, transparent, var(--jz-divider))',
            }}
          />
          <span
            style={{
              fontFamily: "'Noto Serif SC', 'Songti SC', serif",
              fontWeight: 600,
              color: 'var(--jz-text)',
              letterSpacing: 2,
            }}
          >
            简斋
          </span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>冯富江的个人博客</span>
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 28,
              height: 1,
              background: 'linear-gradient(to left, transparent, var(--jz-divider))',
            }}
          />
        </div>
      </Footer>
    </Layout>
  );
}
