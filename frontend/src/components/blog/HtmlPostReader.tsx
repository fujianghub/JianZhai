import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { Alert } from 'antd';
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
   *  we render with ``<iframe src>`` so the browser uses the file's directory
   *  as the base URL — relative ``./assets/style.css`` etc. resolve correctly,
   *  matching the "open in browser tab" experience. ``srcDoc`` mode is kept
   *  as a fallback for raw_content-only HTML created in the admin UI. */
  attachmentUrl?: string;
}

/** Default fallback height when no meta arrives within ``FALLBACK_DELAY_MS``
 *  — caps roughly at the original fixed-frame size so the page is still
 *  readable even if the bootstrap was blocked by a page-level CSP. */
const FALLBACK_DELAY_MS = 3000;

/** Detect whether the iframe URL is cross-origin to the parent. When true we
 *  can't read scrollHeight / headings (same-origin policy), so the bootstrap
 *  path doesn't apply — we render at a viewport-relative default and let the
 *  iframe scroll internally. This is **not** a security-policy block; it's
 *  the documented cross-origin design. Surfacing the old "CSP blocked"
 *  warning here was misleading.
 */
function isCrossOrigin(url: string | undefined): boolean {
  if (!url) return false;
  if (typeof window === 'undefined') return false;
  try {
    const u = new URL(url, window.location.href);
    return u.origin !== window.location.origin;
  } catch {
    return false;
  }
}

/** A pleasant default size for cross-origin iframes where we can't introspect
 *  the document. Keeps the embed taller than a typical viewport so users
 *  rarely need to scroll inside. */
function viewportDefaultHeight(): number {
  if (typeof window === 'undefined') return 1200;
  return Math.max(720, Math.min(window.innerHeight - 120, 1400));
}

/** Id of the style node we inject into embedded HTML documents to break the
 *  iframe vh feedback loop: authored pages often set ``.hero { min-height:
 *  50vh }`` while we size the iframe to ``scrollHeight``, so vh grows with
 *  iframe height and the hero balloons to thousands of pixels. */
const VH_OVERRIDE_STYLE_ID = 'jz-vh-override';

/** CSS that clears viewport-driven min-heights on hero/cover shells only —
 * padding, gradients, and flex centering are untouched. ``:where()`` keeps
 * specificity at zero so author ``!important`` rules still win. */
const VH_OVERRIDE_CSS = [
  ':where(.hero, [class*="hero"], .cover, [class*="cover"],',
  '       .banner, [class*="banner"]) { min-height: 0 !important; }',
  ':where(body, html) { min-height: 0 !important; }',
].join('\n');

/** Inject vh-override into a same-origin iframe document before measuring
 *  scrollHeight so hero sections collapse to their natural content height. */
