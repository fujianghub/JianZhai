import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { AdjacentPosts, RelatedPost } from '@/api/blog';
import { Alert, Breadcrumb, Button, Result, Spin, Tooltip, Typography } from 'antd';
import { isAxiosError } from 'axios';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  BookOutlined,
  ClockCircleOutlined,
  EditOutlined,
  ExportOutlined,
  FolderOpenOutlined,
  HomeOutlined,
  TagOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import * as blogApi from '@/api/blog';
import * as kbsApi from '@/api/kbs';
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
import HtmlPostReader, { type HtmlReaderMeta } from '@/components/blog/HtmlPostReader';
import CodeBlockEnhancer from '@/components/common/CodeBlockEnhancer';
import { paperClassName, getReaderOverride, setReaderOverride } from '@/utils/paper';
import { resolveTagCssColor } from '@/utils/tagColor';
import { loadArticleFont, saveArticleFont, stackFor } from '@/utils/articleFont';
import { SelectionAI } from '@/components/common/SelectionAI';
import { DocAIPanel } from '@/components/common/DocAIPanel';
import ReadingProgressBar from '@/components/common/ReadingProgressBar';
import RelatedPostsSection from '@/components/blog/RelatedPostsSection';
import { applyPageMeta, resetPageMeta } from '@/utils/pageMeta';
import ColumnResizer from '@/components/common/ColumnResizer';
import { useColumnResize } from '@/hooks/useColumnResize';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const { Title, Text } = Typography;

const POST_KB_W = { min: 200, max: 480, default: 240, key: 'jz-post-kb-w' };
const POST_TOC_W = { min: 160, max: 400, default: 200, key: 'jz-post-toc-w' };

function postHref(postSlug: string, kb?: string) {
  const path = `/posts/${encodeURIComponent(postSlug)}`;
  return kb ? `${path}?kb=${encodeURIComponent(kb)}` : path;
}

function buildPostGridColumns(kbW: number, tocW: number, showKb: boolean, showToc: boolean): string {
  const main = 'minmax(0, 1fr)';
  const gap = '6px';
  if (showKb && showToc) {
    return `${kbW}px ${gap} ${main} ${gap} ${tocW}px`;
  }
  if (showKb) {
    return `${kbW}px ${gap} ${main}`;
  }
  if (showToc) {
    return `${main} ${gap} ${tocW}px`;
  }
  return main;
}

