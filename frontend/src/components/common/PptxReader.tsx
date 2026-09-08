/**
 * Youdao-style PPT/PPTX reader. Slides are pre-rendered server-side (LibreOffice
 * → PDF → per-page JPEG) and delivered as an ordered image list. When the
 * derived PDF is also available (``pdfUrl``) the main slide is painted by
 * pdf.js instead (canvas + selectable text layer + clickable links) with the
 * JPEG as its placeholder; decks converted before the PDF was kept fall back
 * to the plain image seamlessly. No client-side pptx parsing either way.
 *
 * Layout mirrors the PDF reader's ergonomics: a thumbnail rail on the left, the
 * active slide filling the main column, a sticky toolbar (prev/next, page
 * counter, zoom, fullscreen, download) and keyboard nav (←/→ / PageUp/Down).
 * While the server is still converting the deck the slide list is empty; we show
 * a "转换中" placeholder and poll until slides appear.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Chevron from './Chevron';
import { flushSync } from 'react-dom';
import { Button, Popover, Space, Spin, Tooltip, Typography } from 'antd';
import {
  DownloadOutlined,
  FileTextOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  PlaySquareOutlined,
  SearchOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import { fetchPostSlides } from '@/api/blog';
import { reconvertSlides } from '@/api/docs';
import { useAuthStore } from '@/stores/auth';
import { message } from '@/utils/notify';
import type { Slide, SlideStatus } from '@/types';
import { useActiveScopes, useShortcut, withShortcut } from '@/shortcuts';
import { loadPptxPosition, savePptxPosition, syncUrlParam } from '@/utils/readerPosition';
import { pickNewer } from '@/utils/positionSync';
import { useServerPosition } from '@/hooks/useServerPosition';
import { runPageTurn, type TurnDir } from '@/utils/pageTurn';
import Kbd from './Kbd';
import { usePdfDocument } from '@/hooks/usePdfDocument';
import PdfPageView from './PdfPageView';
import ReaderPaperPicker from './ReaderPaperPicker';
import { useReaderPaper } from '@/utils/readerPaper';
import { attachPinchZoom } from '@/utils/pinchZoom';
import SearchResults, { type SearchGroup } from './reader/SearchResults';
import { buildPdfTextIndex, searchPdfIndex, type PdfTextIndex } from '@/utils/pdfTextIndex';

interface Props {
  slides: Slide[];
  /** Post id — used to poll for slides while the deck is still converting. */
  postId: number;
  /** Original .pptx URL for the download button. */
  downloadUrl?: string;
  /** Server-side conversion state at page load; drives the failure message. */
  status?: SlideStatus;
  /** Human-facing failure reason (shown when status/poll reports 'failed'). */
  error?: string;
  /** How often to poll for slides while empty (ms). */
  pollInterval?: number;
  /** Derived slide PDF (same LibreOffice render the JPEGs came from); enables
   * the selectable text layer. Absent/empty → image-only reader. */
  pdfUrl?: string | null;
  /** 0-based slide to open on (from ``?slide=``); wins over the memory. */
  initialSlide?: number | null;
  /** Mirror the active slide into ``?slide=`` (reading page only). */
  syncUrl?: boolean;
}

const POLL_MS = 2500;
const MAX_POLLS = 48; // ~2min then give up (used when the backend status is unknown)
// While the backend still reports 'pending' a big deck is legitimately converting;
// keep polling up to ~7min, covering the worker's 2×180s soffice+pdftoppm timeouts.
const HARD_MAX_POLLS = 168;

