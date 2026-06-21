import { useEffect } from 'react';
import { Spin } from 'antd';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';

interface Props {
  children: React.ReactNode;
  /** Where to send logged-in non-authors (normal users). They are readers,
   *  so the favorites page is their home in the backend shell. */
  fallback?: string;
}

/** Gate authoring surfaces (KB/doc CRUD, AI, exports, trash, …) to the author
 *  tier (admin + root = `is_staff`). Anonymous → login; logged-in readers →
 *  fallback (favorites), never the login screen. */
export default function RequireAuthor({ children, fallback = '/admin/favorites' }: Props) {
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
  if (!user.is_staff) {
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}
