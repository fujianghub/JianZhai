import { useEffect, useMemo, useRef, useState } from 'react';
import type { AdjacentPosts } from '@/api/blog';
import { Breadcrumb, Button, Result, Spin, Tooltip, Typography } from 'antd';
import { Link, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  BookOutlined,
  ClockCircleOutlined,
  EditOutlined,
  FolderOpenOutlined,
  HomeOutlined,
  TagOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import * as blogApi from '@/api/blog';
import type { PublicPostDetail } from '@/types';
import { readingMinutes, renderMarkdownWithToc, wordCount } from '@/utils/markdown';
import { previewKind } from '@/api/attachments';
import { useAuthStore } from '@/stores/auth';
import PaperPicker from '@/components/common/PaperPicker';
import ReaderFontPicker from '@/components/common/ReaderFontPicker';
import PublicAttachmentPreview from '@/components/common/PublicAttachmentPreview';
import DocFormatTag from '@/components/common/DocFormatTag';
import KbNavSidebar from '@/components/common/KbNavSidebar';
import TocPanel from '@/components/common/TocPanel';
import CodeBlockEnhancer from '@/components/common/CodeBlockEnhancer';
import { paperClassName, getReaderOverride, setReaderOverride } from '@/utils/paper';
import { loadArticleFont, saveArticleFont, stackFor } from '@/utils/articleFont';
import { SelectionAI } from '@/components/common/SelectionAI';
import { DocAIPanel } from '@/components/common/DocAIPanel';

const { Title, Text } = Typography;

export default function PostDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<PublicPostDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [adjacent, setAdjacent] = useState<AdjacentPosts | null>(null);
  /** Reader-side override; falls back to the doc's authored paper_style. */
  const [readerPaper, setReaderPaperState] = useState<string | null>(getReaderOverride());
  /** Reader-controlled article body font (default: Verdana). Persisted via
   *  ``saveArticleFont``; the picked stack is applied as a CSS variable on
   *  the article element so it scopes only to this reader's view. */
  const [readerFont, setReaderFont] = useState<string>(loadArticleFont());
  /** Auth status determines whether the inline edit button is offered. */
  const authUser = useAuthStore((s) => s.user);
  const authLoaded = useAuthStore((s) => s.loaded);
  const loadSession = useAuthStore((s) => s.loadSession);
  const articleRef = useRef<HTMLDivElement | null>(null);
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
    setAdjacent(null);
    if (!slug) return;
    blogApi
      .getPublicPost(slug)
      .then(setPost)
      .catch(() => setNotFound(true));
    blogApi.getAdjacentPosts(slug).then(setAdjacent).catch(() => {/* ignore */});
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
      <ReadingProgressBar />
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

        <article
          ref={articleRef}
          className={`paper ${paperClassName(effectivePaper)} jz-fade-in`}
          style={{ ['--jz-article-font' as string]: stackFor(readerFont) } as React.CSSProperties}
        >
          <header className="jz-post-header" style={{ marginBottom: 12 }}>
            <Title
              level={1}
              className="jz-post-title"
              style={{
                marginTop: 0,
                marginBottom: 6,
                fontSize: 'clamp(1.6rem, 2.4vw, 2rem)',
                color: 'var(--jz-text)',
              }}
            >
              {post.title}
            </Title>
            <div
              className="jz-post-meta"
              style={{ ['--jz-post-accent' as string]: accent } as React.CSSProperties}
            >
              {/* KB + format — these belong together: "knowledge base · document type". */}
              <Link
                to={`/kb/${encodeURIComponent(post.knowledge_base.slug)}`}
                className="jz-meta-pill jz-meta-pill-kb"
                aria-label={`知识库 ${post.knowledge_base.name}`}
                title={`返回知识库 · ${post.knowledge_base.name}`}
              >
                <BookOutlined className="jz-meta-icon" />
                <span className="jz-meta-pill-text">{post.knowledge_base.name}</span>
              </Link>
              <span className="jz-meta-format" aria-label={`文档格式 ${post.doc_format}`}>
                <DocFormatTag format={post.doc_format} size="default" />
              </span>

              <span className="jz-meta-sep" aria-hidden />

              {/* Date — read-only, ghost style with clock icon. */}
              <span className="jz-meta-date" title="发布时间">
                <ClockCircleOutlined className="jz-meta-icon" />
                <time dateTime={post.published_at}>
                  {dayjs(post.published_at).format('YYYY-MM-DD HH:mm')}
                </time>
              </span>

              {/* 字数 + 阅读时长 —— 仅对文字类内容显示（二进制 PDF/HTML/DOCX 走自己的预览） */}
              {!hasInlineFile && post.published_content && (
                <>
                  <span className="jz-meta-sep" aria-hidden />
                  <Tooltip title="按中文 300 字/分钟、英文 200 词/分钟估算">
                    <span className="jz-meta-date" aria-label="字数与阅读时长">
                      {wordCount(post.published_content).toLocaleString()} 字 · 约{' '}
                      {readingMinutes(post.published_content)} 分钟
                    </span>
                  </Tooltip>
                </>
              )}

              {/* User tags — fall back to muted neutral if no per-tag colour set. */}
              {post.tags.length > 0 && (
                <>
                  <span className="jz-meta-sep" aria-hidden />
                  <span className="jz-meta-tags" aria-label="文章标签">
                    <TagOutlined className="jz-meta-icon" />
                    {post.tags.map((t) => (
                      <span
                        key={t.id}
                        className="jz-meta-tag"
                        style={
                          t.color
                            ? ({ ['--jz-tag-c' as string]: t.color } as React.CSSProperties)
                            : undefined
                        }
                      >
                        {t.name}
                      </span>
                    ))}
                  </span>
                </>
              )}

              <span className="jz-meta-spacer" />

              {/* Right-aligned controls. */}
              <span className="jz-meta-controls">
                <ReaderFontPicker
                  value={readerFont}
                  onChange={(k) => {
                    setReaderFont(k);
                    saveArticleFont(k);
                  }}
                />
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
                      <Button
                        size="small"
                        type="primary"
                        ghost
                        icon={<EditOutlined />}
                        className="jz-edit-btn"
                      >
                        编辑
                      </Button>
                    </Link>
                  </Tooltip>
                )}
              </span>
            </div>
          </header>

          {post.doc_format === 'html' && post.published_content?.trim() ? (
            // HTML 文档已经把正文存进 published_content：直接 srcdoc 渲染，避免
            // 走附件 iframe（绕过 Django 的编码 / X-Frame-Options 兼容问题）。
            <div className="paper-breakout">
              <iframe
                title={post.title}
                srcDoc={post.published_content}
                sandbox="allow-scripts allow-popups allow-forms"
                style={{
                  width: '100%',
                  height: 'min(calc(100vh - 240px), 1080px)',
                  minHeight: 600,
                  border: '1px solid var(--jz-border)',
                  borderRadius: 8,
                  background: '#fff',
                }}
              />
            </div>
          ) : hasInlineFile && post.primary_attachment ? (
            <div className="paper-breakout">
              <PublicAttachmentPreview att={post.primary_attachment} />
            </div>
          ) : (
            <div
              className="markdown-preview jz-post-article"
              style={{ lineHeight: 1.85, fontSize: 16 }}
              dangerouslySetInnerHTML={{ __html: rendered.html }}
            />
          )}
          <CodeBlockEnhancer selector=".jz-post-article" bindKey={rendered.html} />

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

          {adjacent && (adjacent.prev || adjacent.next) && (
            <nav className="jz-post-nav" aria-label="前后文章导航" style={{ marginTop: 48 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: adjacent.prev && adjacent.next ? '1fr 1fr' : '1fr',
                  gap: 16,
                  borderTop: '1px solid var(--jz-border)',
                  paddingTop: 24,
                }}
              >
                {adjacent.prev && (
                  <Link
                    to={`/posts/${encodeURIComponent(adjacent.prev.slug)}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <div
                      style={{
                        padding: '12px 16px',
                        border: '1px solid var(--jz-border)',
                        borderRadius: 8,
                        transition: 'border-color 0.15s, background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--jz-accent)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--jz-border)')}
                    >
                      <div style={{ fontSize: 11, color: 'var(--jz-text-muted)', marginBottom: 4 }}>← 上一篇</div>
                      <div style={{ fontWeight: 500, color: 'var(--jz-text)', lineHeight: 1.4 }}>{adjacent.prev.title}</div>
                    </div>
                  </Link>
                )}
                {adjacent.next && (
                  <Link
                    to={`/posts/${encodeURIComponent(adjacent.next.slug)}`}
                    style={{ textDecoration: 'none', gridColumn: adjacent.prev ? 'auto' : '1 / -1' }}
                  >
                    <div
                      style={{
                        padding: '12px 16px',
                        border: '1px solid var(--jz-border)',
                        borderRadius: 8,
                        textAlign: 'right',
                        transition: 'border-color 0.15s, background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--jz-accent)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--jz-border)')}
                    >
                      <div style={{ fontSize: 11, color: 'var(--jz-text-muted)', marginBottom: 4 }}>下一篇 →</div>
                      <div style={{ fontWeight: 500, color: 'var(--jz-text)', lineHeight: 1.4 }}>{adjacent.next.title}</div>
                    </div>
                  </Link>
                )}
              </div>
            </nav>
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
      {/* Selection-driven AI helper — only for authenticated readers so we
          don't burn API tokens on anonymous traffic. */}
      {authUser && (
        <>
          <SelectionAI
            scopeRef={articleRef}
            contextProvider={() => post?.published_content || ''}
          />
          <DocAIPanel content={post?.published_content || ''} title={post?.title} />
        </>
      )}
    </div>
  );
}

/**
 * 顶部细条阅读进度指示：监听窗口滚动，进度 = scrollTop / (scrollHeight - viewportHeight)。
 * 固定贴在视口顶部 2px 高，accent 色，不抢视线。Reading 状态时（仍在顶部）宽度为 0。
 */
function ReadingProgressBar() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    function update() {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      if (scrollable <= 0) {
        setPct(0);
        return;
      }
      const p = Math.max(0, Math.min(1, doc.scrollTop / scrollable));
      setPct(p);
    }
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        height: 3,
        width: `${pct * 100}%`,
        background: 'var(--jz-accent)',
        transition: 'width 100ms linear',
        zIndex: 100,
        pointerEvents: 'none',
      }}
    />
  );
}
