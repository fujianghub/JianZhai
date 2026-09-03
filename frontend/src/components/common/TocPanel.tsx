/**
 * Sticky right-rail table of contents for Markdown (and Docx-imported)
 * articles. Presentation follows the shared 目录设置 prefs (site defaults
 * from /admin/toc + this device's overrides, ``useTocPrefs('article')``) and
 * reuses the EPUB / KB rail's ``.jz-epub-toc-*`` CSS — single-line ellipsis by
 * default, weight-only hierarchy, soft accent fill on the active row.
 */
import { useEffect, useMemo, useState } from 'react';
import { Input, Tooltip, Typography } from 'antd';
import { CloseOutlined, SearchOutlined } from '@ant-design/icons';
import type { TocEntry } from '@/utils/markdown';
import { relativeTocLevel, tocFontFamily } from '@/utils/tocPrefs';
import { useTocPrefs } from '@/stores/tocSettings';
import TocSettingsPopover from './TocSettingsPopover';
import IconButton from '@/components/common/IconButton';

const { Text } = Typography;

interface Props {
  toc: TocEntry[];
  /** Selector for the article body whose headings we observe. */
  articleSelector?: string;
  /** Optional collapse handler; when provided, a close button is shown. */
  onClose?: () => void;
  /** Hide the built-in 目录 header (a wrapping panel renders its own). */
  hideHeader?: boolean;
}

export default function TocPanel({ toc, articleSelector = '.markdown-preview', onClose, hideHeader }: Props) {
  const [activeId, setActiveId] = useState<string | null>(toc[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const { prefs, update, reset, overridden } = useTocPrefs('article');

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
        const firstVisible = headings.find((h) => visible.has(h.id));
        if (firstVisible) setActiveId(firstVisible.id);
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    );
    headings.forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  }, [toc, articleSelector]);

  const minLevel = useMemo(() => toc.reduce((m, e) => Math.min(m, e.level), 6), [toc]);
  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      toc
        .map((entry) => ({ entry, rel: relativeTocLevel(entry.level, minLevel) }))
        .filter(({ rel }) => rel <= prefs.depth)
        .filter(({ entry }) => !q || entry.text.toLowerCase().includes(q) || (entry.numbering ?? '').includes(q)),
    [toc, minLevel, prefs.depth, q],
  );

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
    <nav
      className="jz-epub-toc jz-article-toc"
      aria-label="目录"
      data-density={prefs.density}
      data-size={prefs.size}
      data-wrap={prefs.wrap ? 'on' : 'off'}
      data-font={prefs.font}
      data-color={prefs.color}
      data-weight={prefs.weight}
      style={{ ['--jz-font-toc' as string]: tocFontFamily(prefs.font) } as React.CSSProperties}
    >
      {!hideHeader && (
        <div className="jz-article-toc-head">
          <Text type="secondary" style={{ fontSize: 'var(--jz-fs-2xs)', letterSpacing: 1, textTransform: 'uppercase' }}>
            目录
          </Text>
          {onClose && (
            <Tooltip title="隐藏目录">
              <IconButton icon={<CloseOutlined />} onClick={onClose} aria-label="隐藏目录" />
            </Tooltip>
          )}
        </div>
      )}
      <div className="jz-epub-toc-tools">
        {toc.length > 12 ? (
          <Input
            size="small"
            allowClear
            variant="filled"
            prefix={<SearchOutlined className="jz-epub-toc-filter-icon" />}
            placeholder={`筛选（${toc.length} 条）`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="jz-epub-toc-filter"
            aria-label="筛选目录"
          />
        ) : (
          <span style={{ flex: 1 }} />
        )}
        <TocSettingsPopover
          prefs={prefs}
          onChange={update}
          onReset={reset}
          overridden={overridden}
          features={{ depth: true, numbers: true }}
          tooltip="目录设置：间距 / 字号 / 字体 / 颜色 / 层级 / 换行 / 编号"
        />
      </div>
      <ul className="jz-epub-toc-list">
        {rows.map(({ entry, rel }) => {
          const active = activeId === entry.id;
          return (
            <li
              key={entry.id}
              className={`jz-epub-toc-item is-l${rel}`}
              style={{ ['--jz-toc-depth' as string]: rel - 1 } as React.CSSProperties}
            >
              <a
                href={`#${entry.id}`}
                onClick={(e) => click(e, entry.id)}
                className={'jz-epub-toc-link jz-toc-link' + (active ? ' is-active' : '')}
                aria-current={active ? 'true' : undefined}
                title={entry.text}
              >
                {prefs.numbers && entry.numbering ? <span className="jz-epub-toc-num">{entry.numbering}</span> : null}
                <span className="jz-epub-toc-text">{entry.text}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
