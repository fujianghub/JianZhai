import { useEffect, useMemo, useState } from 'react';
import { Button, Tooltip, Typography } from 'antd';
import { CloseOutlined } from '@ant-design/icons';

import type { HtmlHeading } from './HtmlPostReader';

const { Text } = Typography;

const SHALLOW_MAX_LEVEL = 3;
const LONG_TOC_HINT = 80;

interface Props {
  headings: HtmlHeading[];
  /** Iframe whose document contains the headings — used to translate each
   *  heading's iframe-relative ``top`` into an absolute parent-page Y. */
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onClose?: () => void;
  /** Pixels of breathing room above the heading after a click jump.
   *  Matches the existing TocPanel's perceived margin. */
  scrollOffset?: number;
}

/**
 * Sibling of [`TocPanel`](frontend/src/components/common/TocPanel.tsx) for the
 * HTML-document case. Keeps the same visual + classNames so the right rail
 * looks identical between MD and HTML posts. The behavioural difference:
 * headings live inside a sandboxed iframe (no ``allow-same-origin``) so we
 * can't observe them with ``IntersectionObserver`` on the parent page. We
 * instead use the absolute Y offsets reported by the iframe bootstrap
 * (HtmlPostReader) for both click-scroll and active-state tracking.
 */
export default function HtmlTocPanel({
  headings,
  iframeRef,
  onClose,
  scrollOffset = 80,
}: Props) {
  const deepHeadings = useMemo(
    () => headings.filter((h) => h.level > SHALLOW_MAX_LEVEL),
    [headings],
  );
  const shallowHeadings = useMemo(
    () => headings.filter((h) => h.level <= SHALLOW_MAX_LEVEL),
    [headings],
  );
  const [showDeep, setShowDeep] = useState(false);

  const displayHeadings = useMemo(() => {
    if (showDeep || deepHeadings.length === 0) return headings;
    if (shallowHeadings.length > 0) return shallowHeadings;
    return headings;
  }, [showDeep, headings, deepHeadings.length, shallowHeadings]);

  const [activeId, setActiveId] = useState<string | null>(headings[0]?.id ?? null);

  useEffect(() => {
    setActiveId(headings[0]?.id ?? null);
  }, [headings]);

  // Active-state tracking uses the full heading list (including collapsed deep).
  useEffect(() => {
    if (headings.length === 0) return;
    let raf = 0;

    const update = () => {
      raf = 0;
      const iframeEl = iframeRef.current;
      const iframeTop = iframeEl
        ? iframeEl.getBoundingClientRect().top + window.pageYOffset
        : 0;
      const probe = window.pageYOffset + scrollOffset + 1;
      let current: string | null = headings[0]?.id ?? null;
      for (const h of headings) {
        const absTop = iframeTop + (h.top || 0);
        if (absTop <= probe) current = h.id;
        else break;
      }
      if (current) setActiveId(current);
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [headings, iframeRef, scrollOffset]);

  if (headings.length === 0) return null;

  const click = (e: React.MouseEvent, h: HtmlHeading) => {
    e.preventDefault();
    const iframeEl = iframeRef.current;
    if (iframeEl) {
      const iframeTop = iframeEl.getBoundingClientRect().top + window.pageYOffset;
      window.scrollTo({
        top: Math.max(0, iframeTop + (h.top || 0) - scrollOffset),
        behavior: 'smooth',
      });
      try {
        iframeEl.contentWindow?.postMessage({ type: 'jz-scroll-to', id: h.id }, '*');
      } catch {
        /* sandboxed cross-origin postMessage may throw on some browsers */
      }
    }
    history.replaceState(null, '', `#${h.id}`);
    setActiveId(h.id);
  };

  const showDeepToggle = deepHeadings.length > 0 && shallowHeadings.length > 0;

  return (
    <nav className="jz-toc" aria-label="目录">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
        }}
      >
        <Text
          type="secondary"
          style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}
        >
          目录
        </Text>
        {onClose && (
          <Tooltip title="隐藏目录">
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={onClose}
              aria-label="隐藏目录"
            />
          </Tooltip>
        )}
      </div>
      {!showDeep && headings.length >= LONG_TOC_HINT && (
        <Text type="secondary" style={{ display: 'block', fontSize: 11, marginTop: 6 }}>
          目录较长，已折叠 h4–h6 标题
        </Text>
      )}
      {showDeepToggle && (
        <Button
          type="link"
          size="small"
          style={{ padding: '4px 0 0', height: 'auto', fontSize: 12 }}
          onClick={() => setShowDeep((v) => !v)}
        >
          {showDeep ? '收起 h4–h6' : `显示 h4–h6（${deepHeadings.length}）`}
        </Button>
      )}
      <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0' }}>
        {displayHeadings.map((h) => (
          <li
            key={h.id}
            style={{
              paddingLeft: (h.level - 1) * 12,
              marginBottom: 2,
            }}
          >
            <a
              href={`#${h.id}`}
              onClick={(e) => click(e, h)}
              className={'jz-toc-link' + (activeId === h.id ? ' is-active' : '')}
              style={{
                display: 'block',
                padding: '4px 8px',
                fontSize: 13,
                lineHeight: 1.45,
                color:
                  activeId === h.id
                    ? 'var(--jz-doc-accent, var(--jz-accent))'
                    : 'var(--jz-text-muted)',
                fontWeight: activeId === h.id ? 600 : 400,
                borderLeft: `2px solid ${
                  activeId === h.id
                    ? 'var(--jz-doc-accent, var(--jz-accent))'
                    : 'transparent'
                }`,
                textDecoration: 'none',
                borderRadius: 2,
                transition: 'color 120ms ease, border-color 120ms ease',
              }}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
