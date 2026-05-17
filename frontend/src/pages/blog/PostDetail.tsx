import { useEffect, useMemo, useState } from 'react';
import { Breadcrumb, Button, Result, Space, Spin, Tag, Tooltip, Typography } from 'antd';
import { Link, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { EditOutlined, FolderOpenOutlined, HomeOutlined, UnorderedListOutlined } from '@ant-design/icons';
import * as blogApi from '@/api/blog';
import type { PublicPostDetail } from '@/types';
import { renderMarkdownWithToc } from '@/utils/markdown';
import { previewKind } from '@/api/attachments';
import { useAuthStore } from '@/stores/auth';
import PaperPicker from '@/components/common/PaperPicker';
import PublicAttachmentPreview from '@/components/common/PublicAttachmentPreview';
import DocFormatTag from '@/components/common/DocFormatTag';
import KbNavSidebar from '@/components/common/KbNavSidebar';
import TocPanel from '@/components/common/TocPanel';
import { paperClassName, getReaderOverride, setReaderOverride } from '@/utils/paper';

const { Title, Text } = Typography;

export default function PostDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<PublicPostDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  /** Reader-side override; falls back to the doc's authored paper_style. */
  const [readerPaper, setReaderPaperState] = useState<string | null>(getReaderOverride());
  /** Auth status determines whether the inline edit button is offered. */
  const authUser = useAuthStore((s) => s.user);
  const authLoaded = useAuthStore((s) => s.loaded);
  const loadSession = useAuthStore((s) => s.loadSession);
  useEffect(() => {
    if (!authLoaded) void loadSession();
  }, [authLoaded, loadSession]);
  const canEdit = !!authUser?.is_staff;
  /** TOC visibility — persisted per browser, defaults to shown. */
  const [tocOpen, setTocOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('jz-toc-open') !== 'false';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('jz-toc-open', String(tocOpen));
    } catch {
      /* localStorage unavailable — fine, in-memory state still works */
    }
  }, [tocOpen]);

  /** KB document-list sidebar visibility — same persistence pattern as TOC. */
  const [kbNavOpen, setKbNavOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('jz-kbnav-open') !== 'false';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('jz-kbnav-open', String(kbNavOpen));
    } catch {
      /* localStorage unavailable — fine */
    }
  }, [kbNavOpen]);

  useEffect(() => {
    setPost(null);
    setNotFound(false);
    if (!slug) return;
    blogApi
      .getPublicPost(slug)
      .then(setPost)
      .catch(() => setNotFound(true));
  }, [slug]);

  const rendered = useMemo(
    () => (post ? renderMarkdownWithToc(post.published_content) : { html: '', toc: [] }),
    [post],
  );

  if (notFound) {
    return <Result status="404" title="未找到该文章" extra={<Link to="/">返回首页</Link>} />;
  }
  if (!post) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 300 }}>
        <Spin />
      </div>
    );
  }

  const effectivePaper = readerPaper ?? post.paper_style ?? '';
  const accent = post.knowledge_base.accent_color || 'var(--jz-accent)';
  // For binary-format docs (pdf/html/docx/image) the file IS the article — we
  // always render it inline, regardless of whether published_content has any
  // text content. Text formats (md/txt) inline into the body during import.
  const binaryFormats = new Set(['pdf', 'html', 'docx', 'image']);
  const hasInlineFile =
    !!post.primary_attachment &&
    (binaryFormats.has(post.doc_format) || !post.published_content || !post.published_content.trim());
  // Only echo the original file at the bottom when it's not redundant with
  // the inlined Markdown body (text files were already imported into the body).
  const showOriginalAtBottom =
    !!post.primary_attachment &&
    !hasInlineFile &&
    !['md', 'text', 'html'].includes(previewKind(post.primary_attachment));

  // TOC only makes sense for text content (md/text imports). Binary previews
  // — PDFs, HTML iframes — have no headings we can hook into.
  const canShowToc = !hasInlineFile && rendered.toc.length > 0;
  const showToc = canShowToc && tocOpen;

  /** Edit-button target: the admin editor, parameterised with a `return` URL
   * so the editor can offer a one-click jump back here after save/publish. */
  const editHref =
    `/admin/kbs/${post.knowledge_base.id}/docs/${post.id}` +
    `?return=${encodeURIComponent(`/posts/${post.slug}`)}`;

  return (
    <div
      className="jz-post-layout"
      data-show-kb={kbNavOpen ? 'true' : 'false'}
      data-show-toc={showToc ? 'true' : 'false'}
      style={{ ['--jz-post-accent' as string]: accent } as React.CSSProperties}
    >
      {kbNavOpen && (
        <aside className="jz-post-aside jz-post-aside-left">
          <KbNavSidebar
            kbSlug={post.knowledge_base.slug}
            currentSlug={post.slug}
            onClose={() => setKbNavOpen(false)}
          />
        </aside>
      )}

      <div className="jz-post-main">
        <Breadcrumb
          style={{ marginBottom: 12 }}
          items={[
            { title: <Link to="/"><HomeOutlined /> 首页</Link> },
            {
              title: (
                <Link to={`/kb/${encodeURIComponent(post.knowledge_base.slug)}`}>
                  {post.knowledge_base.name}
                </Link>
              ),
            },
            { title: post.title },
          ]}
        />

        <article className={`paper ${paperClassName(effectivePaper)} jz-fade-in`}>
          <header style={{ marginBottom: 12 }}>
            <Title level={1} style={{ marginTop: 0, marginBottom: 6, fontSize: 'clamp(1.6rem, 2.4vw, 2rem)' }}>
              {post.title}
            </Title>
            <Space split={<span style={{ opacity: 0.4 }}>·</span>} wrap>
              <Tag color={accent}>{post.knowledge_base.name}</Tag>
              <DocFormatTag format={post.doc_format} size="default" />
              <Text type="secondary">
                {dayjs(post.published_at).format('YYYY-MM-DD HH:mm')}
              </Text>
              {post.tags.length > 0 && (
                <Space wrap size={4}>
                  {post.tags.map((t) => (
                    <Tag key={t.id} color={t.color || 'blue'}>
                      {t.name}
                    </Tag>
                  ))}
                </Space>
              )}
              <PaperPicker
                value={effectivePaper}
                onChange={(k) => {
                  setReaderPaperState(k);
                  setReaderOverride(k);
                }}
              />
              {canEdit && (
                <Tooltip title="打开完整编辑器（保存后可一键回到博客视图）">
                  <Link to={editHref} style={{ textDecoration: 'none' }}>
                    <Button size="small" type="primary" ghost icon={<EditOutlined />}>
                      编辑
                    </Button>
                  </Link>
                </Tooltip>
              )}
            </Space>
          </header>

          {hasInlineFile && post.primary_attachment ? (
            <div className="paper-breakout">
              <PublicAttachmentPreview att={post.primary_attachment} />
            </div>
          ) : (
            <div
              className="markdown-preview"
              style={{ lineHeight: 1.85, fontSize: 16 }}
              dangerouslySetInnerHTML={{ __html: rendered.html }}
            />
          )}

          {/* Expose binary originals (PDF / DOCX / image) at the bottom. Text imports
              are already inlined in the body, so we skip them to avoid duplication. */}
          {showOriginalAtBottom && post.primary_attachment && (
            <div style={{ marginTop: 32 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>原文件</Text>
              <div style={{ marginTop: 8 }}>
                <PublicAttachmentPreview att={post.primary_attachment} />
              </div>
            </div>
          )}
        </article>
      </div>

      {showToc && (
        <aside className="jz-post-aside jz-post-aside-right">
          <TocPanel toc={rendered.toc} onClose={() => setTocOpen(false)} />
        </aside>
      )}

      {canShowToc && !tocOpen && (
        <Tooltip title="显示目录" placement="left">
          <Button
            type="default"
            shape="circle"
            size="large"
            icon={<UnorderedListOutlined />}
            aria-label="显示目录"
            onClick={() => setTocOpen(true)}
            className="jz-toc-fab"
          />
        </Tooltip>
      )}

      {!kbNavOpen && (
        <Tooltip title="显示文档列表" placement="right">
          <Button
            type="default"
            shape="circle"
            size="large"
            icon={<FolderOpenOutlined />}
            aria-label="显示文档列表"
            onClick={() => setKbNavOpen(true)}
            className="jz-kbnav-fab"
          />
        </Tooltip>
      )}
    </div>
  );
}
