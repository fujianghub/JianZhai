import { useEffect } from 'react';
import { Spin } from 'antd';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loaded, loadSession } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (!loaded) void loadSession();
  }, [loaded, loadSession]);

  if (!loaded) {
    return (
      <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
        <Spin />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