export default function PostDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const kbSlug = searchParams.get('kb') ?? undefined;
  const [post, setPost] = useState<PublicPostDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adjacent, setAdjacent] = useState<AdjacentPosts | null>(null);
  const [related, setRelated] = useState<RelatedPost[]>([]);
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
  const layoutRef = useRef<HTMLDivElement | null>(null);
  /** Iframe element of the HTML reader — kept as a ref for future hooks
   *  (e.g. analytics, scroll-spy) that may need to map between the iframe
   *  document and the parent page. */
  const htmlIframeRef = useRef<HTMLIFrameElement | null>(null);
  /** Meta reported by the iframe bootstrap (height + headings + plain text). */
  const [htmlMeta, setHtmlMeta] = useState<HtmlReaderMeta | null>(null);
  const layoutWide = useMediaQuery('(min-width: 1101px)');
  const tocRailWide = useMediaQuery('(min-width: 1281px)');

  const kbResize = useColumnResize({
    storageKey: POST_KB_W.key,
    min: POST_KB_W.min,
    max: POST_KB_W.max,
    defaultWidth: POST_KB_W.default,
    mode: 'fromLeft',
    containerRef: layoutRef,
  });

  const tocResize = useColumnResize({
    storageKey: POST_TOC_W.key,
    min: POST_TOC_W.min,
    max: POST_TOC_W.max,
    defaultWidth: POST_TOC_W.default,
    mode: 'fromRight',
    containerRef: layoutRef,
  });
  useEffect(() => {
    if (!authLoaded) void loadSession();
  }, [authLoaded, loadSession]);
  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => {
    if (!post || !authUser) {
      setCanEdit(false);
      return;
    }
    void kbsApi
      .getPublicKBTree(post.knowledge_base.slug)
      .then((t) => setCanEdit(!!t.can_manage))
      .catch(() => setCanEdit(false));
  }, [post, authUser]);
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
    setLoadError(null);
    setAdjacent(null);
    setRelated([]);
    setHtmlMeta(null);
    if (!slug) return;
    const kbParams = kbSlug ? { kb: kbSlug } : undefined;
    blogApi
      .getPublicPost(slug, kbParams)
      .then(setPost)
      .catch((err) => {
        if (isAxiosError(err) && err.response?.status === 404) {
          setNotFound(true);
        } else {
          setLoadError('加载失败，请稍后重试');
        }
      });
    blogApi.getAdjacentPosts(slug, kbParams).then(setAdjacent).catch(() => {/* ignore */});
    blogApi.getRelatedPosts(slug, kbParams).then(setRelated).catch(() => {/* ignore */});
  }, [slug, kbSlug]);

  useEffect(() => {
    if (!post) return;
    const path = postHref(post.slug, kbSlug ?? post.knowledge_base.slug);
    const excerpt = (post.published_content || '')
      .replace(/[#>*_`\[\]()!]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160);
    applyPageMeta({
      title: `${post.title} · 简斋`,
      description: excerpt || post.title,
      canonicalPath: path,
      ogType: 'article',
    });
    return () => resetPageMeta();
  }, [post, kbSlug]);

  const rendered = useMemo(
    () => (post ? renderMarkdownWithToc(post.published_content) : { html: '', toc: [] }),
    [post],
  );

  if (notFound) {
    return <Result status="404" title="未找到该文章" extra={<Link to="/">返回首页</Link>} />;
  }
  if (loadError) {
    return (
      <Result
        status="error"
        title={loadError}
        subTitle={slug ? `文章：${slug}` : undefined}
        extra={<Link to="/">返回首页</Link>}
      />
    );
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
  // HTML documents render via the in-flow ``HtmlPostReader`` (sandboxed iframe
  // auto-resized to its content) — they participate in TOC / word count just
  // like Markdown posts. Pure binary previews (PDF / DOCX / image) keep the
  // older "the file is the article" behaviour.
  const isHtmlDoc = post.doc_format === 'html';
  const htmlBody = isHtmlDoc ? post.published_content || '' : '';
  const binaryFormats = new Set(['pdf', 'docx', 'image']);
  const hasInlineFile =
    !!post.primary_attachment &&
    !isHtmlDoc &&
    (binaryFormats.has(post.doc_format) || !post.published_content || !post.published_content.trim());
  // Only echo the original file at the bottom when it's not redundant with
  // the inlined Markdown body (text files were already imported into the body).
  const showOriginalAtBottom =
    !!post.primary_attachment &&
    !hasInlineFile &&
    !isHtmlDoc &&
    !['md', 'text', 'html'].includes(previewKind(post.primary_attachment));

  // TOC content + active source depends on doc kind:
  //  * Markdown → headings extracted by the renderer at parse time.
  //  * HTML     → headings reported by the iframe bootstrap once it loads.
  // HTML articles share the Markdown reader's column-constrained layout (same
  // .paper wrapper, same meta strip, same KB rail). Only the TOC is dropped
  // because Tailwind / animation-driven HTML pages mostly carry their own
  // navigation already and a parent-page TOC adds noise.
  const htmlHasBuiltInNav = isHtmlDoc && !!htmlMeta?.hasBuiltInNav;
  const canShowToc = isHtmlDoc
    ? false
    : !hasInlineFile && rendered.toc.length > 0;
  const showToc = canShowToc && tocOpen;
  // Word-count / reading-time: MD reads from the persisted markdown source;
  // HTML reads the plain-text body the iframe reader extracts (same-origin
  // direct DOM read for src-mode, or postMessage for srcDoc fallback).
  const wcSource = isHtmlDoc ? htmlMeta?.plainText ?? '' : post.published_content ?? '';
  const showWordCount = isHtmlDoc
    ? !!htmlMeta?.plainText
    : !hasInlineFile && !!post.published_content;
  const htmlOriginalUrl = isHtmlDoc ? post.primary_attachment?.url ?? '' : '';
  const showKbRail = kbNavOpen && layoutWide;
  const showTocRail = showToc && tocRailWide;

  const postGridColumns = buildPostGridColumns(
    kbResize.width,
    tocResize.width,
    showKbRail,
    showTocRail,
  );

  const editHref = `/posts/${encodeURIComponent(post.slug)}/edit`;

  return (
    <div
      id="jz-post-layout"
      ref={layoutRef}
      className="jz-post-layout"
      data-doc-format={isHtmlDoc ? 'html' : post.doc_format}
      data-show-kb={showKbRail ? 'true' : 'false'}
      data-show-toc={showTocRail ? 'true' : 'false'}
      style={
        {
          ['--jz-post-accent' as string]: accent,
          ['--jz-doc-accent' as string]: accent,
          gridTemplateColumns: postGridColumns,
        } as CSSProperties
      }
    >
      <ReadingProgressBar />
      {showKbRail && (
        <aside className="jz-post-aside jz-post-aside-left">
          <KbNavSidebar
            kbSlug={post.knowledge_base.slug}
            currentSlug={post.slug}
            onClose={() => setKbNavOpen(false)}
          />
        </aside>
      )}

      {showKbRail && (
        <ColumnResizer
          dragging={kbResize.dragging}
          ariaLabel="拖拽调整左侧目录宽度（双击重置）"
          onMouseDown={kbResize.onResizerMouseDown}
          onDoubleClick={kbResize.onResizerDoubleClick}
          onKeyDown={kbResize.onResizerKeyDown}
        />
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
          style={{ ['--jz-article-font' as string]: stackFor(readerFont) } as CSSProperties}
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
              style={
                {
                  ['--jz-post-accent' as string]: accent,
                  ['--jz-doc-accent' as string]: accent,
                } as CSSProperties
              }
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

              {/* 字数 + 阅读时长 —— MD 读 published_content，HTML 读 iframe 上报的 plainText */}
              {showWordCount && (
                <>
                  <span className="jz-meta-sep" aria-hidden />
                  <Tooltip title="按中文 300 字/分钟、英文 200 词/分钟估算">
                    <span className="jz-meta-date" aria-label="字数与阅读时长">
                      {wordCount(wcSource).toLocaleString()} 字 · 约{' '}
                      {readingMinutes(wcSource)} 分钟
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
                          { ['--jz-tag-c' as string]: resolveTagCssColor(t) } as CSSProperties
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
                {/* HTML-only: link to the original .html attachment for
                    a true "browser tab" experience (some pages depend on
                    full viewport width or have richer scripts). */}
                {isHtmlDoc && htmlOriginalUrl && (
                  <Tooltip title="在新标签页打开原 HTML 文件（浏览器原生体验）">
                    <Button
                      size="small"
                      icon={<ExportOutlined />}
                      href={htmlOriginalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="jz-meta-edit-btn"
                    >
                      在新标签打开
                    </Button>
                  </Tooltip>
                )}
                {canEdit && (
                  <Tooltip title="在博客中编辑（保存后可返回阅读页）">
                    <Link to={editHref} style={{ textDecoration: 'none' }}>
                      <Button
                        size="small"
                        type="primary"
                        ghost
                        icon={<EditOutlined />}
                        className="jz-edit-btn jz-meta-edit-btn"
                      >
                        编辑
                      </Button>
                    </Link>
                  </Tooltip>
                )}
              </span>
            </div>
          </header>

          {isHtmlDoc && htmlHasBuiltInNav && (
            <Alert
              type="info"
              showIcon
              message="本文已包含文内目录；可使用页面内置导航或点右上角「在新标签打开」获得浏览器原生体验。"
              style={{ marginBottom: 12 }}
            />
          )}
          {isHtmlDoc && (htmlBody.trim() || htmlOriginalUrl) ? (
            // HTML 文档：优先用 <iframe src={attachment.url}> 走真实文档 URL，
            // 让相对路径资源 / Tailwind / JS 全部按浏览器原生方式加载；只有
            // 纯 raw_content（admin 新建模板）才走 srcDoc 兜底。
            <div className="paper-breakout">
              <HtmlPostReader
                html={htmlBody}
                title={post.title}
                iframeRef={htmlIframeRef}
                onMeta={setHtmlMeta}
                attachmentUrl={htmlOriginalUrl || undefined}
              />
            </div>
          ) : isHtmlDoc ? (
            <Alert
              type="info"
              showIcon
              message="该 HTML 文档暂无正文内容，请在后台编辑或重新发布。"
            />
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

          <RelatedPostsSection
            posts={related}
            kbSlug={kbSlug ?? post.knowledge_base.slug}
          />

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
                    to={postHref(
                      adjacent.prev.slug,
                      kbSlug ?? post.knowledge_base.slug,
                    )}
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
                    to={postHref(
                      adjacent.next.slug,
                      kbSlug ?? post.knowledge_base.slug,
                    )}
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

      {showTocRail && (
        <ColumnResizer
          dragging={tocResize.dragging}
          ariaLabel="拖拽调整右侧目录宽度（双击重置）"
          onMouseDown={tocResize.onResizerMouseDown}
          onDoubleClick={tocResize.onResizerDoubleClick}
          onKeyDown={tocResize.onResizerKeyDown}
        />
      )}

      {showTocRail && (
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
