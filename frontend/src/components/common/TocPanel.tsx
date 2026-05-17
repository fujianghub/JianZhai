import { useEffect, useState } from 'react';
import { Button, Tooltip, Typography } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import type { TocEntry } from '@/utils/markdown';

const { Text } = Typography;

interface Props {
  toc: TocEntry[];
  /** Selector for the article body whose headings we observe. */
  articleSelector?: string;
  /** Optional collapse handler; when provided, a close button is shown. */
  onClose?: () => void;
}

/**
 * Sticky right-rail table of contents. Updates the highlighted entry as the
 * reader scrolls; clicking jumps the relevant heading into view.
 */
export default function TocPanel({ toc, articleSelector = '.markdown-preview', onClose }: Props) {
  const [activeId, setActiveId] = useState<string | null>(toc[0]?.id ?? null);

  useEffect(() => {
    if (toc.length === 0) return;
    const root = document.querySelector(articleSelector);
    if (!root) return;
    const ids = new Set(toc.map((t) => t.id));
    const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4'))
      .filter((el): el is HTMLElement => el instanceof HTMLElement && ids.has(el.id));
    if (headings.length === 0) return;

    // Track which headings are visible; the topmost visible one is "active".
    const visible = new Set<string>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        // Pick the first heading (by document order) that's currently visible.
        const firstVisible = headings.find((h) => visible.has(h.id));
        if (firstVisible) setActiveId(firstVisible.id);
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    );
    headings.forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  }, [toc, articleSelector]);

  if (toc.length === 0) return null;

  const click = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Push the fragment so refreshes / back-button preserve position.
      history.replaceState(null, '', `#${id}`);
      setActiveId(id);
    }
  };

  return (
    <nav className="jz-toc" aria-label="目录">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <Text type="secondary" style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>
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
      <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0' }}>
        {toc.map((entry) => (
          <li
            key={entry.id}
            style={{
              paddingLeft: (entry.level - 1) * 12,
              marginBottom: 2,
            }}
          >
            <a
              href={`#${entry.id}`}
              onClick={(e) => click(e, entry.id)}
              className={'jz-toc-link' + (activeId === entry.id ? ' is-active' : '')}
              style={{
                display: 'block',
                padding: '4px 8px',
                fontSize: 13,
                lineHeight: 1.45,
                color: activeId === entry.id ? 'var(--jz-accent)' : 'var(--jz-text-muted)',
                fontWeight: activeId === entry.id ? 600 : 400,
                borderLeft: `2px solid ${activeId === entry.id ? 'var(--jz-accent)' : 'transparent'}`,
                textDecoration: 'none',
                borderRadius: 2,
                transition: 'color 120ms ease, border-color 120ms ease',
              }}
            >
              {entry.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
