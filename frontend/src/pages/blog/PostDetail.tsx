import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { AdjacentPosts, RelatedPost } from '@/api/blog';
import { Alert, Breadcrumb, Button, Result, Spin, Tag, Tooltip, Typography } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { isAxiosError } from 'axios';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
/* 自制 SF 分层系列；小尺寸（13-14px）用 strokeWidth=2 做笔画补偿 */
import {
  JzBookIcon,
  JzClockIcon,
  JzComposeIcon,
  JzEditIcon,
  JzExportIcon,
  JzFolderOpenIcon,
  JzHomeIcon,
  JzOutlineIcon,
  JzTagIcon,
} from '@/components/common/JzIcon';
import * as blogApi from '@/api/blog';
import * as docsApi from '@/api/docs';
import * as kbsApi from '@/api/kbs';
import { message } from '@/utils/notify';
import type { DocumentDetail, PublicPostDetail } from '@/types';
import { patchDocumentTitle } from '@/utils/documentSave';
import { resolvePostPrimaryUrl } from '@/components/blog/postPrimaryUrl';
// Lazy: the inline editor pulls the Tiptap/CodeMirror stack (~0.8MB). Readers
// only load it when they actually switch a post into edit mode.
const PostInlineEditor = lazy(() => import('@/components/blog/PostInlineEditor'));
import type { EditorSaveHandle } from '@/components/editor/editorSaveLifecycle';
import { readingMinutes, renderMarkdownWithToc, wordCount } from '@/utils/markdown';
import { previewKind } from '@/api/attachments';
import { useAuthStore } from '@/stores/auth';
import PaperPicker from '@/components/common/PaperPicker';
import ReaderFontPicker from '@/components/common/ReaderFontPicker';
import ReaderLayoutPicker from '@/components/common/ReaderLayoutPicker';
import PublicAttachmentPreview from '@/components/common/PublicAttachmentPreview';
import LazyPptxReader from '@/components/common/LazyPptxReader';
import DocFormatTag from '@/components/common/DocFormatTag';
import KbNavSidebar from '@/components/common/KbNavSidebar';
import TocPanel from '@/components/common/TocPanel';
import HtmlPostReader, { type HtmlReaderMeta } from '@/components/blog/HtmlPostReader';
import CodeBlockEnhancer from '@/components/common/CodeBlockEnhancer';
import TableEnhancer from '@/components/common/TableEnhancer';
import { paperClassName, getReaderOverride, setReaderOverride } from '@/utils/paper';
import { resolveTagCssColor } from '@/utils/tagColor';
import {
  ARTICLE_FONT_PRESETS,
  loadArticleFont,
  saveArticleFont,
  stackFor,
} from '@/utils/articleFont';
import {
  clearReaderLayout,
  DEFAULT_LAYOUT,
  loadReaderLayout,
  saveReaderLayout,
  type ReaderLayout,
} from '@/utils/readerLayout';
// Lazy: the AI helpers (selection popover + doc panel) are overlay UI that
// idles until the reader interacts, so keep them off the initial reader chunk.
const SelectionAI = lazy(() =>
  import('@/components/common/SelectionAI').then((m) => ({ default: m.SelectionAI })),
);
const DocAIPanel = lazy(() =>
  import('@/components/common/DocAIPanel').then((m) => ({ default: m.DocAIPanel })),
);
import ReadingProgressBar from '@/components/common/ReadingProgressBar';
import RelatedPostsSection from '@/components/blog/RelatedPostsSection';
import { applyPageMeta, resetPageMeta } from '@/utils/pageMeta';
import ColumnResizer from '@/components/common/ColumnResizer';
import { useColumnResize } from '@/hooks/useColumnResize';
import { useFootnoteHover } from '@/hooks/useFootnoteHover';
import { useImageLightbox } from '@/hooks/useImageLightbox';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const { Title, Text } = Typography;

