import { useNavigate } from 'react-router-dom';
import { Dropdown } from 'antd';
import { Link } from 'react-router-dom';
import {
  JzLogoutIcon,
  JzSettingsIcon,
  JzSpaceIcon,
  JzStarIcon,
  JzTrashIcon,
} from '@/components/common/JzIcon';
import { useAuthStore } from '@/stores/auth';
import type { SessionUser } from '@/types';
import UserAvatar from './UserAvatar';

interface Props {
  user: SessionUser;
  /** 顶栏触发器头像尺寸，默认 32 */
  avatarSize?: number;
  /** 「我的收藏」链接，博客 / 后台各用不同路径 */
  favoritesTo?: string;
  /** 「回收站」链接，默认后台回收站页 */
  trashTo?: string;
}

export default function UserAccountMenu({
  user,
  avatarSize = 32,
  favoritesTo = '/favorites',
  trashTo = '/admin/trash',
}: Props) {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);

  async function handleLogout() {
    await logout();
    navigate('/admin/login', { replace: true });
  }

  const panel = (
    <div className="jz-user-menu-panel">
      <div className="jz-user-menu-header">
        <UserAvatar user={user} size={48} />
        <span className="jz-user-menu-name">{user.username}</span>
      </div>
      <div className="jz-user-menu-actions">
        <Link to="/admin" className="jz-user-menu-item">
          <JzSpaceIcon size={16} />
          <span>个人空间</span>
        </Link>
        <Link to={favoritesTo} className="jz-user-menu-item">
          <JzStarIcon size={16} />
          <span>我的收藏</span>
        </Link>
        <Link to={trashTo} className="jz-user-menu-item">
          <JzTrashIcon size={16} />
          <span>回收站</span>
        </Link>
        <Link to="/admin/profile" className="jz-user-menu-item">
          <JzSettingsIcon size={16} />
          <span>编辑头像</span>
        </Link>
        <button type="button" className="jz-user-menu-item" onClick={() => void handleLogout()}>
          <JzLogoutIcon size={16} />
          <span>退出登录</span>
        </button>
      </div>
    </div>
  );

  return (
    <Dropdown
      dropdownRender={() => panel}
      trigger={['click']}
      placement="bottomRight"
      arrow={{ pointAtCenter: true }}
    >
      <button
        type="button"
        className="jz-user-menu-trigger"
        aria-label={`账户菜单 · ${user.username}`}
      >
        <UserAvatar user={user} size={avatarSize} />
      </button>
    </Dropdown>
  );
}
