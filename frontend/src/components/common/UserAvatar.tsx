import { Avatar } from 'antd';
import { mediaUrl } from '@/utils/mediaUrl';

export function avatarLabel(username: string): string {
  const s = username.trim();
  if (!s) return '?';
  return s.length <= 2 ? s : s.slice(-2);
}

interface UserLike {
  username: string;
  avatar_url?: string | null;
}

interface Props {
  user: UserLike;
  size?: number;
  className?: string;
}

export default function UserAvatar({ user, size = 28, className }: Props) {
  const src = mediaUrl(user.avatar_url);
  return (
    <Avatar
      size={size}
      src={src}
      className={className}
      style={
        src
          ? undefined
          : {
              background: 'linear-gradient(135deg, var(--jz-accent) 0%, #06d6a0 100%)',
              fontSize: size <= 28 ? 12 : 14,
            }
      }
    >
      {!src ? avatarLabel(user.username) : null}
    </Avatar>
  );
}