export default function PptxReader({
  slides: initial,
  postId,
  downloadUrl,
  status,
  error,
  pollInterval = POLL_MS,
  pdfUrl: initialPdfUrl,
  initialSlide = null,
  syncUrl = false,
}: Props) {
  useActiveScopes(['reader.pptx']);
  const [slides, setSlides] = useState<Slide[]>(initial);
  const [pdfUrl, setPdfUrl] = useState<string>(initialPdfUrl || '');
  const posKey = `post:${postId}`;
  const [active, setActive] = useState(() => {
    if (initialSlide != null && initialSlide >= 0) return initialSlide;
    return loadPptxPosition(posKey)?.slide ?? 0;
  });
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  const [pollsExhausted, setPollsExhausted] = useState(false);
  // Set once the conversion is known to have permanently failed — stops the
  // poll loop and shows the real reason instead of a forever-spinning "转换中".
  const [failed, setFailed] = useState<string | null>(
    status === 'failed' ? error || 'PPT 转换失败' : null,
  );
  const isStaff = useAuthStore((s) => !!s.user?.is_staff);
  const loggedIn = useAuthStore((s) => !!s.user);
  // Cross-device position (the post id is the document id).
  const { remote: serverPos, loaded: serverPosLoaded, push: pushServerPos } = useServerPosition(postId, loggedIn);
  // Set once the reader navigated on their own — a late server position must
  // not yank them away from the slide they chose.
  const navigatedRef = useRef(false);
  // Set once the server / local merge has been decided — before that no
  // position is written (a mount-time write would out-date the server row).
  const mergedRef = useRef(false);
  const [reconverting, setReconverting] = useState(false);
  // Author-only manual retry: clears the old render server-side and restarts
  // polling from a clean `pending` state.
  const retryConversion = async () => {
    setReconverting(true);
    try {
      await reconvertSlides(postId);
      setFailed(null);
      setPollsExhausted(false);
      setSlides([]);
      message.success('已重新开始转换，请稍候');
    } catch (e) {
      message.error((e as Error)?.message || '重新转换失败');
    } finally {
      setReconverting(false);
    }
  };
  const mainRef = useRef<HTMLDivElement | null>(null);
  const [paper] = useReaderPaper();
  // ── Find in deck: pdf.js text of every slide (via the deck PDF) + notes ──
  const [findOpen, setFindOpen] = useState(false);
  const indexRef = useRef<PdfTextIndex | null>(null);
  const indexDocRef = useRef<typeof pdf.doc>(null);
  const searchDeck = async (query: string, push: (g: SearchGroup<number>) => void) => {
    const q = query.trim().toLowerCase();
    if (!q) return;
    let textHits: Array<{ page: number; pre: string; match: string; post: string }> = [];
    if (pdf.doc) {
      if (!indexRef.current || indexDocRef.current !== pdf.doc) {
        indexRef.current = await buildPdfTextIndex(pdf.doc);
        indexDocRef.current = pdf.doc;
      }
      textHits = searchPdfIndex(indexRef.current, query, { maxPerPage: 10 });
    }
    const byPage = new Map<number, SearchGroup<number>>();
    const add = (page: number, pre: string, match: string, post: string) => {
      const g = byPage.get(page) ?? { label: `第 ${page} 页`, hits: [] };
      g.hits.push({ pre, match, post, target: page });
      byPage.set(page, g);
    };
    for (const h of textHits) add(h.page, h.pre, h.match, h.post);
    slides.forEach((s) => {
      const notes = (s.notes || '').trim();
      const i = notes.toLowerCase().indexOf(q);
      if (i >= 0) add(s.index + 1, '备注：' + notes.slice(Math.max(0, i - 24), i), notes.slice(i, i + q.length), notes.slice(i + q.length, i + q.length + 32));
    });
    for (const page of [...byPage.keys()].sort((a, b) => a - b)) push(byPage.get(page)!);
  };
  useShortcut('reader.pptx.find', () => setFindOpen(true), { enabled: slides.length > 0 });
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  // Pinch / double-tap on the slide area (touch only; mouse dblclick selects text).
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    return attachPinchZoom(el, {
      getZoom: () => zoomRef.current,
      setZoom: (z) => setZoom(z),
      isTextTarget: (t) => t instanceof Element && !!t.closest('.jz-pdf-textlayer, .jz-pdf-link'),
    });
  }, [fullscreen, slides.length]);

  useEffect(() => {
    setSlides(initial);
  }, [initial]);
  useEffect(() => {
    setPdfUrl(initialPdfUrl || '');
  }, [initialPdfUrl]);

  // The text-layer source. A missing / failing PDF leaves `pdf.doc` null and
  // the main area keeps rendering the JPEG.
  const pdf = usePdfDocument(pdfUrl || null);

  // Poll for slides while the server-side conversion is still running.
  useEffect(() => {
    if (slides.length > 0 || failed) return;
    let cancelled = false;
    let tries = 0;
    const tick = async () => {
      if (cancelled) return;
      tries += 1;
      let stillPending = false;
      try {
        const next = await fetchPostSlides(postId);
        if (cancelled) return;
        if (next.slides.length > 0) {
          setSlides(next.slides);
          if (next.pdfUrl) setPdfUrl(next.pdfUrl);
          return;
        }
        if (next.status === 'failed') {
          setFailed(next.error || 'PPT 转换失败');
          return;
        }
        stillPending = next.status === 'pending';
      } catch {
        /* transient — keep polling */
      }
      // Give up at MAX_POLLS unless the backend still reports 'pending' (a large
      // deck genuinely converting), in which case keep polling to the hard cap.
      const cap = stillPending ? HARD_MAX_POLLS : MAX_POLLS;
      if (tries >= cap) {
        setPollsExhausted(true);
        return;
      }
      timer = window.setTimeout(tick, pollInterval);
    };
    let timer = window.setTimeout(tick, pollInterval);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [slides.length, postId, pollInterval, failed]);

  const total = slides.length;
  const clamp = useCallback((n: number) => Math.min(Math.max(0, n), Math.max(0, total - 1)), [total]);
  // Presenter mode (fullscreen + notes / timer / next-slide column) and its
  // blackout toggle; both end with the fullscreen session.
  const [presenting, setPresenting] = useState(false);
  const [blackout, setBlackout] = useState(false);
  const [presentStart, setPresentStart] = useState<number | null>(null);
  const [clock, setClock] = useState(0);
  const activeRef = useRef(active);
  activeRef.current = active;
  // Turn = View Transition on the stage (slide for ±1, fade for jumps); the
  // target image is decoded first so the incoming snapshot is never blank.
  const go = useCallback(
    (n: number, dirHint?: TurnDir) => {
      const cur = activeRef.current;
      const next = clamp(n);
      if (next === cur) return;
      navigatedRef.current = true;
      activeRef.current = next;
      setBlackout(false);
      const dir: TurnDir = dirHint ?? (Math.abs(next - cur) === 1 ? (next > cur ? 'next' : 'prev') : 'jump');
      runPageTurn({
        stage: mainRef.current,
        name: 'jz-pptx-slide',
        dir,
        preload: slides[next]?.url ?? null,
        run: () => {
          flushSync(() => setActive(next));
          mainRef.current?.scrollTo({ top: 0 });
        },
      });
    },
    [clamp, slides],
  );

  // A server position newer than the local memory wins once — before the
  // reader has navigated and when no ?slide= deep link asked for a slide.
  useEffect(() => {
    if (!serverPosLoaded || total === 0 || mergedRef.current) return;
    mergedRef.current = true;
    if (navigatedRef.current || (initialSlide != null && initialSlide >= 0)) return;
    const pick = pickNewer(loadPptxPosition(posKey), serverPos && serverPos.slide != null ? serverPos : null);
    if (pick?.source === 'remote') setActive(clamp(pick.value.slide ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverPosLoaded, serverPos, total]);

  // Keyboard navigation — registry shortcuts (IME / contenteditable guarded).
  const hasSlides = total > 0;
  useShortcut('reader.pptx.next', () => go(active + 1), { enabled: hasSlides });
  useShortcut('reader.pptx.next-alt', () => go(active + 1), { enabled: hasSlides });
  useShortcut('reader.pptx.prev', () => go(active - 1), { enabled: hasSlides });
  useShortcut('reader.pptx.prev-alt', () => go(active - 1), { enabled: hasSlides });
  useShortcut('reader.pptx.fullscreen-exit', () => { if (document.fullscreenElement) void document.exitFullscreen?.(); }, { enabled: fullscreen });
  useShortcut('reader.pptx.present', () => togglePresenting(), { enabled: hasSlides });
  useShortcut('reader.pptx.blackout', () => setBlackout((v) => !v), { enabled: presenting });
  useShortcut('reader.pptx.blackout-alt', () => setBlackout((v) => !v), { enabled: presenting });

  // Clamp a remembered / deep-linked slide once the deck is known; remember
  // the active slide and mirror it into ?slide= (1-based) on the reading page.
  useEffect(() => {
    if (total > 0 && active > total - 1) setActive(total - 1);
  }, [total, active]);
  useEffect(() => {
    if (total === 0 || !mergedRef.current) return;
    savePptxPosition(posKey, active);
    pushServerPos({ slide: active });
    if (syncUrl) syncUrlParam('slide', active > 0 ? active + 1 : null);
  }, [active, total, posKey, syncUrl, serverPosLoaded, pushServerPos]);

  // Fullscreen = the Fullscreen API on the reader wrapper itself (same element,
  // no portal) so popups / selection bars keep their container and the slide
  // iframe-free stack never remounts. Escape is handled by the browser too.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = wrapRef;
  useEffect(() => {
    const onChange = () => {
      const fs = document.fullscreenElement === wrapRef.current;
      setFullscreen(fs);
      if (!fs) {
        setPresenting(false);
        setBlackout(false);
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) void document.exitFullscreen?.();
    else void el.requestFullscreen?.();
  };
  const togglePresenting = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (presenting) {
      if (document.fullscreenElement === el) void document.exitFullscreen?.();
      else setPresenting(false);
      return;
    }
    setPresenting(true);
    setBlackout(false);
    const now = Date.now();
    setPresentStart(now);
    setClock(now);
    if (document.fullscreenElement !== el) void el.requestFullscreen?.();
  };
  useEffect(() => {
    if (!presenting) return;
    const id = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [presenting]);
  const elapsed = presenting && presentStart ? Math.max(0, clock - presentStart) : 0;
  const elapsedText = `${String(Math.floor(elapsed / 60000)).padStart(2, '0')}:${String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0')}`;

  const current = slides[active];
  const aspect = useMemo(
    () => (current && current.width && current.height ? current.width / current.height : 4 / 3),
    [current],
  );
  const hasAnyNotes = useMemo(() => slides.some((s) => (s.notes || '').trim()), [slides]);
  const currentNotes = (current?.notes || '').trim();

  if (total === 0) {
    const done = failed || pollsExhausted;
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 64, gap: 12 }}>
        {done ? (
          <>
            <Typography.Text type={failed ? 'danger' : 'secondary'} style={{ textAlign: 'center' }}>
              {failed || 'PPT 转换未完成，可下载原文件查看。'}
            </Typography.Text>
            <Space>
              {isStaff && (
                <Button type="primary" loading={reconverting} onClick={() => void retryConversion()}>
                  重新转换
                </Button>
              )}
              {downloadUrl && (
                <Button icon={<DownloadOutlined />} href={downloadUrl} download>
                  下载原文件
                </Button>
              )}
            </Space>
          </>
        ) : (
          <Spin>
            <div style={{ color: 'var(--jz-text-muted)', marginTop: 8 }}>正在转换 PPT…</div>
          </Spin>
        )}
      </div>
    );
  }

  const toolbar = (
    <Space className="jz-pptx-toolbar">
      <Space>
        <Button size="small" icon={<Chevron direction="left" />} aria-label="上一页" title="上一页 (←)" disabled={active <= 0} onClick={() => go(active - 1)} />
        <Typography.Text style={{ minWidth: 60, textAlign: 'center', display: 'inline-block' }}>
          {active + 1} / {total}
        </Typography.Text>
        <Button size="small" icon={<Chevron direction="right" />} aria-label="下一页" title="下一页 (→)" disabled={active >= total - 1} onClick={() => go(active + 1)} />
      </Space>
      <Space>
        <Tooltip title="缩小">
          <Button
            size="small"
            icon={<ZoomOutOutlined />}
            aria-label="缩小"
            disabled={zoom <= 0.5}
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
          />
        </Tooltip>
        <Typography.Text data-testid="pdf-zoom" style={{ minWidth: 48, textAlign: 'center', display: 'inline-block' }}>
          {Math.round(zoom * 100)}%
        </Typography.Text>
        <Tooltip title="放大">
          <Button
            size="small"
            icon={<ZoomInOutlined />}
            aria-label="放大"
            disabled={zoom >= 3}
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))}
          />
        </Tooltip>
        <Popover
          trigger="click"
          open={findOpen}
          onOpenChange={setFindOpen}
          placement="bottomRight"
          getPopupContainer={() => overlayRef.current ?? document.body}
          content={
            <div style={{ width: 320 }}>
              <SearchResults<number>
                placeholder="搜索幻灯片与备注…"
                scanningLabel="正在读取文字…"
                onSearch={searchDeck}
                onJump={(hit) => go(hit.target - 1)}
              />
            </div>
          }
        >
          <Tooltip title="在幻灯片中查找 (Mod+F)">
            <Button size="small" icon={<SearchOutlined />} aria-label="在幻灯片中查找" />
          </Tooltip>
        </Popover>
        <ReaderPaperPicker popupContainer={() => overlayRef.current ?? document.body} />
        {hasAnyNotes && (
          <Tooltip title={showNotes ? '隐藏备注' : '显示备注'}>
            <Button
              size="small"
              type={showNotes ? 'primary' : 'default'}
              icon={<FileTextOutlined />}
              onClick={() => setShowNotes((v) => !v)}
            >
              备注
            </Button>
          </Tooltip>
        )}
        {pdfUrl && pdf.loading && (
          <Tooltip title={pdf.progress != null ? `文字层加载中 ${pdf.progress}%` : '文字层加载中'}>
            <Spin size="small" aria-label="文字层加载中" />
          </Tooltip>
        )}
        {pdfUrl && pdf.error && (
          <Tooltip title={`此 deck 以图片模式显示，无法选字：${pdf.error}`}>
            <Typography.Text type="secondary" style={{ fontSize: 'var(--jz-fs-xs)' }}>
              图片模式
            </Typography.Text>
          </Tooltip>
        )}
        <Tooltip title={fullscreen ? '退出全屏 (Esc)' : '全屏阅读'}>
          <Button
            size="small"
            icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={toggleFullscreen}
          >
            {fullscreen ? '退出全屏' : '全屏'}
          </Button>
        </Tooltip>
        <Tooltip title={withShortcut('演示模式：全屏 + 备注 / 计时 / 下一页预览', 'reader.pptx.present')}>
          <Button size="small" icon={<PlaySquareOutlined />} onClick={togglePresenting} aria-label="演示模式" data-testid="pptx-present">
            演示
          </Button>
        </Tooltip>
        {downloadUrl && (
          <Button size="small" icon={<DownloadOutlined />} href={downloadUrl} download>
            下载原文件
          </Button>
        )}
        {pdfUrl && (
          <Tooltip title="下载 LibreOffice 渲染的 PDF 版（含文字层）">
            <Button size="small" icon={<DownloadOutlined />} href={pdfUrl} download aria-label="下载 PDF 版">
              PDF 版
            </Button>
          </Tooltip>
        )}
      </Space>
    </Space>
  );

  const rail = (
    <div className="jz-pptx-rail" data-fullscreen={fullscreen ? 'true' : undefined}>
      {slides.map((s) => (
        <button
          key={s.index}
          type="button"
          onClick={() => go(s.index)}
          className={'jz-pptx-thumb' + (s.index === active ? ' jz-pptx-thumb-active' : '')}
          aria-label={`第 ${s.index + 1} 页`}
          aria-current={s.index === active}
        >
          <img
            src={s.thumb || s.url}
            alt={`slide ${s.index + 1}`}
            loading="lazy"
            decoding="async"
            // Reserve height from the slide's aspect so a slow/failed thumb never
            // collapses the button to a line before the image decodes.
            style={{ aspectRatio: s.width && s.height ? String(s.width / s.height) : '4 / 3' }}
          />
          <span className="jz-pptx-thumb-num">{s.index + 1}</span>
        </button>
      ))}
    </div>
  );

  // Legacy raster of the active slide — the whole main area for decks without
  // a derived PDF, and the pre-paint placeholder when the PDF text layer is on.
  const slideImage = current ? (
    <img
      src={current.url}
      alt={`slide ${active + 1}`}
      // sync: the image is pre-decoded by the turn (utils/pageTurn.ts) and
      // must paint on the very frame the slide switches.
      decoding="sync"
      className="jz-pptx-slide-img"
      style={{
        width: pdf.doc ? '100%' : `${Math.min(100, 100 * zoom)}%`,
        maxWidth: pdf.doc ? '100%' : `${100 * zoom}%`,
        aspectRatio: String(aspect),
      }}
    />
  ) : null;

  const main = (
    <div ref={mainRef} className="jz-pptx-main" data-paper={paper.key} data-fullscreen={fullscreen ? 'true' : undefined}>
      {current && pdf.doc ? (
        <PdfPageView
          doc={pdf.doc}
          pageNumber={active + 1}
          zoom={zoom}
          visual="image"
          placeholder={slideImage}
          onInternalLink={(dest) => go(dest.page - 1)}
          onAction={(name) => {
            if (name === 'FirstPage') go(0);
            else if (name === 'LastPage') go(total - 1);
            else if (name === 'NextPage') go(active + 1);
            else go(active - 1);
          }}
          className="jz-pptx-main-page"
          // Auto margins (not justify-content) so an over-zoomed page overflows
          // to the scrollbar instead of being clipped on the left.
          style={{ width: `${Math.min(100, 100 * zoom)}%`, margin: '0 auto' }}
        />
      ) : (
        current && slideImage
      )}
    </div>
  );

  const notesPanel = showNotes && hasAnyNotes && (
    <div className="jz-pptx-notes" data-fullscreen={fullscreen ? 'true' : undefined}>
      <div className="jz-pptx-notes-head">
        <FileTextOutlined />
        备注 · 第 {active + 1} 页
      </div>
      {currentNotes ? (
        <Typography.Paragraph className="jz-pptx-notes-body" copyable={{ text: currentNotes }}>
          {currentNotes}
        </Typography.Paragraph>
      ) : (
        <Typography.Text type="secondary">此页无备注</Typography.Text>
      )}
    </div>
  );

  const nextSlide = slides[active + 1];
  const presenterSide = presenting && (
    <aside className="jz-pptx-present-side" aria-label="演示者视图" data-testid="pptx-presenter">
      <div className="jz-pptx-present-top">
        <span className="jz-pptx-present-timer" role="timer" aria-label="已演示时长" data-testid="pptx-timer">
          {elapsedText}
        </span>
        <span className="jz-pptx-present-counter">
          {active + 1} / {total}
        </span>
        <Button size="small" onClick={togglePresenting} aria-label="退出演示">
          退出
        </Button>
      </div>
      <div className="jz-pptx-present-next">
        <div className="jz-pptx-notes-head">下一页</div>
        {nextSlide ? (
          <button type="button" className="jz-pptx-present-next-thumb" onClick={() => go(active + 1)} aria-label={`第 ${active + 2} 页`}>
            <img src={nextSlide.thumb || nextSlide.url} alt="" loading="eager" />
          </button>
        ) : (
          <Typography.Text type="secondary">已是最后一页</Typography.Text>
        )}
      </div>
      <div className="jz-pptx-present-notes">
        <div className="jz-pptx-notes-head">
          <FileTextOutlined />
          备注
        </div>
        {currentNotes ? <div className="jz-pptx-notes-body">{currentNotes}</div> : <Typography.Text type="secondary">此页无备注</Typography.Text>}
      </div>
      <div className="jz-pptx-present-hint">
        <span>
          <Kbd id="reader.pptx.prev" /> <Kbd id="reader.pptx.next" /> 翻页
        </span>
        <span>
          <Kbd id="reader.pptx.blackout" /> 黑屏
        </span>
        <span>
          <Kbd id="reader.pptx.fullscreen-exit" /> 退出
        </span>
      </div>
    </aside>
  );

  const content = presenting ? (
    <div className="jz-pptx-layout">
      {main}
      {presenterSide}
    </div>
  ) : (
    <div className="jz-pptx-layout">
      {rail}
      <div className="jz-pptx-column">
        {main}
        {notesPanel}
      </div>
    </div>
  );

  return (
    <div ref={wrapRef} className="jz-pptx-wrap" data-fullscreen={fullscreen ? 'true' : undefined} data-presenting={presenting ? 'true' : undefined}>
      {toolbar}
      <div className="jz-pptx-body">{content}</div>
      {presenting && blackout && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div className="jz-pptx-blackout" data-testid="pptx-blackout" onClick={() => setBlackout(false)} aria-hidden="true" />
      )}
    </div>
  );
}
