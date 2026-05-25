import { Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import type { RelatedPost } from '@/api/blog';
import { postReadHref } from '@/utils/docLinks';

const { Title } = Typography;

const REASON_LABEL: Record<RelatedPost['reason'], string> = {
  tag: '同标签',
  backlink: '反向链接',
  mention: '文中引用',
};

interface Props {
  posts: RelatedPost[];
  kbSlug?: string;
}

export default function RelatedPostsSection({ posts, kbSlug }: Props) {
  if (posts.length === 0) return null;

  return (
    <nav className="jz-related-posts" aria-label="相关文章">
      <Title level={5} className="jz-related-posts-title">
        相关文章
      </Title>
      <ul className="jz-related-posts-list">
        {posts.map((p) => (
          <li key={p.id}>
            <Link
              to={postReadHref(p.slug, kbSlug ?? p.knowledge_base.slug)}
              className="jz-related-posts-link"
            >
              <span className="jz-related-posts-item-title">{p.title}</span>
              <Tag className="jz-related-posts-reason">{REASON_LABEL[p.reason]}</Tag>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
