import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { Alert, Skeleton } from 'antd';
import { injectHtmlReaderBootstrap } from './htmlReaderBootstrap';

/** A heading collected from inside the iframe, with its absolute Y offset
 *  measured against the iframe document (not the parent page). */
export interface HtmlHeading {
  id: string;
  level: number;
  text: string;
  /** Heading top, relative to the iframe document's origin. */
  top: number;
}

export interface HtmlReaderMeta {
  /** scrollHeight of <html> inside the iframe — used to size the iframe so
   *  the parent page's main scroll naturally flows past the embedded HTML. */
  height: number;
  headings: HtmlHeading[];
  /** Plain-text body, capped client-side, for word-count / reading-time. */
  plainText: string;
  /** True when the page already has a large in-document nav (aside/nav links). */
  hasBuiltInNav?: boolean;
  /** Y of the first “real content” element (skipping author hero/cover),
   *  measured relative to the iframe's document origin. 0 when no cover. */
  mainTop?: number;
}

interface Props {
  html: string;
  title?: string;
  /** Receive each meta refresh — fires on initial load and again after late
   *  image / font loads via ResizeObserver / MutationObserver. */
  onMeta?: (meta: HtmlReaderMeta) => void;
  /** Forwarded to the iframe element so the parent (TOC) can compute its
   *  position relative to the page. */
  iframeRef?: MutableRefObject<HTMLIFrameElement | null>;
  /** Real ``/media/...`` URL of the original .html attachment. When present
   *  we FETCH the file, inject the postMessage bootstrap + a ``<base>`` set
   *  to the attachment URL (so relative ``./assets/style.css`` etc. resolve
   *  exactly like an ``<iframe src>`` would), and render via ``srcDoc``
   *  inside an opaque-origin sandbox. The bootstrap reports height/headings
   *  from inside, restoring auto-sizing WITHOUT ``allow-same-origin`` —
   *  author JS must never share our origin (in production /media/ sits on
   *  the SPA/API domain; a same-origin frame could read the CSRF cookie and
   *  act as the logged-in viewer). Direct ``<iframe src>`` survives only as
   *  a fetch-failure fallback (fixed height + internal scrolling). */
  attachmentUrl?: string;
}

/** Default fallback height when no meta arrives within ``FALLBACK_DELAY_MS``
 *  — caps roughly at the original fixed-frame size so the page is still
 *  readable even if the bootstrap was blocked by a page-level CSP.
 *
 *  The bootstrap now posts an immediate height on script execution (no longer
 *  gated on DOMContentLoaded), so a working document reports within
 *  milliseconds. This timer is therefore a genuine "script never ran" backstop
 *  — kept generous (8s) so a merely slow-but-working document never flashes the
 *  false warning before its first post lands. */
const FALLBACK_DELAY_MS = 8000;

/** A pleasant default size for iframes whose document we can't introspect
 *  (fetch-failure fallback, or bootstrap blocked). Keeps the embed taller
 *  than a typical viewport so users rarely need to scroll inside. */
function viewportDefaultHeight(): number {
  if (typeof window === 'undefined') return 1200;
  return Math.max(720, Math.min(window.innerHeight - 120, 1400));
}

/** Resolve a possibly-relative attachment URL to an absolute one for use as
 *  the iframe document's ``<base href>``. */
function absoluteHref(url: string): string {
  if (typeof window === 'undefined') return url;
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}

/* ── Per-tab cache for fetched attachment HTML ─────────────────────────
 * Upload filenames are uuid-based and immutable — replacing the document
 * produces a NEW url — so the URL itself is a perfect cache key with no TTL.
 * Keeps prev/next navigation and back-button revisits instant instead of
 * re-downloading megabyte-sized HTML each time. Oversized entries are
 * skipped so a single huge file can't evict everything else. */
const ATT_CACHE_KEY = 'jz-html-att-cache-v1';
const ATT_CACHE_MAX = 6;
const ATT_CACHE_ENTRY_LIMIT = 1_500_000; // chars (~3MB UTF-16) per entry

interface AttCacheEntry {
  ts: number;
  text: string;
}

function readAttCache(url: string): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(ATT_CACHE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, AttCacheEntry>;
    return map[url]?.text ?? null;
  } catch {
    return null;
  }
}

