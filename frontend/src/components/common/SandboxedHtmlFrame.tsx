import { useLayoutEffect, useRef, type CSSProperties } from 'react';

/**
 * 沙箱 HTML 帧 —— `<iframe srcdoc>` 的替代品。
 *
 * srcdoc / about:blank / blob: 文档继承父页 CSP：生产站点级 `script-src 'self'`
 * 会拦掉 HtmlPostReader 注入的高度上报脚本与作者自己的内联脚本（2026-09-23
 * Playwright 实测复现）。这里改为加载同源静态宿主页 `/embed/html-frame.html`
 * （`frontend/public/embed/`），它由 Caddy 单独下发宽松 CSP；宿主页就绪后
 * 父页经 postMessage 送入整份 HTML，宿主页 `document.write` 覆写自身。
 *
 * 安全模型不变：iframe 仍无 `allow-same-origin`（不透明源），作者脚本碰不到
 * 父页 cookie / DOM；宿主页只接受 `window.parent` 的消息。
 *
 * `html` 变化 = 重建 iframe（与 srcdoc 每次变化重新解析文档等价）。
 */
export const HTML_FRAME_URL = '/embed/html-frame.html';
export const HTML_FRAME_READY = 'jz-html-frame-ready';
export const HTML_FRAME_LOAD = 'jz-html-frame';
export const DEFAULT_HTML_SANDBOX = 'allow-scripts allow-popups allow-forms';

interface Props {
  /** 完整 HTML（调用方负责注入 `<base>` / bootstrap）。 */
  html: string;
  title: string;
  sandbox?: string;
  className?: string;
  style?: CSSProperties;
  scrolling?: 'auto' | 'yes' | 'no';
  loading?: 'lazy' | 'eager';
  /** 拿到 iframe 元素（父页据此校验 postMessage 来源、计算位置）。 */
  iframeRef?: (el: HTMLIFrameElement | null) => void;
}

export default function SandboxedHtmlFrame({
  html,
  title,
  sandbox = DEFAULT_HTML_SANDBOX,
  className,
  style,
  scrolling,
  loading,
  iframeRef,
}: Props) {
  const elRef = useRef<HTMLIFrameElement | null>(null);
  const htmlRef = useRef(html);
  htmlRef.current = html;

  // html 变化 → key 递增 → iframe 重建。渲染期读写 ref 在 StrictMode 双渲染下
  // 也稳定（第二次渲染看到 lastHtml === html 不再递增）。
  const genRef = useRef(0);
  const lastHtmlRef = useRef<string | undefined>(undefined);
  if (lastHtmlRef.current !== html) {
    lastHtmlRef.current = html;
    genRef.current += 1;
  }

  // useLayoutEffect, not useEffect: the listener must exist before the host
  // page can post ``ready``. A cached same-origin host page loads fast enough
  // that a passive effect (after paint) can miss the message — seen in the
  // production-replica smoke on the second page visited. Layout effects run
  // synchronously in the commit task; iframe navigation can never complete
  // inside that task, so the listener is always first. The host script also
  // re-posts ``ready`` until it receives the HTML, as belt and braces.
  useLayoutEffect(() => {
    function onMessage(e: MessageEvent) {
      const win = elRef.current?.contentWindow;
      if (!win || e.source !== win) return;
      const d = e.data as { type?: string } | null;
      if (!d || typeof d !== 'object' || d.type !== HTML_FRAME_READY) return;
      win.postMessage({ type: HTML_FRAME_LOAD, html: htmlRef.current }, '*');
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const setRef = (el: HTMLIFrameElement | null) => {
    elRef.current = el;
    iframeRef?.(el);
  };

  return (
    <iframe
      key={genRef.current}
      ref={setRef}
      title={title}
      src={HTML_FRAME_URL}
      sandbox={sandbox}
      className={className}
      style={style}
      scrolling={scrolling}
      loading={loading}
    />
  );
}
