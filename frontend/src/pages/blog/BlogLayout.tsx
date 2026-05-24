import { useEffect, useState, type ReactNode } from 'react';
import { Button, Layout, Space, Tooltip } from 'antd';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { UserOutlined } from '@ant-design/icons';
import ThemeSwitcher from '@/components/common/ThemeSwitcher';
import LiveClock from '@/components/common/LiveClock';
import GlobalSearch from '@/components/common/GlobalSearch';
import UserAccountMenu from '@/components/common/UserAccountMenu';
import {
  JzArchiveIcon,
  JzTagsIcon,
  JzRssIcon,
  JzSearchIcon,
} from '@/components/common/JzIcon';
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
  const loadSession = useAuthStore((s) => s.loadSession);

  useEffect(() => {
    if (!authLoaded) void loadSession();
  }, [authLoaded, loadSession]);

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
            <UserAccountMenu user={authUser} avatarSize={34} />
          ) : (
            <Link to="/admin/login" className="jz-nav-link jz-nav-link--login">
              <UserOutlined />
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