function writeAttCache(url: string, text: string): void {
  if (typeof sessionStorage === 'undefined') return;
  if (text.length > ATT_CACHE_ENTRY_LIMIT) return;
  try {
    const raw = sessionStorage.getItem(ATT_CACHE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, AttCacheEntry>) : {};
    map[url] = { ts: Date.now(), text };
    const keys = Object.keys(map);
    if (keys.length > ATT_CACHE_MAX) {
      keys
        .map((k) => [k, map[k]!.ts] as const)
        .sort((a, b) => a[1] - b[1])
        .slice(0, keys.length - ATT_CACHE_MAX)
        .forEach(([k]) => delete map[k]);
    }
    sessionStorage.setItem(ATT_CACHE_KEY, JSON.stringify(map));
  } catch {
    /* storage full or disabled — silently skip caching */
  }
}

/** Fetch an uploaded ``.html`` attachment as text, honouring its declared
 *  charset: Content-Type header first, then an ASCII probe of the first 2KB
 *  for a ``<meta charset>``. Old GBK-era files decode correctly instead of
 *  rendering as mojibake (``r.text()`` would force UTF-8). */
async function fetchAttachmentHtml(url: string): Promise<string> {
  const cached = readAttCache(url);
  if (cached !== null) return cached;
  const resp = await fetch(url, { credentials: 'same-origin' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const ct = resp.headers.get('content-type') || '';
  let charset = (/charset=([\w-]+)/i.exec(ct)?.[1] || '').toLowerCase();
  if (!charset) {
    const probe = new TextDecoder('latin1').decode(buf.slice(0, 2048));
    charset = (/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(probe)?.[1] || '').toLowerCase();
  }
  let text: string;
  if (charset && charset !== 'utf-8' && charset !== 'utf8') {
    try {
      text = new TextDecoder(charset).decode(buf);
    } catch {
      /* unknown label — fall through to UTF-8 */
      text = new TextDecoder('utf-8').decode(buf);
    }
  } else {
    text = new TextDecoder('utf-8').decode(buf);
  }
  writeAttCache(url, text);
  return text;
}

function HtmlPostReader({
  html,
  title,
  onMeta,
  iframeRef,
  attachmentUrl,
}: Props) {
  const internalRef = useRef<HTMLIFrameElement | null>(null);
  /** Stable ref to the latest ``onMeta`` so the message listener doesn't
   *  re-subscribe on every render and miss messages mid-flight. */
  const onMetaRef = useRef(onMeta);
  useEffect(() => {
    onMetaRef.current = onMeta;
  }, [onMeta]);

  const hasMetaRef = useRef(false);
  /** Last applied iframe height — used to suppress sub-pixel jitter from
   *  observer bursts that would otherwise re-render the iframe and
   *  cause the parent page to layout-shift on every scan. */
  const lastHeightRef = useRef(0);
  const lastHeadingsLenRef = useRef(0);
  const lastPlainLenRef = useRef(0);
  const [height, setHeight] = useState<number | null>(null);
  const [hasMeta, setHasMeta] = useState(false);
  const [cspFallback, setCspFallback] = useState(false);

  // ── Attachment fetch (srcDoc-with-bootstrap is the primary path) ────────
  const [fetchedHtml, setFetchedHtml] = useState<string | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);

  useEffect(() => {
    setFetchedHtml(null);
    setFetchFailed(false);
    if (!attachmentUrl) return;
    let cancelled = false;
    fetchAttachmentHtml(attachmentUrl)
      .then((text) => {
        if (!cancelled) setFetchedHtml(text);
      })
      .catch(() => {
        if (!cancelled) setFetchFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attachmentUrl]);

  /** Fetch failed (network error / odd CORS setup): fall back to a direct
   *  ``<iframe src>``. Its sandbox has no ``allow-same-origin``, so the
   *  document is opaque and unmeasurable — fixed height + internal scroll. */
  const useDirectSrc = !!attachmentUrl && fetchFailed;
  const attachmentLoading = !!attachmentUrl && !fetchFailed && fetchedHtml === null;

  const srcDoc = useMemo(() => {
    if (useDirectSrc || attachmentLoading) return '';
    if (attachmentUrl && fetchedHtml !== null) {
      return injectHtmlReaderBootstrap(fetchedHtml, absoluteHref(attachmentUrl));
    }
    return injectHtmlReaderBootstrap(html);
  }, [html, useDirectSrc, attachmentLoading, attachmentUrl, fetchedHtml]);

  const setRef = (el: HTMLIFrameElement | null) => {
    internalRef.current = el;
    if (iframeRef) iframeRef.current = el;
  };

  /** Apply a freshly-read meta, deduplicating against last applied values to
   *  avoid layout-shift cascades when ResizeObserver fires bursts. */
  const applyMeta = (meta: HtmlReaderMeta) => {
    const reported = Math.max(0, meta.height + 8);
    const headingsLen = meta.headings.length;
    const heightChanged = Math.abs(reported - lastHeightRef.current) >= 16;
    const headingsChanged = headingsLen !== lastHeadingsLenRef.current;
    // plainText arrives once, on the first idle full-scan — without this
    // dimension a heading-less document's word count would be deduped away.
    const plainChanged = meta.plainText.length !== lastPlainLenRef.current;
    if (!heightChanged && !headingsChanged && !plainChanged && hasMetaRef.current) return;
    lastHeightRef.current = reported;
    lastHeadingsLenRef.current = headingsLen;
    lastPlainLenRef.current = meta.plainText.length;
    setHeight(reported);
    hasMetaRef.current = true;
    setHasMeta(true);
    setCspFallback(false);
    onMetaRef.current?.(meta);
  };

  // ── Receive meta via postMessage from the injected bootstrap (all srcDoc
  //    documents: raw_content HTML and fetched attachments alike).
  useEffect(() => {
    if (useDirectSrc) return;
    function onMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== 'object') return;
      const data = e.data as { type?: string };
      if (data.type !== 'jz-html-meta') return;
      if (e.source !== internalRef.current?.contentWindow) return;
      const m = e.data as {
        height?: number;
        headings?: HtmlHeading[];
        plainText?: string;
        hasBuiltInNav?: boolean;
      };
      applyMeta({
        height: m.height ?? 0,
        headings: m.headings ?? [],
        plainText: m.plainText ?? '',
        hasBuiltInNav: !!m.hasBuiltInNav,
      });
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useDirectSrc]);

  // Reset sizing state whenever the iframe document changes. Three cases:
  //
  //   1. srcDoc with bootstrap (primary): expect meta via postMessage. If
  //      nothing arrives within FALLBACK_DELAY_MS the likely cause is the
  //      author page aborting our script — fall back to a fixed window +
  //      a brief explainer.
  //   2. Attachment still fetching: no iframe yet, no timer — the skeleton
  //      placeholder is showing.
  //   3. Direct-src fallback: document is opaque by design; fixed viewport
  //      height immediately, never warn.
  useEffect(() => {
    hasMetaRef.current = false;
    lastHeightRef.current = 0;
    lastHeadingsLenRef.current = 0;
    setHasMeta(false);
    setCspFallback(false);
    setHeight(null);

    if (attachmentLoading) return;

    if (useDirectSrc) {
      setHeight(viewportDefaultHeight());
      return;
    }

    const timer = window.setTimeout(() => {
      if (!hasMetaRef.current) {
        setHeight(viewportDefaultHeight());
        setCspFallback(true);
      }
    }, FALLBACK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [srcDoc, attachmentUrl, useDirectSrc, attachmentLoading]);

  const iframeStyle: CSSProperties = {
    width: '100%',
    height: height != null ? `${height}px` : '720px',
    minHeight: hasMeta ? 0 : 720,
    border: hasMeta ? 'none' : '1px solid var(--glass-border, var(--jz-border))',
    borderRadius: hasMeta ? 0 : 12,
    background: '#fff',
    display: 'block',
    // Fallback mode: keep ``visible`` so the iframe's own scrollbar appears.
    // Meta-driven: ``hidden`` because the parent page scroll flows past the
    // embedded content.
    overflow: useDirectSrc ? 'visible' : 'hidden',
  };

  return (
    <>
      {cspFallback && (
        <Alert
          type="warning"
          showIcon
          message="页面脚本被阻止，无法自动测量正文高度；已切换为固定窗口预览，可在框内滚动查看。"
          style={{ marginBottom: 8 }}
        />
      )}
      {attachmentLoading ? (
        <div
          style={{
            minHeight: 480,
            padding: 24,
            border: '1px solid var(--glass-border, var(--jz-border))',
            borderRadius: 12,
            background: '#fff',
          }}
        >
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      ) : useDirectSrc ? (
        <iframe
          ref={setRef}
          title={title || 'HTML 文档'}
          src={attachmentUrl}
          // NO ``allow-same-origin``: combined with ``allow-scripts`` it would
          // let author HTML escape the sandbox entirely and (in production,
          // where /media/ shares the SPA/API origin) read the CSRF cookie and
          // act as the logged-in viewer. Opaque origin keeps author JS running
          // but walled off from cookies, storage, and the parent page.
          sandbox="allow-scripts allow-popups allow-forms"
          scrolling="auto"
          loading="lazy"
          style={iframeStyle}
        />
      ) : (
        <iframe
          ref={setRef}
          title={title || 'HTML 文档'}
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-popups allow-forms"
          scrolling="no"
          // NOT loading="lazy": this iframe IS the article body, always at
          // the top of the viewport — lazy would only postpone parsing and
          // delay the first height report.
          style={iframeStyle}
        />
      )}
    </>
  );
}

export default HtmlPostReader;
