/**
 * PDF renderer using pdfjs-dist — fully client-side canvas rendering so it does
 * NOT depend on the browser having a built-in PDF viewer (headless Chromium,
 * some corporate browsers, and mobile browsers all fail iframe-PDF in various
 * ways; pdfjs always works).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Alert, Button, Space, Spin, Tooltip, Typography } from 'antd';
import {
  DownloadOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  LeftOutlined,
  RightOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

// In dev, bypass Vite's HTTP proxy by talking to the backend directly. The
// proxy (node-http-proxy under the hood) was observed scrambling responses
// when the same URL was fetched concurrently — Django logged 4× 200 with the
// full body, but pdf.js received a 204. Going direct sidesteps that path
// entirely. Django sets `Access-Control-Allow-Origin: http://localhost:3001`
// and `…-Allow-Credentials: true`, so cross-origin credentialed XHR is OK.
const DEV_BACKEND_ORIGIN: string | null = (() => {
  if (!import.meta.env.DEV) return null;
  try {
    const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
    return new URL(base ?? 'http://localhost:8002/api/v1').origin;
  } catch {
    return 'http://localhost:8002';
  }
})();

function resolveBackendUrl(url: string): string {
  if (!DEV_BACKEND_ORIGIN) return url;
  if (/^https?:\/\//.test(url)) return url;
  if (url.startsWith('/')) return DEV_BACKEND_ORIGIN + url;
  return url;
}

interface Props {
  url: string;
  height?: number | string;
}

export default function PdfCanvas({ url, height = 'min(calc(100vh - 200px), 1100px)' }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  /** Manual zoom multiplier applied on top of fit-to-width.
   * 1 = fit the visible width; bumped via the +/- buttons. */
  const [zoom, setZoom] = useState(1);

  // Lock body scroll while the fullscreen overlay is up, and exit on ESC.
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [fullscreen]);

  // Resolve to backend-direct URL in dev (see DEV_BACKEND_ORIGIN above) and
  // append a per-mount nonce to defeat any stale `(204)` entry the browser
  // disk cache might have from earlier sessions.
  const fetchUrl = useMemo(() => {
    const resolved = resolveBackendUrl(url);
    return resolved + (resolved.includes('?') ? '&' : '?') + '_=' + Date.now();
  }, [url]);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjs.getDocument> | null = null;
    setLoading(true);
    setErr(null);
    setDoc(null);
    setPage(1);
    (async () => {
      try {
        // Fetch the bytes ourselves so we control credentials/CORS exactly.
        // pdf.js's internal XHR layer was inconsistent here: on cross-origin
        // fetches to the dev backend it would surface as "Failed to fetch"
        // even when curl saw a clean 200 + CORS headers.
        const resp = await fetch(fetchUrl, {
          credentials: 'include',
          mode: 'cors',
        });
        if (cancelled) return;
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const buf = await resp.arrayBuffer();
        if (cancelled) return;
        if (buf.byteLength === 0) {
          throw new Error('服务器返回空内容，请刷新重试');
        }
        loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf) });
        const d = await loadingTask.promise;
        if (cancelled) {
          void d.destroy();
          return;
        }
        setDoc(d);
        setPageCount(d.numPages);
        setLoading(false);
      } catch (e: unknown) {
        if (cancelled) return;
        setErr((e as Error)?.message || 'PDF 加载失败');
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      loadingTask?.destroy?.();
    };
  }, [fetchUrl]);

  // Render the current page to the container.
  useEffect(() => {
    if (!doc || !containerRef.current) return;
    let cancelled = false;
    let cleanup = () => {};
    (async () => {
      try {
        const p = await doc.getPage(page);
        if (cancelled || !containerRef.current) return;
        // In fullscreen the visible width is the viewport; otherwise cap to a
        // comfortable reading width (1000px in inline, 1400px in fullscreen).
        const maxWidth = fullscreen ? 1400 : 1000;
        const cssWidth = Math.min(containerRef.current.clientWidth, maxWidth) * zoom;
        const baseVp = p.getViewport({ scale: 1 });
        const scale = (cssWidth / baseVp.width) * (window.devicePixelRatio || 1);
        const viewport = p.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / (window.devicePixelRatio || 1)}px`;
        canvas.style.height = `${viewport.height / (window.devicePixelRatio || 1)}px`;
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto';
        canvas.style.background = '#fff';
        canvas.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)';
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        // Replace previous canvas
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(canvas);
        const task = p.render({ canvasContext: ctx, viewport, canvas });
        cleanup = () => task.cancel();
        await task.promise;
      } catch (e: unknown) {
        if ((e as { name?: string })?.name === 'RenderingCancelledException') return;
        if (!cancelled) setErr((e as Error)?.message || '页面渲染失败');
      }
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [doc, page, zoom, fullscreen]);

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
      }}
    >
      <Space>
        <Button
          size="small"
          icon={<LeftOutlined />}
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        />
        <Typography.Text style={{ minWidth: 60, textAlign: 'center', display: 'inline-block' }}>
          {page} / {pageCount || '?'}
        </Typography.Text>
        <Button
          size="small"
          icon={<RightOutlined />}
          disabled={page >= pageCount}
          onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
        />
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
        <Tooltip title={fullscreen ? '退出全屏 (Esc)' : '全屏阅读'}>
          <Button
            size="small"
            icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={() => setFullscreen((v) => !v)}
          >
            {fullscreen ? '退出全屏' : '全屏'}
          </Button>
        </Tooltip>
        <Button
          size="small"
          icon={<DownloadOutlined />}
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          下载原文件
        </Button>
      </Space>
    </Space>
  );

  const body = (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: fullscreen ? 'calc(100vh - 64px)' : height,
        overflow: 'auto',
        padding: 16,
        background: 'var(--jz-surface-2)',
        borderRadius: 8,
      }}
    />
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
        {err && <Alert type="error" message={`PDF 加载失败：${err}`} showIcon />}
        {loading && !err && (
          <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
            <Spin />
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0 }}>{body}</div>
      </div>,
      document.body,
    );
  }

  return (
    <div>
      {toolbar}
      {err && <Alert type="error" message={`PDF 加载失败：${err}`} showIcon />}
      {loading && !err && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
          <Spin>
            <div style={{ color: 'var(--jz-text-muted)', marginTop: 8 }}>加载 PDF 中...</div>
          </Spin>
        </div>
      )}
      {body}
    </div>
  );
}
