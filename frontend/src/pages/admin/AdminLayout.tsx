import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { Layout, Menu, Button, Space, Tooltip } from 'antd';
import { StarOutlined } from '@ant-design/icons';
/* 自制 SF 分层系列（市场标准字形 + 单色双层渲染，2026-06-06 定稿） */
import {
  JzAiIcon,
  JzArchitectureIcon,
  JzDashboardIcon,
  JzExportIcon,
  JzGraphIcon,
  JzKbIcon,
  JzMenuIcon,
  JzProfileIcon,
  JzQuoteIcon,
  JzSearchIcon,
  JzTrashIcon,
  JzUserGroupIcon,
} from '@/components/common/JzIcon';
import { Outlet, useLocation } from 'react-router-dom';
import TransitionLink from '@/components/common/TransitionLink';
import { signalRouteReady } from '@/utils/routeTransition';
import { useAuthStore } from '@/stores/auth';
import GlobalSearch from '@/components/common/GlobalSearch';
import QuickSwitcher from '@/components/common/QuickSwitcher';
import QuickCaptureModal from '@/components/common/QuickCaptureModal';
import ThemeSwitcher from '@/components/common/ThemeSwitcher';
import LiveClock from '@/components/common/LiveClock';
import { AIModelBadge } from '@/components/common/AIModelBadge';
import UserAccountMenu from '@/components/common/UserAccountMenu';
import { ICON_SIZE } from '@/components/common/iconSize';
import BrandSeal from '@/components/common/BrandSeal';
import { ariaKeyshortcuts, useShortcut, withShortcut } from '@/shortcuts';
import Kbd from '@/components/common/Kbd';

const { Header, Sider, Content } = Layout;

const MENU_ICON_SIZE = ICON_SIZE.tile;

