import { useEffect, useState, type ReactNode } from 'react';
import { Button, Layout, Space, Spin, Tooltip } from 'antd';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import ThemeSwitcher from '@/components/common/ThemeSwitcher';
import LiveClock from '@/components/common/LiveClock';
import GlobalSearch from '@/components/common/GlobalSearch';
import UserAccountMenu from '@/components/common/UserAccountMenu';
import {
  Archive,
  MagnifyingGlass,
  RssSimple,
  Tag,
  User,
} from '@phosphor-icons/react';
import { useAuthStore } from '@/stores/auth';

const { Header, Content, Footer } = Layout;

const NAV_ICON_SIZE = 20;

function BlogNavItem({
  to,
  label,
  icon,
  external,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  external?: boolean;
}) {
  const inner = (
    <>
      <span className="jz-nav-link-icon" aria-hidden>
        {icon}
      </span>
      <span className="jz-nav-link-label">{label}</span>
    </>
  );
  if (external) {
    return (
      <a href={to} target="_blank" rel="noreferrer" className="jz-nav-link">
        {inner}
      </a>
    );
  }
  return (
    <NavLink to={to} className={({ isActive }) => 'jz-nav-link' + (isActive ? ' active' : '')}>
      {inner}
    </NavLink>
  );
}

export default function BlogLayout() {
  const [searchOpen, setSearchOpen] = useState(false);
  const authUser = useAuthStore((s) => s.user);
  const authLoaded = useAuthStore((s) => s.loaded);
  const requireLogin = useAuthStore((s) => s.requireLogin);
  const loadSession = useAuthStore((s) => s.loadSession);
  const location = useLocation();

  useEffect(() => {
    if (!authLoaded) void loadSession();
  }, [authLoaded, loadSession]);

  // v0.9.8 "friends-only" mode: the deployment was started with
  // SITE_REQUIRE_LOGIN=true. Anonymous visitors to any blog route get
  // bounced to the login page; ``from`` carries the original URL so the
  // login page can return them after authenticating. Until the session
  // call resolves we show a spinner — without the gate the page would
  // briefly render content before the redirect, which looks broken.
  if (requireLogin && !authLoaded) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <Spin />
      </div>
    );
  }
  if (requireLogin && authLoaded && !authUser) {
    return (
      <Navigate
        to="/admin/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

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
    <Layout className="jz-blog-glass jz-glass" style={{ minHeight: '100vh' }}>
      <Header
        className="blog-header"
        style={{
          borderBottom: '1px solid var(--jz-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Link to="/" className="jz-brand" aria-label="简斋 / JianZhai">
          <span className="jz-brand-cn">简斋</span>
          <span className="jz-brand-sep" aria-hidden>·</span>
          <span className="jz-brand-en">JianZhai</span>
        </Link>
        <Space size={12} wrap align="center" className="jz-blog-header-nav">
          <BlogNavItem
            to="/archive"
            label="归档"
            icon={<Archive weight="regular" size={NAV_ICON_SIZE} />}
          />
          <BlogNavItem
            to="/tags"
            label="标签"
            icon={<Tag weight="regular" size={NAV_ICON_SIZE} />}
          />
          <BlogNavItem
            to="/feed.xml"
            label="RSS"
            icon={<RssSimple weight="regular" size={NAV_ICON_SIZE} />}
            external
          />
          <Tooltip title="搜索 (Ctrl+K)">
            <Button
              type="text"
              className="jz-nav-search-btn"
              icon={
                <span className="jz-nav-link-icon" aria-hidden>
                  <MagnifyingGlass weight="regular" size={NAV_ICON_SIZE} />
                </span>
              }
              onClick={() => setSearchOpen(true)}
              aria-label="搜索 (Ctrl+K)"
            />
          </Tooltip>
          {authUser ? (
            <UserAccountMenu
              user={authUser}
              avatarSize={34}
              favoritesTo="/favorites"
              trashTo="/admin/trash"
            />
          ) : (
            <Link to="/admin/login" className="jz-nav-link jz-nav-link--login">
              <User weight="regular" size={16} />
              <span className="jz-nav-link-label">登录</span>
            </Link>
          )}
          <LiveClock compact />
          <ThemeSwitcher />
        </Space>
      </Header>
      <Content className="blog-content jz-fade-in">
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
      <Footer className="jz-blog-footer">
        <div className="jz-blog-footer-inner">
          <span className="jz-blog-footer-rule jz-blog-footer-rule--left" aria-hidden />
          <span className="jz-blog-footer-brand">简斋</span>
          <span className="jz-blog-footer-dot">·</span>
          <span>冯富江的个人博客</span>
          <span className="jz-blog-footer-rule jz-blog-footer-rule--right" aria-hidden />
        </div>
      </Footer>
    </Layout>
  );
}
