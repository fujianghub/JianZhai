import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Result, Spin } from 'antd';
import * as blogApi from '@/api/blog';
import type { PublicPostDetail } from '@/types';
import DocEditorPage from '@/pages/admin/DocEditorPage';
import { RequireAuthKbManage } from '@/components/common/RequireKbManage';

/** Route entry: auth + KB manage gate + slug resolution + editor. */
export function PostEditRoute() {
  const { slug } = useParams<{ slug: string }>();
  const fallback = slug ? `/posts/${encodeURIComponent(slug)}` : '/';
  return <PostEditPage fallback={fallback} />;
}

/** Resolves a public post slug and mounts the shared doc editor in blog shell. */
function PostEditPage({ fallback }: { fallback: string }) {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<PublicPostDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setPost(null);
    setNotFound(false);
    blogApi
      .getPublicPost(slug)
      .then(setPost)
      .catch(() => setNotFound(true));
  }, [slug]);

  if (!slug) {
    return <Result status="404" title="无效的文章地址" extra={<Link to="/">返回首页</Link>} />;
  }

  if (notFound) {
    return (
      <Result status="404" title="未找到该文章" extra={<Link to="/">返回首页</Link>} />
    );
  }

  if (!post) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 300 }}>
        <Spin />
      </div>
    );
  }

  const returnTo = `/posts/${encodeURIComponent(post.slug)}`;

  return (
    <RequireAuthKbManage kbSlug={post.knowledge_base.slug} fallback={fallback}>
      <DocEditorPage
        kbIdOverride={post.knowledge_base.id}
        docIdOverride={post.id}
        returnToOverride={returnTo}
        shell="blog"
      />
    </RequireAuthKbManage>
  );
}

export default PostEditRoute;
