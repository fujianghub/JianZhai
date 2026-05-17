import { useEffect, useMemo, useState } from 'react';
import { Layout, Menu, Button, Space, Tooltip } from 'antd';
import {
  BookOutlined,
  DownloadOutlined,
  GlobalOutlined,
  LogoutOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import GlobalSearch from '@/components/common/GlobalSearch';
import ThemeSwitcher from '@/components/common/ThemeSwitcher';
import LiveClock from '@/components/common/LiveClock';

const { Header, Sider, Content } = Layout;

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
    if (location.pathname.startsWith('/admin/users')) return 'users';
    if (location.pathname.startsWith('/admin/kbs')) return 'kbs';
    return 'kbs';
  }, [location.pathname]);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={220}
        breakpoint="lg"
        collapsedWidth={0}
        style={{ borderRight: '1px solid var(--jz-border)' }}
      >
        <div
          style={{
            padding: '16px 20px',
            fontWeight: 700,
            fontSize: 18,
            letterSpacing: 1,
            borderBottom: '1px solid var(--jz-border)',
            color: 'var(--jz-text)',
          }}
        >
          简斋 · 后台
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          style={{ borderInlineEnd: 'none' }}
          items={[
            { key: 'kbs', icon: <BookOutlined />, label: <Link to="/admin/kbs">知识库</Link> },
            { key: 'exports', icon: <DownloadOutlined />, label: <Link to="/admin/exports">导出</Link> },
            ...(user?.is_staff
              ? [{ key: 'users', icon: <TeamOutlined />, label: <Link to="/admin/users">用户</Link> }]
              : []),
            { key: 'blog', icon: <GlobalOutlined />, label: <Link to="/">查看博客</Link> },
          ]}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            borderBottom: '1px solid var(--jz-border)',
          }}
        >
          <Tooltip title="搜索 (⌘/Ctrl + K)">
            <Button shape="round" icon={<SearchOutlined />} onClick={() => setSearchOpen(true)}>
              搜索文档…
            </Button>
          </Tooltip>
          <Space size={12}>
            <LiveClock />
            <ThemeSwitcher />
            <span style={{ color: 'var(--jz-text-muted)' }}>{user?.username}</span>
            <Button shape="round" icon={<LogoutOutlined />} onClick={handleLogout}>
              退出
            </Button>
          </Space>
        </Header>
        <Content className="jz-fade-in" style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </Layout>
  );
}
