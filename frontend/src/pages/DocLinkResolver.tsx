import { useEffect, useState } from 'react';
import { Result, Spin } from 'antd';
import { Navigate, useParams } from 'react-router-dom';
import { getDocument } from '@/api/docs';
import { resolvePublicById } from '@/api/linking';
import { useAuthStore } from '@/stores/auth';

type Resolution =
  | { kind: 'admin'; kbId: number; docId: number }
  | { kind: 'public'; slug: string }
  | { kind: 'notfound' }
  | null;

/**
 * Resolves /d/:id @-mention links to the correct destination:
 * - Authenticated owner → /admin/kbs/<kbId>?doc=<id>
 * - Public published doc → /posts/<slug>
 * - Otherwise → 404
 */
export default function DocLinkResolver() {
  const { id } = useParams<{ id: string }>();
  const { user, loaded, loadSession } = useAuthStore();
  const [resolution, setResolution] = useState<Resolution>(null);

  useEffect(() => {
    if (!loaded) void loadSession();
  }, [loaded, loadSession]);

  useEffect(() => {
    if (!loaded || !id) return;
    const docId = Number(id);
    let cancelled = false;

    async function resolve() {
      if (user) {
        try {
          const doc = await getDocument(docId);
          if (!cancelled) {
            setResolution({ kind: 'admin', kbId: doc.knowledge_base, docId: doc.id });
            return;
          }
        } catch {
          // fall through to public resolution
        }
      }
      try {
        const pub = await resolvePublicById(docId);
        if (!cancelled) setResolution({ kind: 'public', slug: pub.slug });
      } catch {
        if (!cancelled) setResolution({ kind: 'notfound' });
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [loaded, user, id]);

  if (!loaded || resolution === null) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <Spin />
      </div>
    );
  }
  if (resolution.kind === 'admin') {
    return <Navigate to={`/admin/kbs/${resolution.kbId}?doc=${resolution.docId}`} replace />;
  }
  if (resolution.kind === 'public') {
    return <Navigate to={`/posts/${encodeURIComponent(resolution.slug)}`} replace />;
  }
  return <Result status="404" title="链接的文档不存在或未公开" />;
}
