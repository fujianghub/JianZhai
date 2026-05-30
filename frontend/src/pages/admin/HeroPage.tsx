/**
 * /admin/hero — 首页题记设置（独立页面）。
 *
 * 在 v0.9.3 是 ProfilePage 的一个 Tab，v0.9.4 拆出来与「架构总览」、
 * 「个人资料」同级，方便从侧栏一键直达。实际控制面板仍复用
 * ``HeroSettingsPanel``，这里只负责加 AdminPageHeader + auth 守卫。
 */
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { useAuthStore } from '@/stores/auth';
import HeroSettingsPanel from './profile/HeroSettingsPanel';

export default function HeroPage() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  return (
    <div>
      <AdminPageHeader
        title="首页题记"
        backTo="/admin"
        backLabel="工作台"
      />
      <HeroSettingsPanel canEdit={!!user.is_staff} />
    </div>
  );
}
