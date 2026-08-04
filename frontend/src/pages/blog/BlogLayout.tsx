import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Button, Layout, Space, Spin, Tooltip } from 'antd';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import ThemeSwitcher from '@/components/common/ThemeSwitcher';
import LiveClock from '@/components/common/LiveClock';
import { useScrolled } from '@/hooks/useScrolled';
import GlobalSearch from '@/components/common/GlobalSearch';
import UserAccountMenu from '@/components/common/UserAccountMenu';
import { signalRouteReady } from '@/utils/routeTransition';
import {
  JzArchiveIcon,
  JzRssIcon,
  JzSearchIcon,
  JzTagsIcon,
  JzUserIcon,
} from '@/components/common/JzIcon';
import { useAuthStore } from '@/stores/auth';

const { Header, Content, Footer } = Layout;

const NAV_ICON_SIZE = 22;

function BlogNavItem({
  to,
  label,
  icon,
  external,
  tone,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  external?: boolean;
  tone?: string;
}) {
  const inner = (
    <>
      <span
        className={
          'jz-nav-link-icon' + (tone ? ` jz-ico-toned jz-ico-tone-${tone}` : '')
        }
        aria-hidden
      >
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
  const scrolled = useScrolled();
  const authUser = useAuthStore((s) => s.user);
  const authLoaded = useAuthStore((s) => s.loaded);
  const requireLogin = useAuthStore((s) => s.requireLogin);
  const loadSession = useAuthStore((s) => s.loadSession);
  const location = useLocation();

  useEffect(() => {
    if (!authLoaded) void loadSession();
  }, [authLoaded, loadSession]);

  // 路由级 View Transition 的集中 ready 信号：任一博客路由的首帧提交即放行
  // new 快照（TransitionLink 导航；懒 chunk 首载慢时由 600ms 超时兜底）。
  useLayoutEffect(() => {
    signalRouteReady();
  }, [location.pathname]);

  // NOTE: every hook must run on every render. Keep this above the
  // conditional early returns below — when SITE_REQUIRE_LOGIN flips
  // ``requireLogin`` to true and we bail out early, a hook declared
  // *after* the return would be skipped on that render, changing the
  // hook count between renders and crashing with React error #300
  // ("Rendered fewer hooks than expected").
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

  return (
    <Layout className="jz-blog-glass jz-glass" style={{ minHeight: '100vh' }}>
      {/* 键盘 Tab 首站：跳过顶栏导航直达正文（.jz-skip-link 仅聚焦时显形） */}
      <a className="jz-skip-link" href="#jz-main">
        跳到正文
      </a>
      <Header
        className={'blog-header' + (scrolled ? ' is-scrolled' : '')}
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
            icon={<JzArchiveIcon size={NAV_ICON_SIZE} />}
          />
          <BlogNavItem
            to="/tags"
            label="标签"
            icon={<JzTagsIcon size={NAV_ICON_SIZE} />}
          />
          <BlogNavItem
            to="/feed.xml"
            label="RSS"
            icon={<JzRssIcon size={NAV_ICON_SIZE} />}
            external
          />
          <Tooltip title="搜索 (Ctrl+K)">
            <Button
              type="text"
              className="jz-nav-search-btn"
              icon={
                <span className="jz-nav-link-icon" aria-hidden>
                  <JzSearchIcon size={NAV_ICON_SIZE} />
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
              <JzUserIcon size={16} className="jz-ico-toned jz-ico-tone-login" />
              <span className="jz-nav-link-label">登录</span>
            </Link>
          )}
          <LiveClock compact />
          <ThemeSwitcher />
        </Space>
      </Header>
      <Content id="jz-main" tabIndex={-1} className="blog-content jz-fade-in">
        <Outlet />
      </Content>
      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        resultUrl={(r) => r.visibility === 'public' && r.status === 'published'
          ? `/posts/${encodeURIComponent(r.slug)}`
          // Non-public hits go through /d/:id: authors get bounced into the
          // editor, readers get a graceful not-found instead of an admin 403.
          : `/d/${r.id}`
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
