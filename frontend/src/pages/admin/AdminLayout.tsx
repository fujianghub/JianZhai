import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Layout, Menu, Button, Space, Tooltip } from 'antd';
import { DeleteOutlined, HomeOutlined, MenuOutlined } from '@ant-design/icons';
import {
  JzKbIcon,
  JzGraphIcon,
  JzExportIcon,
  JzAiIcon,
  JzUsersIcon,
  JzArchitectureIcon,
  JzBlogIcon,
  JzSearchIcon,
} from '@/components/common/JzIcon';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import GlobalSearch from '@/components/common/GlobalSearch';
import QuickSwitcher from '@/components/common/QuickSwitcher';
import QuickCaptureModal from '@/components/common/QuickCaptureModal';
import ThemeSwitcher from '@/components/common/ThemeSwitcher';
import LiveClock from '@/components/common/LiveClock';
import { AIModelBadge } from '@/components/common/AIModelBadge';
import UserAccountMenu from '@/components/common/UserAccountMenu';

const { Header, Sider, Content } = Layout;

const MENU_ICON_SIZE = 20;

function menuIcon(node: ReactNode) {
  return <span className="jz-menu-icon-slot">{node}</span>;
}

export default function AdminLayout() {
  const location = useLocation();
  const { user } = useAuthStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  // Sider collapses to 0 below the `lg` breakpoint — keep a controlled state so
  // the mobile hamburger button can re-open it, and auto-collapse on navigation
  // so the menu doesn't sit open after a link click.
  const [siderCollapsed, setSiderCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 992) {
      setSiderCollapsed(true);
    }
  }, [location.pathname]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      // ⌘+Shift+N — quick capture (must check first; the n key would also
      // bubble up to the ⌘+N "new window" but the shift discriminator
      // separates them).
      if (e.shiftKey && k === 'n') {
        e.preventDefault();
        setCaptureOpen(true);
        return;
      }
      if (e.shiftKey) return;
      // ⌘K / Ctrl+K — global full-text search
      if (k === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      // ⌘P / Ctrl+P — quick switcher (jump to doc by title). Overrides the
      // browser print dialog inside /admin — admin pages don't need it; users
      // who want to print can still File → Print from the menu.
      if (k === 'p') {
        e.preventDefault();
        setSwitcherOpen(true);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const selectedKey = useMemo(() => {
    if (location.pathname.startsWith('/admin/trash')) return 'trash';
    if (location.pathname.startsWith('/admin/favorites')) return 'favorites';
    if (location.pathname.startsWith('/admin/profile')) return 'profile';
    if (location.pathname.startsWith('/admin/exports')) return 'exports';
    if (location.pathname.startsWith('/admin/ai')) return 'ai';
    if (location.pathname.startsWith('/admin/users')) return 'users';
    if (location.pathname.startsWith('/admin/overview')) return 'overview';
    if (location.pathname.startsWith('/admin/graph')) return 'graph';
    if (location.pathname.startsWith('/admin/kbs')) return 'kbs';
    // Bare /admin (or /admin/) is the new 个人空间 work-bench dashboard.
    return 'dashboard';
  }, [location.pathname]);

  return (
    <Layout className="jz-admin-glass jz-glass" style={{ minHeight: '100vh' }}>
      <Sider
        width={232}
        breakpoint="lg"
        collapsedWidth={0}
        trigger={null}
        collapsed={siderCollapsed}
        onBreakpoint={(broken) => setSiderCollapsed(broken)}
        className="jz-admin-sider"
      >
        <Link
          to="/admin"
          className="jz-admin-brand"
          style={{ color: 'inherit', textDecoration: 'none' }}
          aria-label="回到个人空间工作台"
        >
          <div className="jz-admin-brand-seal" aria-hidden>簡</div>
          <div className="jz-admin-brand-text">
            <div className="jz-admin-brand-name">简斋</div>
            <div className="jz-admin-brand-sub">个人空间</div>
          </div>
        </Link>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          className="jz-admin-menu"
          items={[
            {
              key: 'dashboard',
              icon: menuIcon(<HomeOutlined style={{ fontSize: MENU_ICON_SIZE }} />),
              label: <Link to="/admin">工作台</Link>,
            },
            {
              key: 'kbs',
              icon: menuIcon(<JzKbIcon size={MENU_ICON_SIZE} />),
              label: <Link to="/admin/kbs">知识库</Link>,
            },
            {
              key: 'graph',
              icon: menuIcon(<JzGraphIcon size={MENU_ICON_SIZE} />),
              label: <Link to="/admin/graph">知识图谱</Link>,
            },
            {
              key: 'exports',
              icon: menuIcon(<JzExportIcon size={MENU_ICON_SIZE} />),
              label: <Link to="/admin/exports">导出</Link>,
            },
            {
              key: 'trash',
              icon: menuIcon(<DeleteOutlined style={{ fontSize: MENU_ICON_SIZE }} />),
              label: <Link to="/admin/trash">回收站</Link>,
            },
            {
              key: 'ai',
              icon: menuIcon(<JzAiIcon size={MENU_ICON_SIZE} />),
              label: <Link to="/admin/ai">AI 助手</Link>,
            },
            ...(user?.is_staff
              ? [{
                  key: 'users',
                  icon: menuIcon(<JzUsersIcon size={MENU_ICON_SIZE} />),
                  label: <Link to="/admin/users">用户</Link>,
                }]
              : []),
            ...(user?.is_superuser
              ? [
                  {
                    key: 'overview',
                    icon: menuIcon(<JzArchitectureIcon size={MENU_ICON_SIZE} />),
                    label: <Link to="/admin/overview">架构总览</Link>,
                  },
                ]
              : []),
            {
              key: 'profile',
              icon: menuIcon(<JzUsersIcon size={MENU_ICON_SIZE} />),
              label: <Link to="/admin/profile">个人资料</Link>,
            },
            {
              key: 'blog',
              icon: menuIcon(<JzBlogIcon size={MENU_ICON_SIZE} />),
              label: <Link to="/">查看博客</Link>,
            },
          ]}
        />
      </Sider>
      <Layout>
        <Header className="jz-admin-header">
          <Button
            className="jz-admin-mobile-menu-btn"
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setSiderCollapsed((c) => !c)}
            aria-label={siderCollapsed ? '展开菜单' : '收起菜单'}
          />
          <Tooltip title="搜索 (⌘/Ctrl + K)">
            <Button
              shape="round"
              icon={<JzSearchIcon size={18} />}
              onClick={() => setSearchOpen(true)}
              className="jz-admin-search"
            >
              搜索文档…
              <kbd className="jz-admin-search-kbd">⌘K</kbd>
            </Button>
          </Tooltip>
          <div className="jz-admin-header-nav">
            <Space size={12}>
              <AIModelBadge />
              <LiveClock />
              <ThemeSwitcher />
              {user ? (
                <UserAccountMenu
                  user={user}
                  avatarSize={34}
                  favoritesTo="/admin/favorites"
                  trashTo="/admin/trash"
                />
              ) : null}
            </Space>
          </div>
        </Header>
        <Content className="jz-fade-in jz-admin-content">
          <Outlet />
        </Content>
      </Layout>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <QuickSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
      <QuickCaptureModal open={captureOpen} onClose={() => setCaptureOpen(false)} />
    </Layout>
  );
}
