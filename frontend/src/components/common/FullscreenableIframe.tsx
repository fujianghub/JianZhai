import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Tooltip } from 'antd';
import { FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons';

interface Props {
  src: string;
  title: string;
  /** Style applied to the iframe in inline (non-fullscreen) mode. */
  inlineStyle?: React.CSSProperties;
  sandbox?: string;
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
  /** Where to anchor the fullscreen button. Defaults to top-right of the wrapper. */
  buttonOffset?: { top?: number; right?: number };
  /** Extra controls rendered alongside the fullscreen button (e.g., a Download link). */
  extraControls?: React.ReactNode;
}

/**
 * Wraps an iframe with a fullscreen toggle. Click the button to expand the
 * iframe to a viewport-covering overlay; ESC exits.
 *
 * The fullscreen overlay is portaled into `document.body` so it escapes any
 * ancestor with `transform`, `filter`, or `perspective` set — those create
 * a containing block for `position: fixed` descendants and would otherwise
 * trap the overlay inside the article column.
 */
export default function FullscreenableIframe({
  src,
  title,
  inlineStyle,
  sandbox = 'allow-scripts',
  referrerPolicy = 'no-referrer',
  buttonOffset = { top: 8, right: 8 },
  extraControls,
}: Props) {
  const [fs, setFs] = useState(false);

  // An empty/undefined src resolves to the parent page URL (the SPA root). With
  // a sandbox that lacks `allow-same-origin` the frame's origin is opaque, so
  // loading the app origin trips Chromium's "Unsafe attempt to load URL
  // http://localhost:3001/ from frame with URL chrome-error://chromewebdata/"
  // guard. Fall back to about:blank until a real URL arrives.
  const frameSrc = src || 'about:blank';

  useEffect(() => {
    if (!fs) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFs(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [fs]);

  const controls = (
    <div
      style={{
        position: 'absolute',
        top: buttonOffset.top ?? 8,
        right: buttonOffset.right ?? 8,
        zIndex: 5,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
      }}
    >
      {extraControls}
      <Tooltip title={fs ? '退出全屏（Esc）' : '全屏预览'}>
        <Button
          size="small"
          icon={fs ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
          onClick={() => setFs((v) => !v)}
        >
          {fs ? '退出全屏' : '全屏'}
        </Button>
      </Tooltip>
    </div>
  );

  if (fs) {
    return createPortal(
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2000,
          background: 'var(--jz-bg-app, #0b0d11)',
        }}
      >
        {controls}
        <iframe
          title={title}
          src={frameSrc}
          sandbox={sandbox}
          referrerPolicy={referrerPolicy}
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      </div>,
      document.body,
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {controls}
      <iframe
        title={title}
        src={frameSrc}
        sandbox={sandbox}
        referrerPolicy={referrerPolicy}
        style={inlineStyle}
      />
    </div>
  );
}
