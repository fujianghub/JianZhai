/**
 * Youdao-style PPT/PPTX reader. Slides are pre-rendered server-side (LibreOffice
 * → PDF → per-page PNG) and delivered as an ordered image list, so this is a
 * pure image viewer — no client-side pptx parsing.
 *
 * Layout mirrors the PDF reader's ergonomics: a thumbnail rail on the left, the
 * active slide filling the main column, a sticky toolbar (prev/next, page
 * counter, zoom, fullscreen, download) and keyboard nav (←/→ / PageUp/Down).
 * While the server is still converting the deck the slide list is empty; we show
 * a "转换中" placeholder and poll until slides appear.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Space, Spin, Tooltip, Typography } from 'antd';
import {
  DownloadOutlined,
  FileTextOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  LeftOutlined,
  RightOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import { fetchPostSlides } from '@/api/blog';
import type { Slide, SlideStatus } from '@/types';

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
}: Props) {
  const [slides, setSlides] = useState<Slide[]>(initial);
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  const [pollsExhausted, setPollsExhausted] = useState(false);
  // Set once the conversion is known to have permanently failed — stops the
  // poll loop and shows the real reason instead of a forever-spinning "转换中".
  const [failed, setFailed] = useState<string | null>(
    status === 'failed' ? error || 'PPT 转换失败' : null,
  );
  const mainRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSlides(initial);
  }, [initial]);

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
  const go = useCallback(
    (n: number) => {
      setActive((cur) => {
        const next = clamp(n);
        if (next !== cur) mainRef.current?.scrollTo({ top: 0 });
        return next;
      });
    },
    [clamp],
  );

  // Keyboard navigation (scoped to when this reader is mounted).
  useEffect(() => {
    if (total === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        go(active + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        go(active - 1);
      } else if (e.key === 'Escape' && fullscreen) {
        setFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, total, go, fullscreen]);

  // Lock body scroll while fullscreen.
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

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
            {downloadUrl && (
              <Button icon={<DownloadOutlined />} href={downloadUrl} download>
                下载原文件
              </Button>
            )}
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
    <Space
      style={{
        marginBottom: 8,
        padding: '4px 12px',
        background: 'var(--jz-surface-2)',
        borderRadius: 6,
        width: '100%',
        justifyContent: 'space-between',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        position: 'sticky',
        top: 0,
        zIndex: 5,
      }}
    >
      <Space>
        <Button size="small" icon={<LeftOutlined />} disabled={active <= 0} onClick={() => go(active - 1)} />
        <Typography.Text style={{ minWidth: 60, textAlign: 'center', display: 'inline-block' }}>
          {active + 1} / {total}
        </Typography.Text>
        <Button size="small" icon={<RightOutlined />} disabled={active >= total - 1} onClick={() => go(active + 1)} />
      </Space>
      <Space>
        <Tooltip title="缩小">
          <Button
            size="small"
            icon={<ZoomOutOutlined />}
            disabled={zoom <= 0.5}
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
          />
        </Tooltip>
        <Typography.Text style={{ minWidth: 48, textAlign: 'center', display: 'inline-block' }}>
          {Math.round(zoom * 100)}%
        </Typography.Text>
        <Tooltip title="放大">
          <Button
            size="small"
            icon={<ZoomInOutlined />}
            disabled={zoom >= 3}
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))}
          />
        </Tooltip>
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
        <Tooltip title={fullscreen ? '退出全屏 (Esc)' : '全屏阅读'}>
          <Button
            size="small"
            icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={() => setFullscreen((v) => !v)}
          >
            {fullscreen ? '退出全屏' : '全屏'}
          </Button>
        </Tooltip>
        {downloadUrl && (
          <Button size="small" icon={<DownloadOutlined />} href={downloadUrl} download>
            下载原文件
          </Button>
        )}
      </Space>
    </Space>
  );

  const rail = (
    <div
      className="jz-pptx-rail"
      style={{
        width: 160,
        flexShrink: 0,
        maxHeight: fullscreen ? 'calc(100vh - 80px)' : 'min(80vh, 900px)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        paddingRight: 6,
      }}
    >
      {slides.map((s) => (
        <button
          key={s.index}
          type="button"
          onClick={() => go(s.index)}
          className={'jz-pptx-thumb' + (s.index === active ? ' jz-pptx-thumb-active' : '')}
          style={{
            display: 'block',
            width: '100%',
            // The rail is a bounded flex-column; without this the ~90 thumbs get
            // shrunk to a few px each (flex-shrink defaults to 1) and collapse into
            // a stack of thin lines instead of scrolling. Keep natural height, let
            // the rail's overflowY handle the overflow.
            flexShrink: 0,
            padding: 0,
            border:
              s.index === active
                ? '2px solid var(--jz-accent, #1677ff)'
                : '1px solid var(--jz-border)',
            borderRadius: 6,
            overflow: 'hidden',
            cursor: 'pointer',
            background: '#fff',
            position: 'relative',
            lineHeight: 0,
          }}
          aria-label={`第 ${s.index + 1} 页`}
          aria-current={s.index === active}
        >
          <img
            src={s.thumb || s.url}
            alt={`slide ${s.index + 1}`}
            loading="lazy"
            decoding="async"
            style={{
              width: '100%',
              display: 'block',
              // Reserve height from the slide's aspect so a slow/failed thumb never
              // collapses the button to a line before the image decodes.
              aspectRatio: s.width && s.height ? String(s.width / s.height) : '4 / 3',
              objectFit: 'cover',
            }}
          />
          <span
            style={{
              position: 'absolute',
              bottom: 2,
              right: 4,
              fontSize: 11,
              color: '#fff',
              background: 'rgba(0,0,0,0.55)',
              borderRadius: 4,
              padding: '0 5px',
              lineHeight: '16px',
            }}
          >
            {s.index + 1}
          </span>
        </button>
      ))}
    </div>
  );

  const main = (
    <div
      ref={mainRef}
      style={{
        flex: 1,
        minWidth: 0,
        overflow: 'auto',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        background: 'var(--jz-surface-2)',
        borderRadius: 8,
        padding: 16,
        maxHeight: fullscreen ? 'calc(100vh - 80px)' : undefined,
      }}
    >
      {current && (
        <img
          src={current.url}
          alt={`slide ${active + 1}`}
          decoding="async"
          style={{
            width: `${Math.min(100, 100 * zoom)}%`,
            maxWidth: `${100 * zoom}%`,
            aspectRatio: String(aspect),
            objectFit: 'contain',
            background: '#fff',
            boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
            borderRadius: 4,
          }}
        />
      )}
    </div>
  );

  const notesPanel = showNotes && hasAnyNotes && (
    <div
      className="jz-pptx-notes"
      style={{
        background: 'var(--jz-surface-2)',
        border: '1px solid var(--jz-border)',
        borderRadius: 8,
        padding: '10px 14px',
        maxHeight: fullscreen ? '28vh' : 260,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--jz-text-muted)',
          marginBottom: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <FileTextOutlined />
        备注 · 第 {active + 1} 页
      </div>
      {currentNotes ? (
        <Typography.Paragraph
          style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.7 }}
          copyable={{ text: currentNotes }}
        >
          {currentNotes}
        </Typography.Paragraph>
      ) : (
        <Typography.Text type="secondary">此页无备注</Typography.Text>
      )}
    </div>
  );

  const content = (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minHeight: 0 }}>
      {rail}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
        {main}
        {notesPanel}
      </div>
    </div>
  );

  if (fullscreen) {
    return createPortal(
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2000,
          background: 'var(--jz-bg-app, #0b0d11)',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {toolbar}
        <div style={{ flex: 1, minHeight: 0 }}>{content}</div>
      </div>,
      document.body,
    );
  }

  return (
    <div>
      {toolbar}
      {content}
    </div>
  );
}
