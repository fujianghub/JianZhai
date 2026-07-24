import { useEffect, useState } from 'react';
import { Button, Result, Spin } from 'antd';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { getDocument } from '@/api/docs';
import { resolvePublicById } from '@/api/linking';
import { useAuthStore } from '@/stores/auth';
import { postReadHref } from '@/utils/docLinks';

type Resolution =
  | { kind: 'admin'; kbId: number; docId: number }
  | { kind: 'public'; href: string }
  | { kind: 'notfound' }
  | null;

/**
 * Resolves /d/:id @-mention links:
 * - Published public doc → blog read /posts/<slug>
 * - Authenticated owner (draft/private) → /admin/kbs/<kbId>?doc=<id>
 * - Otherwise → 404
 */
export default function DocLinkResolver() {
  const { id } = useParams<{ id: string }>();
  const { user, loaded, loadSession, requireLogin } = useAuthStore();
  const location = useLocation();
  const [resolution, setResolution] = useState<Resolution>(null);

  useEffect(() => {
    if (!loaded) void loadSession();
  }, [loaded, loadSession]);

  useEffect(() => {
    if (!loaded || !id) return;
    const docId = Number(id);
    let cancelled = false;

    async function resolve() {
      try {
        const pub = await resolvePublicById(docId);
        if (!cancelled) {
          setResolution({ kind: 'public', href: postReadHref(pub.slug) });
          return;
        }
      } catch {
        /* not a published public post */
      }
      if (user) {
        try {
          const doc = await getDocument(docId);
          if (!cancelled) {
            setResolution({ kind: 'admin', kbId: doc.knowledge_base, docId: doc.id });
            return;
          }
        } catch {
          /* fall through */
        }
      }
      if (!cancelled) setResolution({ kind: 'notfound' });
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [loaded, user, id]);

  // Friends-only mode (SITE_REQUIRE_LOGIN): /d/:id lives outside BlogLayout,
  // so bounce anonymous visitors to the login page just like BlogLayout does.
  if (loaded && requireLogin && !user) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }
  if (!loaded || resolution === null) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <Spin tip="正在解析链接…">
          <div style={{ width: 120, height: 60 }} />
        </Spin>
      </div>
    );
  }
  if (resolution.kind === 'admin') {
    return <Navigate to={`/admin/kbs/${resolution.kbId}?doc=${resolution.docId}`} replace />;
  }
  if (resolution.kind === 'public') {
    return <Navigate to={resolution.href} replace />;
  }
  // /d/:id lives outside BlogLayout — without an explicit way home this is a
  // chrome-less dead end for readers following a stale @-mention link.
  return (
    <Result
      status="404"
      title="链接的文档不存在，或你暂时无法查看"
      extra={
        <Link to="/">
          <Button type="primary">返回首页</Button>
        </Link>
      }
    />
  );
}
