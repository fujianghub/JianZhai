import { useEffect, useRef, useState } from 'react';
import { Spin, Tag } from 'antd';
import dayjs from 'dayjs';
import { getDocumentPreview, type DocumentPreview } from '@/api/docs';

interface State {
  id: number;
  anchor: HTMLAnchorElement;
  rect: DOMRect;
  data?: DocumentPreview;
  loading: boolean;
  error?: string;
}

/**
 * Attach hover cards to all <a href="doc:ID"> links inside `containerRef`.
 *
 * Why a single delegated handler instead of one per link: the editor's DOM is
 * rebuilt on every keystroke, so attaching listeners per anchor would leak.
 */
export function useDocLinkHoverCards(containerRef: React.RefObject<HTMLElement | null>) {
  const [hover, setHover] = useState<State | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const showTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    function parseDocId(href: string | null): number | null {
      if (!href) return null;
      const m = href.match(/^doc:(\d+)/);
      return m ? Number(m[1]) : null;
    }

    function clearTimers() {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      if (showTimerRef.current) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    }

    function onMouseOver(e: MouseEvent) {
      const a = (e.target as HTMLElement).closest?.('a[href^="doc:"]') as HTMLAnchorElement | null;
      if (!a) return;
      const id = parseDocId(a.getAttribute('href'));
      if (id == null) return;
      clearTimers();
      showTimerRef.current = window.setTimeout(async () => {
        const rect = a.getBoundingClientRect();
        setHover({ id, anchor: a, rect, loading: true });
        try {
          const data = await getDocumentPreview(id);
          setHover((prev) => (prev && prev.id === id ? { ...prev, data, loading: false } : prev));
        } catch (err) {
          setHover((prev) =>
            prev && prev.id === id
              ? { ...prev, loading: false, error: err instanceof Error ? err.message : '加载失败' }
              : prev
          );
        }
      }, 300);
    }

    function onMouseOut(e: MouseEvent) {
      const related = e.relatedTarget as HTMLElement | null;
      // Don't dismiss when moving into the card itself
      if (related?.closest?.('.jz-doc-hover-card')) return;
      const a = (e.target as HTMLElement).closest?.('a[href^="doc:"]');
      if (!a) return;
      if (showTimerRef.current) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      hideTimerRef.current = window.setTimeout(() => setHover(null), 200);
    }

    root.addEventListener('mouseover', onMouseOver);
    root.addEventListener('mouseout', onMouseOut);
    return () => {
      root.removeEventListener('mouseover', onMouseOver);
      root.removeEventListener('mouseout', onMouseOut);
      clearTimers();
    };
  }, [containerRef]);

  return { hover, setHover };
}

export function DocHoverCard({
  state,
  onClose,
}: {
  state: State;
  onClose: () => void;
}) {
  const { rect, data, loading, error } = state;
  const CARD_W = 320;
  const vw = window.innerWidth;
  const left = Math.min(Math.max(8, rect.left), vw - CARD_W - 8);
  const top = rect.bottom + 6;

  return (
    <div
      className="jz-doc-hover-card"
      role="tooltip"
      style={{
        position: 'fixed',
        left,
        top,
        width: CARD_W,
        zIndex: 1100,
        background: 'var(--jz-surface)',
        border: '1px solid var(--jz-border)',
        borderRadius: 6,
        padding: '12px 14px',
        boxShadow: 'var(--glass-shadow-soft, 0 6px 24px rgba(0,0,0,0.12))',
        fontSize: 13,
        color: 'var(--jz-text)',
      }}
      onMouseEnter={() => {/* keep open */}}
      onMouseLeave={onClose}
    >
      {loading && (
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <Spin size="small" />
        </div>
      )}
      {error && <div style={{ color: 'var(--jz-danger, #cf1322)' }}>预览失败：{error}</div>}
      {data && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Tag
              color={data.knowledge_base.accent_color || 'blue'}
              style={{ marginRight: 0, fontSize: 11 }}
            >
              {data.knowledge_base.name}
            </Tag>
            {data.visibility === 'public' ? (
              <Tag color="green" style={{ marginRight: 0, fontSize: 11 }}>公开</Tag>
            ) : (
              <Tag style={{ marginRight: 0, fontSize: 11 }}>私密</Tag>
            )}
          </div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{data.title}</div>
          <div
            style={{
              color: 'var(--jz-text-muted)',
              fontSize: 12,
              lineHeight: 1.5,
              maxHeight: 64,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {data.excerpt || '（暂无摘要）'}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--jz-text-muted)' }}>
            更新于 {dayjs(data.updated_at).format('YYYY-MM-DD HH:mm')}
          </div>
        </>
      )}
    </div>
  );
}
