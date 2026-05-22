import { useEffect } from 'react';
import { Spin } from 'antd';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';

interface Props {
  children: React.ReactNode;
  /** Where to send logged-in non-superusers (default `/`). */
  fallback?: string;
}

export default function RequireSuperuser({ children, fallback = '/' }: Props) {
  const { user, loaded, loadSession } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (!loaded) void loadSession();
  }, [loaded, loadSession]);

  if (!loaded) {
    return (
      <div style={{ minHeight: '40vh', display: 'grid', placeItems: 'center' }}>
        <Spin />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }
  if (!user.is_superuser) {
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}