const POST_KB_W = { min: 200, max: 480, default: 240, key: 'jz-post-kb-w' };
const POST_TOC_W = { min: 160, max: 400, default: 200, key: 'jz-post-toc-w' };

type PostPageMode = 'read' | 'edit';

function postHref(postSlug: string, kb?: string) {
  const path = `/posts/${encodeURIComponent(postSlug)}`;
  return kb ? `${path}?kb=${encodeURIComponent(kb)}` : path;
}

/* ------------------------------------------------------------------ *
 *  Session-scoped LRU cache for already-fetched posts.
 *
 *  Why: clicking back from a /posts/foo deep link, or hopping between
 *  prev/next via the adjacency nav, re-fetches the full document each
 *  time even though the server response hasn't changed inside the same
 *  reading session. We keep the last few posts (~10) and a 5-minute TTL
 *  in sessionStorage so revisits paint instantly without any markdown
 *  re-parse / iframe re-mount delay.
 *
 *  The cache is per-tab (sessionStorage) and skipped when the storage
 *  API throws (private windows). The TTL guards against a stale post
 *  that was edited in another tab; freshness still wins because we issue
 *  a background fetch and replace the cached snapshot when it returns.
 * ------------------------------------------------------------------ */
const POST_CACHE_TTL_MS = 5 * 60 * 1000;
const POST_CACHE_KEY = 'jz-post-cache-v1';
const POST_CACHE_MAX = 10;

interface PostCacheEntry {
  ts: number;
  data: PublicPostDetail;
}

function postCacheKey(slug: string, kb?: string): string {
  return kb ? `${kb}::${slug}` : `__::${slug}`;
}

function readPostCache(slug: string, kb?: string): PublicPostDetail | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(POST_CACHE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, PostCacheEntry>;
    const hit = map[postCacheKey(slug, kb)];
    if (!hit) return null;
    if (Date.now() - hit.ts > POST_CACHE_TTL_MS) return null;
    return hit.data;
  } catch {
    return null;
  }
}

