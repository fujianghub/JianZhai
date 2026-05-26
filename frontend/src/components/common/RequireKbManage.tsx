import { useEffect, useState } from 'react';
import { Spin } from 'antd';
import { Navigate } from 'react-router-dom';
import * as kbsApi from '@/api/kbs';
import { useAuthStore } from '@/stores/auth';
import RequireAuth from '@/pages/admin/RequireAuth';

interface Props {
  kbSlug: string;
  children: React.ReactNode;
  fallback?: string;
}

/** Requires login + ``can_manage`` on the given public KB (owner / staff). */
export default function RequireKbManage({ kbSlug, children, fallback = '/' }: Props) {
  const user = useAuthStore((s) => s.user);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setAllowed(false);
      return;
    }
    let cancelled = false;
    void kbsApi
      .getPublicKBTree(kbSlug)
      .then((t) => {
        if (!cancelled) setAllowed(!!t.can_manage);
      })
      .catch(() => {
        if (!cancelled) setAllowed(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kbSlug, user]);

  if (allowed === null) {
    return (
      <div style={{ minHeight: '40vh', display: 'grid', placeItems: 'center' }}>
        <Spin />
      </div>
    );
  }
  if (!allowed) {
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}

/** Login gate + KB manage gate (slug known after post load). */
export function RequireAuthKbManage({ kbSlug, children, fallback }: Props) {
  return (
    <RequireAuth>
      <RequireKbManage kbSlug={kbSlug} fallback={fallback}>
        {children}
      </RequireKbManage>
    </RequireAuth>
  );
}
