import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Layout, Menu, Button, Space, Tooltip } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
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
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import GlobalSearch from '@/components/common/GlobalSearch';
import ThemeSwitcher from '@/components/common/ThemeSwitcher';
import LiveClock from '@/components/common/LiveClock';
import { AIModelBadge } from '@/components/common/AIModelBadge';

const { Header, Sider, Content } = Layout;

const MENU_ICON_SIZE = 20;

function menuIcon(node: ReactNode) {
  return <span className="jz-menu-icon-slot">{node}</span>;
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Cmd+K (mac) / Ctrl+K — global search
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/admin/login', { replace: true });
  }

  const selectedKey = useMemo(() => {
    if (location.pathname.startsWith('/admin/exports')) return 'exports';
    if (location.pathname.startsWith('/admin/ai')) return 'ai';
    if (location.pathname.startsWith('/admin/users')) return 'users';
    if (location.pathname.startsWith('/admin/overview')) return 'overview';
    if (location.pathname.startsWith('/admin/graph')) return 'graph';
    if (location.pathname.startsWith('/admin/kbs')) return 'kbs';
    return 'kbs';
  }, [location.pathname]);

  return (
    <Layout className="jz-admin-glass jz-glass" style={{ minHeight: '100vh' }}>
      <Sider
        width={232}
        breakpoint="lg"
        collapsedWidth={0}
        className="jz-admin-sider"
      >
        <div className="jz-admin-brand">
          <div className="jz-admin-brand-seal" aria-hidden>簡</div>
          <div className="jz-admin-brand-text">
            <div className="jz-admin-brand-name">简斋</div>
            <div className="jz-admin-brand-sub">后台</div>
          </div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          className="jz-admin-menu"
          items={[
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
              key: 'blog',
              icon: menuIcon(<JzBlogIcon size={MENU_ICON_SIZE} />),
              label: <Link to="/">查看博客</Link>,
            },
          ]}
        />
      </Sider>
      <Layout>
        <Header className="jz-admin-header">
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
          <Space size={12}>
            <AIModelBadge />
            <LiveClock />
            <ThemeSwitcher />
            <span style={{ color: 'var(--jz-text-muted)' }}>{user?.username}</span>
            <Button shape="round" icon={<LogoutOutlined />} onClick={handleLogout}>
              退出
            </Button>
          </Space>
        </Header>
        <Content className="jz-fade-in jz-admin-content">
          <Outlet />
        </Content>
      </Layout>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </Layout>
  );
}