function writePostCache(slug: string, kb: string | undefined, data: PublicPostDetail): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(POST_CACHE_KEY);
    const map = (raw ? (JSON.parse(raw) as Record<string, PostCacheEntry>) : {});
    map[postCacheKey(slug, kb)] = { ts: Date.now(), data };
    // Evict oldest if over capacity. Order is preserved by JSON object key
    // insertion in modern engines, but we sort by ts to be defensive.
    const keys = Object.keys(map);
    if (keys.length > POST_CACHE_MAX) {
      const sorted = keys
        .map((k) => [k, map[k]!.ts] as const)
        .sort((a, b) => a[1] - b[1])
        .slice(0, keys.length - POST_CACHE_MAX)
        .map(([k]) => k);
      for (const k of sorted) delete map[k];
    }
    sessionStorage.setItem(POST_CACHE_KEY, JSON.stringify(map));
  } catch {
    /* storage full or disabled — silently skip caching */
  }
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
  /** Reader-controlled body layout (font scale / line-height / measure).
   *  Applied as CSS variables on the article; persisted via ``saveReaderLayout``. */
  const [layout, setLayout] = useState<ReaderLayout>(loadReaderLayout());
  /** Distraction-free reading: hides site header/footer + KB/TOC rails. */
  const [focusMode, setFocusMode] = useState(false);
  /** Auth status determines whether the inline edit button is offered. */
  const authUser = useAuthStore((s) => s.user);
  const authLoaded = useAuthStore((s) => s.loaded);
  const loadSession = useAuthStore((s) => s.loadSession);
  const articleRef = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  // Hover previews for footnote refs + click-to-zoom on inline images. Both
  // wire DOM event delegation onto the rendered post container — no React
  // overhead in the dangerouslySetInnerHTML tree.
  useFootnoteHover(articleRef);
  useImageLightbox(articleRef);
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
  const [pageMode, setPageMode] = useState<PostPageMode>('read');
  const [editDoc, setEditDoc] = useState<DocumentDetail | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [conflictSyncRevision, setConflictSyncRevision] = useState(0);
  const editorSaveRef = useRef<EditorSaveHandle | null>(null);

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

  const registerEditorSave = useCallback((handle: EditorSaveHandle | null) => {
    editorSaveRef.current = handle;
  }, []);

  const updateLayout = useCallback((next: ReaderLayout) => {
    setLayout(next);
    saveReaderLayout(next);
  }, []);

  /** Reset every reader-side preference (layout + paper override + body font). */
  const resetReaderPrefs = useCallback(() => {
    setLayout({ ...DEFAULT_LAYOUT });
    clearReaderLayout();
    setReaderPaperState(null);
    setReaderOverride(null);
    const defaultFont = ARTICLE_FONT_PRESETS[0].key;
    setReaderFont(defaultFont);
    saveArticleFont(defaultFont);
  }, []);

  // Focus mode toggles a body class the stylesheet keys off (hides chrome) and
  // is dismissible via Esc. Reset whenever we leave the article entirely.
  useEffect(() => {
    if (focusMode) document.body.classList.add('jz-reader-focus');
    else document.body.classList.remove('jz-reader-focus');
    return () => document.body.classList.remove('jz-reader-focus');
  }, [focusMode]);

  useEffect(() => {
    if (!focusMode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setFocusMode(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusMode]);

  const enterEditMode = useCallback(async () => {
    if (!post || !canEdit) return;
    setEditLoading(true);
    try {
      const d = await docsApi.getDocument(post.id);
      setEditDoc(d);
      setPageMode('edit');
    } catch {
      message.error('无法加载编辑内容');
    } finally {
      setEditLoading(false);
    }
  }, [post, canEdit]);

  const exitEditMode = useCallback(async () => {
    if (!post) return;
    try {
      await editorSaveRef.current?.saveNow();
    } catch {
      /* saveNow surfaces errors; still return to read */
    }
    const kbParams = kbSlug ? { kb: kbSlug } : undefined;
    try {
      const fresh = await blogApi.getPublicPost(post.slug, kbParams);
      setPost(fresh);
    } catch {
      /* keep previous post snapshot */
    }
    setPageMode('read');
    setEditDoc(null);
  }, [post, kbSlug]);

  useEffect(() => {
    setPageMode('read');
    setEditDoc(null);
    setFocusMode(false);
  }, [slug, kbSlug]);

  useEffect(() => {
    if (pageMode === 'edit') {
      document.body.classList.add('jz-post-inline-edit');
    } else {
      document.body.classList.remove('jz-post-inline-edit');
    }
    return () => document.body.classList.remove('jz-post-inline-edit');
  }, [pageMode]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (pageMode === 'edit' && e.key === 'Escape') {
        e.preventDefault();
        void exitEditMode();
        return;
      }

      if (pageMode !== 'read' || !canEdit) return;

      const isE = e.key === 'e' || e.key === 'E';
      if (isE && !e.metaKey && !e.ctrlKey && !e.altKey && !inField) {
        e.preventDefault();
        void enterEditMode();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && isE) {
        e.preventDefault();
        void enterEditMode();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pageMode, canEdit, enterEditMode, exitEditMode]);
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
    // Optimistic cache read: if we've fetched this post in the last 5 minutes
    // within the same tab, paint the cached snapshot immediately so the
    // article is interactive on the very next frame; the background fetch
    // still runs and replaces the snapshot with a fresh server response
    // before the user notices.
    const cached = slug ? readPostCache(slug, kbSlug) : null;
    if (cached) {
      setPost(cached);
      setNotFound(false);
      setLoadError(null);
    } else {
      setPost(null);
      setNotFound(false);
      setLoadError(null);
    }
    // Adjacent/related don't share the cache — they're cheap and stale data
    // here is jarring (a prev/next button to a renamed post would feel wrong).
    setAdjacent(null);
    setRelated([]);
    setHtmlMeta(null);
    if (!slug) return;
    const kbParams = kbSlug ? { kb: kbSlug } : undefined;
    blogApi
      .getPublicPost(slug, kbParams)
      .then((p) => {
        setPost(p);
        writePostCache(slug, kbSlug, p);
      })
      .catch((err) => {
        if (isAxiosError(err) && err.response?.status === 404) {
          setNotFound(true);
        } else if (!cached) {
          // Only surface the error UI if we don't already have a usable
          // cached snapshot — otherwise the user keeps reading and we
          // silently retry on next navigation.
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
    () =>
      post
        ? renderMarkdownWithToc(post.published_content, { numbering: post.heading_numbering })
        : { html: '', toc: [] },
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
  // DOCX now always imports with an editable Markdown body (tables + images
  // preserved; scanned files get a placeholder body), so it flows through the
  // Markdown reader like a note — TOC / typography / inline + full editing.
  // Only genuinely body-less binaries (PDF / image / pptx) keep the "file is the
  // article" preview. A legacy empty-body DOCX still falls through via the
  // ``!published_content`` guard below.
  const binaryFormats = new Set(['pdf', 'pptx', 'image']);
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
  const showToc = canShowToc && tocOpen && pageMode === 'read';
  // Word-count / reading-time: MD reads from the persisted markdown source;
  // HTML reads the plain-text body the iframe reader extracts (same-origin
  // direct DOM read for src-mode, or postMessage for srcDoc fallback).
  const wcSource = isHtmlDoc ? htmlMeta?.plainText ?? '' : post.published_content ?? '';
  const showWordCount = isHtmlDoc
    ? !!htmlMeta?.plainText
    : !hasInlineFile && !!post.published_content;
  const htmlOriginalUrl = isHtmlDoc ? post.primary_attachment?.url ?? '' : '';
  // PDF docs get the same "open in a real browser tab" affordance as HTML —
  // the native viewer is handy for printing / full-window reading.
  const isPdfDoc =
    !isHtmlDoc && !!post.primary_attachment && previewKind(post.primary_attachment) === 'pdf';
  const pdfOriginalUrl = isPdfDoc ? post.primary_attachment?.url ?? '' : '';
  // PPT/PPTX: server-rendered slide images shown in a Youdao-style reader
  // (thumbnail rail + main slide). Slides arrive via ``post.slides``; while the
  // conversion is still running the reader polls until they appear.
  const isPptxDoc = !isHtmlDoc && post.doc_format === 'pptx';
  const showKbRail = kbNavOpen && layoutWide;
  const showTocRail = showToc && tocRailWide;
  // The reader-layout controls (font scale / line-height / measure) only apply
  // to the Markdown body; HTML lives in a sandboxed iframe and binary previews
  // have no body text to reflow.
  const isMarkdownReadPath = pageMode === 'read' && !isHtmlDoc && !hasInlineFile;
  // Whether the author-action cluster (edit / full-edit / open-original) is
  // present — drives the hairline separator after the reading toolbar.
  const hasAuthorActions =
    canEdit || !!(isHtmlDoc && htmlOriginalUrl) || !!(isPdfDoc && pdfOriginalUrl);

  const postGridColumns = buildPostGridColumns(
    kbResize.width,
    tocResize.width,
    showKbRail,
    showTocRail,
  );

  const editHref = `/posts/${encodeURIComponent(post.slug)}/edit`;
  const primaryUrl = resolvePostPrimaryUrl(post);

  const handleTitleChange = async (title: string) => {
    if (!editDoc || title === editDoc.title) return;
    try {
      const updated = await patchDocumentTitle(editDoc, title, (live) => {
        if (live) {
          setEditDoc(live);
          setConflictSyncRevision((n) => n + 1);
        }
      });
      setEditDoc((prev) => (prev ? { ...prev, ...updated } : updated));
      setPost((prev) => (prev ? { ...prev, title } : prev));
    } catch {
      /* conflict or error already messaged */
    }
  };

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
            { title: <Link to="/"><JzHomeIcon size={13} strokeWidth={2} style={{ verticalAlign: '-0.125em' }} /> 首页</Link> },
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
          className={
            `paper ${paperClassName(effectivePaper)} jz-fade-in` +
            (isMarkdownReadPath ? ' jz-reader-measured' : '')
          }
          style={
            {
              ['--jz-article-font' as string]: stackFor(readerFont),
              ['--jz-reader-scale' as string]: String(layout.fontScale),
              ['--jz-reader-lh' as string]: String(layout.lineHeight),
              ['--jz-reader-measure' as string]: layout.measure,
            } as CSSProperties
          }
        >
          <header className="jz-post-header" style={{ marginBottom: 12 }}>
            <Title
              level={1}
              className="jz-post-title"
              editable={
                pageMode === 'edit' && editDoc
                  ? {
                      onChange: (v) => void handleTitleChange(v),
                      triggerType: ['text', 'icon'],
                    }
                  : false
              }
              style={{
                marginTop: 0,
                marginBottom: 6,
                fontSize: 'clamp(1.6rem, 2.4vw, 2rem)',
                color: 'var(--jz-text)',
              }}
            >
              {pageMode === 'edit' && editDoc ? editDoc.title : post.title}
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
                <JzBookIcon size={14} strokeWidth={2} className="jz-meta-icon" />
                <span className="jz-meta-pill-text">{post.knowledge_base.name}</span>
              </Link>
              <span className="jz-meta-format" aria-label={`文档格式 ${post.doc_format}`}>
                <DocFormatTag format={post.doc_format} size="default" />
              </span>

              <span className="jz-meta-sep" aria-hidden />

              {/* Date — read-only, ghost style with clock icon. */}
              <span className="jz-meta-date" title="发布时间">
                <JzClockIcon size={14} strokeWidth={2} className="jz-meta-icon" />
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
                    <JzTagIcon size={14} strokeWidth={2} className="jz-meta-icon" />
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

              {/* Right-aligned controls. Two visually distinct clusters:
                  a grouped reading-settings toolbar, then (for authors) the
                  edit actions — separated by a hairline. */}
              <span className="jz-meta-controls">
                <span className="jz-reader-toolbar" role="group" aria-label="阅读设置">
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
                  {isMarkdownReadPath && (
                    <ReaderLayoutPicker
                      layout={layout}
                      onChange={updateLayout}
                      onReset={resetReaderPrefs}
                    />
                  )}
                  {pageMode === 'read' && (
                    <Tooltip
                      title={
                        focusMode
                          ? '退出专注阅读 (Esc)'
                          : '专注阅读：隐藏导航栏与侧栏，沉浸读正文'
                      }
                    >
                      <button
                        type="button"
                        className={
                          'jz-reader-control-btn paper-picker-btn' +
                          (focusMode ? ' is-active' : '')
                        }
                        aria-label="专注阅读"
                        aria-pressed={focusMode}
                        onClick={() => setFocusMode((v) => !v)}
                      >
                        <EyeOutlined />
                      </button>
                    </Tooltip>
                  )}
                </span>
                {hasAuthorActions && <span className="jz-meta-vsep" aria-hidden />}
                {/* HTML-only: link to the original .html attachment for
                    a true "browser tab" experience (some pages depend on
                    full viewport width or have richer scripts). */}
                {isHtmlDoc && htmlOriginalUrl && (
                  <Tooltip title="在新标签页打开原 HTML 文件（浏览器原生体验）">
                    <Button
                      size="small"
                      type="primary"
                      ghost
                      icon={<JzExportIcon size={14} strokeWidth={2} />}
                      href={htmlOriginalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="jz-edit-btn jz-meta-edit-btn"
                    >
                      在新标签打开
                    </Button>
                  </Tooltip>
                )}
                {isPdfDoc && pdfOriginalUrl && (
                  <Tooltip title="在新标签页用浏览器打开 PDF（原生阅读器）">
                    <Button
                      size="small"
                      type="primary"
                      ghost
                      icon={<JzExportIcon size={14} strokeWidth={2} />}
                      href={pdfOriginalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="jz-edit-btn jz-meta-edit-btn"
                    >
                      在新标签打开
                    </Button>
                  </Tooltip>
                )}
                {canEdit && (
                  <span className="jz-meta-edit-actions">
                    {pageMode === 'read' ? (
                      <Tooltip
                        placement="bottom"
                        mouseEnterDelay={0.3}
                        title="在当前页原地编辑正文，无需跳转；快捷键 E 或 Ctrl+E"
                      >
                        <Button
                          size="small"
                          type="primary"
                          ghost
                          icon={<JzEditIcon size={14} strokeWidth={2} />}
                          className="jz-edit-btn jz-meta-edit-btn"
                          onClick={() => void enterEditMode()}
                        >
                          编辑
                        </Button>
                      </Tooltip>
                    ) : (
                      <>
                        <Tag color="processing" className="jz-meta-editing-tag">
                          编辑中
                        </Tag>
                        <Tooltip
                          placement="bottom"
                          mouseEnterDelay={0.3}
                          title="保存修改并返回阅读模式；快捷键 Esc"
                        >
                          <Button
                            size="small"
                            type="primary"
                            className="jz-meta-done-btn"
                            onClick={() => void exitEditMode()}
                          >
                            完成
                          </Button>
                        </Tooltip>
                      </>
                    )}
                    <Tooltip
                      placement="bottom"
                      mouseEnterDelay={0.3}
                      title="打开完整编辑页：切换 MD/富文本/HTML、发布、版本历史、导出与附件管理等"
                    >
                      <span className="jz-tooltip-trigger-wrap">
                        <Link to={editHref} className="jz-meta-full-edit-btn">
                          <JzComposeIcon size={13} strokeWidth={2} aria-hidden />
                          <span>完整编辑</span>
                        </Link>
                      </span>
                    </Tooltip>
                  </span>
                )}
              </span>
            </div>
          </header>

          {pageMode === 'edit' ? (
            editLoading ? (
              <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
                <Spin tip="加载编辑器…" />
              </div>
            ) : editDoc ? (
              <Suspense
                fallback={
                  <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
                    <Spin tip="加载编辑器…" />
                  </div>
                }
              >
                <PostInlineEditor
                  doc={editDoc}
                  post={post}
                  primaryUrl={primaryUrl}
                  fullEditHref={editHref}
                  onDocChange={setEditDoc}
                  onSaveReady={registerEditorSave}
                  forceSyncRevision={conflictSyncRevision}
                />
              </Suspense>
            ) : null
          ) : (
            <>
          {isHtmlDoc && htmlHasBuiltInNav && (
            <Alert
              type="info"
              showIcon
              message="本文已包含文内目录；可使用页面内置导航或点右上角「在新标签打开」获得浏览器原生体验。"
              style={{ marginBottom: 12 }}
            />
          )}
          {isHtmlDoc && (htmlBody.trim() || htmlOriginalUrl) ? (
            // HTML 文档：fetch 附件原文 → 注入高度上报 bootstrap + <base>（相对
            // 路径资源 / Tailwind / JS 照常加载）→ srcDoc 渲染于无 allow-same-origin
            // 的沙箱（作者 JS 不能碰我们的 cookie/会话）。fetch 失败才退回
            // <iframe src> 固定窗口；纯 raw_content（admin 新建模板）同走 srcDoc。
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
          ) : isPptxDoc ? (
            <div className="paper-breakout">
              <LazyPptxReader
                slides={post.slides ?? []}
                postId={post.id}
                downloadUrl={post.primary_attachment?.url}
              />
            </div>
          ) : hasInlineFile && post.primary_attachment ? (
            <div className="paper-breakout">
              <PublicAttachmentPreview att={post.primary_attachment} />
            </div>
          ) : (
            <div
              className="markdown-preview jz-post-article"
              style={{
                lineHeight: 'var(--jz-reader-lh, 1.85)',
                fontSize: 'calc(16.5px * var(--jz-reader-scale, 1))',
              }}
              dangerouslySetInnerHTML={{ __html: rendered.html }}
            />
          )}
          <CodeBlockEnhancer selector=".jz-post-article" bindKey={rendered.html} />
          <TableEnhancer selector=".jz-post-article" bindKey={rendered.html} />
            </>
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

          <RelatedPostsSection
            posts={related}
            kbSlug={kbSlug ?? post.knowledge_base.slug}
          />

          {adjacent && (adjacent.prev || adjacent.next) && (
            <nav className="jz-post-nav" aria-label="前后文章导航">
              <div className="jz-post-nav-grid">
                {adjacent.prev && (
                  <Link
                    to={postHref(
                      adjacent.prev.slug,
                      kbSlug ?? post.knowledge_base.slug,
                    )}
                    className="jz-post-nav-card jz-post-nav-card--prev"
                  >
                    <span className="jz-post-nav-dir">
                      <span className="jz-post-nav-arrow">←</span> 上一篇
                    </span>
                    <span className="jz-post-nav-title">{adjacent.prev.title}</span>
                  </Link>
                )}
                {adjacent.next && (
                  <Link
                    to={postHref(
                      adjacent.next.slug,
                      kbSlug ?? post.knowledge_base.slug,
                    )}
                    className="jz-post-nav-card jz-post-nav-card--next"
                  >
                    <span className="jz-post-nav-dir">
                      下一篇 <span className="jz-post-nav-arrow">→</span>
                    </span>
                    <span className="jz-post-nav-title">{adjacent.next.title}</span>
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

      {canShowToc && pageMode === 'read' && !tocOpen && (
        <Tooltip title="显示目录" placement="left">
          <Button
            type="default"
            shape="circle"
            size="large"
            icon={<JzOutlineIcon size={20} />}
            aria-label="显示目录"
            onClick={() => setTocOpen(true)}
            className="jz-toc-fab"
          />
        </Tooltip>
      )}

      {!kbNavOpen && !focusMode && (
        <Tooltip title="显示文档列表" placement="right">
          <Button
            type="default"
            shape="circle"
            size="large"
            icon={<JzFolderOpenIcon size={20} />}
            aria-label="显示文档列表"
            onClick={() => setKbNavOpen(true)}
            className="jz-kbnav-fab"
          />
        </Tooltip>
      )}

      {focusMode && (
        <Tooltip title="退出专注阅读 (Esc)" placement="left">
          <Button
            type="default"
            shape="circle"
            size="large"
            icon={<EyeOutlined />}
            aria-label="退出专注阅读"
            onClick={() => setFocusMode(false)}
            className="jz-focus-exit-fab"
          />
        </Tooltip>
      )}

      {/* Selection-driven AI helper — only for authenticated readers so we
          don't burn API tokens on anonymous traffic. */}
      {authUser && (
        <Suspense fallback={null}>
          <SelectionAI
            scopeRef={articleRef}
            contextProvider={() =>
              pageMode === 'edit' && editDoc
                ? editDoc.raw_content
                : post?.published_content || ''
            }
          />
          <DocAIPanel
            content={
              pageMode === 'edit' && editDoc
                ? editDoc.raw_content
                : post?.published_content || ''
            }
            title={pageMode === 'edit' && editDoc ? editDoc.title : post?.title}
          />
        </Suspense>
      )}
    </div>
  );
}