function menuIcon(node: ReactNode, tone?: string) {
  return (
    <span
      className={
        'jz-menu-icon-slot' + (tone ? ` jz-ico-toned jz-ico-tone-${tone}` : '')
      }
    >
      {node}
    </span>
  );
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

  // 后台 UI 字体作用域：挂在 <html> 上（而非 .jz-admin-glass），AntD portal
  // 到 body 的弹层（Modal/message/Dropdown）才能解析到 --jz-font-ui 的
  // MiSans 覆盖（tokens.css `:root[data-scope='admin']`）。无属性 = 博客默认。
  useEffect(() => {
    document.documentElement.setAttribute('data-scope', 'admin');
    return () => {
      document.documentElement.removeAttribute('data-scope');
    };
  }, []);

  // 路由级 VT 的集中 ready 信号（与 BlogLayout 同款；TransitionLink 导航）
  useLayoutEffect(() => {
    signalRouteReady();
  }, [location.pathname]);

  // 键位见 shortcuts/registry（admin.*）：速记曾绑 Shift+N，被浏览器无痕窗口截胡；
  // 快速跳转 Mod+P 刻意覆盖浏览器打印（注册表 conflict 字段会在速查表标注）。
  useShortcut('admin.quick-capture', () => setCaptureOpen(true));
  useShortcut('admin.search', () => setSearchOpen(true));
  useShortcut('admin.quick-switcher', () => setSwitcherOpen(true));

  const selectedKey = useMemo(() => {
    if (location.pathname.startsWith('/admin/trash')) return 'trash';
    if (location.pathname.startsWith('/admin/favorites')) return 'favorites';
    if (location.pathname.startsWith('/admin/profile')) return 'profile';
    if (location.pathname.startsWith('/admin/hero')) return 'hero';
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
      {/* 键盘 Tab 首站：跳过侧栏/顶栏直达正文（.jz-skip-link 仅聚焦时显形） */}
      <a className="jz-skip-link" href="#jz-main">
        跳到正文
      </a>
      <Sider
        width={232}
        breakpoint="lg"
        collapsedWidth={0}
        trigger={null}
        collapsed={siderCollapsed}
        onBreakpoint={(broken) => setSiderCollapsed(broken)}
        className="jz-admin-sider"
      >
        {/* 印章 logo — primary "回博客首页" affordance.
            v0.9.4 deletion of the explicit ``查看博客`` menu item makes
            this the only "leave-admin" anchor, so keep the click target
            generous and the aria label descriptive. */}
        <TransitionLink
          to="/"
          className="jz-admin-brand jz-seal-host"
          style={{ color: 'inherit', textDecoration: 'none' }}
          aria-label="返回博客首页（藏经阁）"
          title="返回博客首页"
        >
          <BrandSeal size="md" />
          <div className="jz-admin-brand-text">
            <div className="jz-admin-brand-name">简斋</div>
            <div className="jz-admin-brand-sub">个人空间</div>
          </div>
        </TransitionLink>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          className="jz-admin-menu"
          items={[
            // Author tier (admin + root). Normal users (readers) only ever
            // see 收藏 + 个人资料 below.
            ...(user?.is_staff
              ? [
            {
              key: 'dashboard',
              icon: menuIcon(
                <JzDashboardIcon size={MENU_ICON_SIZE} />,
                'dashboard',
              ),
              label: <TransitionLink to="/admin">工作台</TransitionLink>,
            },
            {
              key: 'kbs',
              icon: menuIcon(
                <JzKbIcon size={MENU_ICON_SIZE} />,
                'kb',
              ),
              label: <TransitionLink to="/admin/kbs">知识库</TransitionLink>,
            },
            {
              key: 'graph',
              icon: menuIcon(
                <JzGraphIcon size={MENU_ICON_SIZE} />,
                'graph',
              ),
              label: <TransitionLink to="/admin/graph">知识图谱</TransitionLink>,
            },
              ]
              : []),
            {
              key: 'favorites',
              icon: menuIcon(
                <StarOutlined style={{ fontSize: MENU_ICON_SIZE }} />,
                'star',
              ),
              label: <TransitionLink to="/admin/favorites">收藏</TransitionLink>,
            },
            ...(user?.is_staff
              ? [
            {
              key: 'exports',
              icon: menuIcon(
                <JzExportIcon size={MENU_ICON_SIZE} />,
                'exports',
              ),
              label: <TransitionLink to="/admin/exports">导出</TransitionLink>,
            },
            {
              key: 'trash',
              icon: menuIcon(
                <JzTrashIcon size={ICON_SIZE.tile - 3} />, // viewBox 已裁至字形边界，21px 满框居中
                'trash',
              ),
              label: <TransitionLink to="/admin/trash">回收站</TransitionLink>,
            },
            {
              key: 'ai',
              icon: menuIcon(
                <JzAiIcon size={ICON_SIZE.tile + 1} />,
                'ai',
              ),
              label: <TransitionLink to="/admin/ai">AI 助手</TransitionLink>,
            },
              ]
              : []),
            ...(user?.is_staff
              ? [{
                  key: 'users',
                  icon: menuIcon(
                    <JzUserGroupIcon size={ICON_SIZE.tile + 7} />, // +30%，源稿叠 14 描边轻微加粗
                'users',
                  ),
                  label: <TransitionLink to="/admin/users">用户管理</TransitionLink>,
                }]
              : []),
            ...(user?.is_superuser
              ? [
                  {
                    key: 'overview',
                    icon: menuIcon(
                      <JzArchitectureIcon size={MENU_ICON_SIZE} />,
                'overview',
                    ),
                    label: <TransitionLink to="/admin/overview">架构总览</TransitionLink>,
                  },
                ]
              : []),
            // 题记 — staff-only management of the homepage banner. Sits
            // between 架构总览 and 个人资料 because it's "site content"
            // category alongside 架构总览, but its visibility scope
            // (is_staff) matches users management above.
            ...(user?.is_staff
              ? [{
                  key: 'hero',
                  icon: menuIcon(
                    <JzQuoteIcon size={MENU_ICON_SIZE} />,
                'hero',
                  ),
                  label: <TransitionLink to="/admin/hero">题记</TransitionLink>,
                }]
              : []),
            {
              key: 'profile',
              icon: menuIcon(
                <JzProfileIcon size={ICON_SIZE.tile + 4} />, // +20%，源稿已叠描边加粗
                'profile',
              ),
              label: <TransitionLink to="/admin/profile">个人资料</TransitionLink>,
            },
            // 「查看博客」菜单项已删除（v0.9.4）；点击左上角「簡」logo 直返首页。
          ]}
        />
      </Sider>
      <Layout>
        <Header className="jz-admin-header">
          <Button
            className="jz-admin-mobile-menu-btn"
            type="text"
            icon={<JzMenuIcon size={ICON_SIZE.lg} />}
            onClick={() => setSiderCollapsed((c) => !c)}
            aria-label={siderCollapsed ? '展开菜单' : '收起菜单'}
          />
          <Tooltip title={withShortcut('搜索', 'admin.search')}>
            <Button
              shape="round"
              icon={<JzSearchIcon size={ICON_SIZE.lg} />}
              onClick={() => setSearchOpen(true)}
              className="jz-admin-search"
              aria-keyshortcuts={ariaKeyshortcuts('admin.search')}
            >
              搜索文档…
              <Kbd id="admin.search" />
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
        <Content id="jz-main" tabIndex={-1} className="jz-fade-in jz-admin-content">
          <Outlet />
        </Content>
      </Layout>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <QuickSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
      <QuickCaptureModal open={captureOpen} onClose={() => setCaptureOpen(false)} />
    </Layout>
  );
}