function injectVhOverride(doc: Document) {
  if (doc.getElementById(VH_OVERRIDE_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = VH_OVERRIDE_STYLE_ID;
  style.textContent = VH_OVERRIDE_CSS;
  doc.head?.appendChild(style);
}

function makeSlug(text: string): string {
  const s = (text || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return s || 'h' + Math.random().toString(36).slice(2, 7);
}

/** Plain-text cap for word-count / reading-time. 60k chars covers a 30 000-字
 *  Chinese article plus latin headings comfortably — well past the upper
 *  bound of a single readable post. The previous 200k limit cost a
 *  measurable ``innerText`` re-layout pass on every observer fire for large
 *  HTML documents (which can include hidden offscreen siblings), and word-
 *  count never benefits from the extra bytes. */
const PLAIN_TEXT_LIMIT = 60_000;

/** Fast-path meta read: ONLY scrollHeight + nav-presence flag. Used to size
 *  the iframe immediately on load so the parent page can finish layout in
 *  one frame; headings + plainText come from the idle-callback pass below. */
function readFastMetaFromDoc(doc: Document): Pick<HtmlReaderMeta, 'height' | 'hasBuiltInNav'> {
  const html = doc.documentElement;
  const body = doc.body;
  const height = Math.max(
    html?.scrollHeight ?? 0,
    body?.scrollHeight ?? 0,
    html?.offsetHeight ?? 0,
    body?.offsetHeight ?? 0,
  );
  const navLinks = doc.querySelectorAll(
    'aside a[href],nav a[href],[class*="toc"] a[href],[class*="sidebar"] a[href]',
  );
  return { height, hasBuiltInNav: navLinks.length >= 10 };
}

/** Full meta read — headings + plainText. Heavier (one querySelectorAll +
 *  per-heading getBoundingClientRect + innerText) so we defer it via
 *  requestIdleCallback to keep first paint snappy. */
function readMetaFromDoc(doc: Document): HtmlReaderMeta {
  const fast = readFastMetaFromDoc(doc);
  const body = doc.body;
  const seen: Record<string, number> = {};
  const headings: HtmlHeading[] = Array.from(
    doc.querySelectorAll<HTMLHeadingElement>('h1,h2,h3,h4,h5,h6'),
  ).map((el) => {
    if (!el.id) {
      let s = makeSlug(el.textContent || '');
      while (seen[s]) {
        seen[s] += 1;
        s = `${s}-${seen[s]}`;
      }
      seen[s] = 1;
      el.id = s;
    } else if (!seen[el.id]) {
      seen[el.id] = 1;
    }
    const win = doc.defaultView;
    return {
      id: el.id,
      level: Number(el.tagName.slice(1)),
      text: (el.textContent || '').trim(),
      top: el.getBoundingClientRect().top + (win?.pageYOffset ?? 0),
    };
  });
  return {
    height: fast.height,
    headings,
    plainText: (body?.innerText ?? '').slice(0, PLAIN_TEXT_LIMIT),
    hasBuiltInNav: fast.hasBuiltInNav,
  };
}

/** Polyfill for ``requestIdleCallback`` — Safari/some older WebViews lack it. */
type IdleHandle = number;
const ric =
  typeof window !== 'undefined' && 'requestIdleCallback' in window
    ? (window.requestIdleCallback as (cb: () => void, opts?: { timeout?: number }) => IdleHandle)
    : ((cb: () => void) =>
        window.setTimeout(cb, 100) as unknown as IdleHandle);
const cic =
  typeof window !== 'undefined' && 'cancelIdleCallback' in window
    ? (window.cancelIdleCallback as (h: IdleHandle) => void)
    : ((h: IdleHandle) => window.clearTimeout(h as unknown as number));

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
  const [height, setHeight] = useState<number | null>(null);
  const [hasMeta, setHasMeta] = useState(false);
  const [cspFallback, setCspFallback] = useState(false);

  const useDirectSrc = !!attachmentUrl;
  /** src-mode iframes are sandboxed WITHOUT ``allow-same-origin`` (see the
   *  sandbox attribute below), so the document is always an opaque origin to
   *  us — scrollHeight/headings are unreadable regardless of the URL's actual
   *  origin. Route every src embed through the cross-origin presentation path
   *  (viewport-default height + internal scrolling, no warning).
   *
   *  Security: author-uploaded HTML runs scripts. In production /media/ is
   *  same-origin with the SPA and the API; with ``allow-same-origin`` a
   *  malicious document could read the CSRF cookie and fire authenticated
   *  API calls as whoever is reading it — stored XSS, in effect. The sandbox
   *  opaque origin severs that. (``isCrossOrigin`` is kept for potential
   *  future use where the distinction matters again.) */
  const crossOrigin = useDirectSrc;
  void isCrossOrigin;
  const srcDoc = useMemo(
    () => (useDirectSrc ? '' : injectHtmlReaderBootstrap(html)),
    [html, useDirectSrc],
  );

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
    if (!heightChanged && !headingsChanged && hasMetaRef.current) return;
    lastHeightRef.current = reported;
    lastHeadingsLenRef.current = headingsLen;
    setHeight(reported);
    hasMetaRef.current = true;
    setHasMeta(true);
    setCspFallback(false);
    onMetaRef.current?.(meta);
  };

  // ── srcDoc mode: receive meta via postMessage from the injected bootstrap.
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

  // Reset state when the source changes (iframe will reload). Two scenarios
  // here:
  //
  //   1. Same-origin (srcDoc, or src on the parent's origin): we expect the
  //      bootstrap / load handler to surface meta. If it doesn't within
  //      FALLBACK_DELAY_MS, the **likely** cause is a page-level CSP block on
  //      the script — surface a brief explainer + sensible default size.
  //
  //   2. Cross-origin attachment URL (the common case — backend on :8002,
  //      page on :3001): same-origin policy makes scrollHeight unreadable
  //      *by design*. No bootstrap can run inside a cross-origin /media file.
  //      Set a viewport-relative size immediately; never show the warning,
  //      because nothing went wrong.
  useEffect(() => {
    hasMetaRef.current = false;
    lastHeightRef.current = 0;
    lastHeadingsLenRef.current = 0;
    setHasMeta(false);
    setCspFallback(false);
    setHeight(null);

    if (crossOrigin) {
      // Skip the timer entirely — cross-origin embeds get a stable default
      // and scroll internally if their content exceeds it.
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
  }, [srcDoc, attachmentUrl, crossOrigin]);

  // ── src mode: read meta directly off the same-origin iframe document on
  //              load, then re-read whenever the document mutates / resizes.
  const handleSameOriginLoad = () => {
    if (!useDirectSrc) return;
    const iframe = internalRef.current;
    // Cross-origin: ``iframe.contentDocument`` throws or returns null. Don't
    // even try — the height already came from ``viewportDefaultHeight``.
    if (crossOrigin) return;
    let doc: Document | null = null;
    try {
      doc = iframe?.contentDocument ?? null;
    } catch {
      // Defensive: some browsers raise SecurityError synchronously. Treat as
      // cross-origin (the upfront detection should have caught this, but
      // belt-and-suspenders never hurt).
      return;
    }
    if (!doc) return;

    // Break the vh feedback loop before the first height read.
    injectVhOverride(doc);

    let pending = 0;
    let idleHandle: IdleHandle | null = null;
    // Two-stage report:
    //   1. ``reportFast`` — sync read of just scrollHeight + nav flag, fires
    //      immediately so the iframe lands at its natural size in one frame
    //      and the parent page stops jumping.
    //   2. ``reportFull`` — heavier scan (headings + plainText). Scheduled
    //      via requestIdleCallback so it never delays first paint of long
    //      HTML posts. Heading text feeds the in-page word-count; until it
    //      arrives we still show the article with a "—" word counter that
    //      flips to the real number once the idle pass lands.
    const reportFast = () => {
      try {
        const fast = readFastMetaFromDoc(doc);
        applyMeta({
          height: fast.height,
          headings: [],
          plainText: '',
          hasBuiltInNav: fast.hasBuiltInNav,
        });
      } catch {
        /* parser/cross-origin races — leave fallback height in place */
      }
    };
    const reportFull = () => {
      try {
        applyMeta(readMetaFromDoc(doc));
      } catch {
        /* parser/cross-origin races — leave fallback height in place */
      }
    };
    const scheduleReport = () => {
      if (pending) return;
      pending = window.setTimeout(() => {
        pending = 0;
        reportFast();
        // Defer the heavy scan; cancel and re-arm so bursty mutations
        // collapse into one idle pass.
        if (idleHandle != null) cic(idleHandle);
        idleHandle = ric(() => {
          idleHandle = null;
          reportFull();
        }, { timeout: 800 });
      }, 50);
    };

    reportFast();
    // First full scan in idle time — typically within ~20ms of load on a
    // healthy main thread, much later if the page is busy parsing late
    // images / fonts. Either way it doesn't block the iframe rendering.
    idleHandle = ric(() => {
      idleHandle = null;
      reportFull();
    }, { timeout: 800 });
    // Late image / font loads that change layout.
    const win = doc.defaultView;
    try {
      if (win?.ResizeObserver && doc.documentElement) {
        new win.ResizeObserver(scheduleReport).observe(doc.documentElement);
      }
    } catch {
      /* ignore */
    }
    try {
      if (win?.MutationObserver && doc.body) {
        new win.MutationObserver(scheduleReport).observe(doc.body, {
          childList: true,
          subtree: true,
          attributes: true,
        });
      }
    } catch {
      /* ignore */
    }
    // Listen for hash navigation requests from the parent (kept for parity).
    const onIframeMessage = (ev: MessageEvent) => {
      if (!ev.data || typeof ev.data !== 'object') return;
      const data = ev.data as { type?: string; id?: string };
      if (data.type === 'jz-scroll-to' && data.id) {
        const el = doc.getElementById(data.id);
        el?.scrollIntoView({ block: 'start' });
      }
    };
    win?.addEventListener('message', onIframeMessage);
  };

  const iframeStyle: CSSProperties = {
    width: '100%',
    height: height != null ? `${height}px` : '720px',
    minHeight: hasMeta ? 0 : 720,
    border: hasMeta ? 'none' : '1px solid var(--glass-border, var(--jz-border))',
    borderRadius: hasMeta ? 0 : 12,
    background: '#fff',
    display: 'block',
    // Cross-origin: keep ``visible`` so the iframe's own scrollbar appears.
    // Same-origin meta-driven: ``hidden`` because the parent page scroll
    // flows past the embedded content.
    overflow: crossOrigin ? 'visible' : 'hidden',
  };

  // For cross-origin attachments we let the iframe scroll internally because
  // we can't grow it to match content height. Same-origin embeds keep the
  // parent-page scroll flow (``scrolling="no"``) — meta-driven sizing keeps
  // the embed flush with surrounding prose.
  const innerScrolling = crossOrigin ? 'auto' : 'no';

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
      {useDirectSrc ? (
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
          scrolling={innerScrolling}
          onLoad={handleSameOriginLoad}
          // ``loading="lazy"`` defers the fetch + parse until the iframe is
          // close to the viewport. For HTML posts above the fold this is a
          // no-op (already visible), but for long reads it skips parsing
          // off-screen content until the user scrolls there.
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
          loading="lazy"
          style={iframeStyle}
        />
      )}
    </>
  );
}

export default HtmlPostReader;
