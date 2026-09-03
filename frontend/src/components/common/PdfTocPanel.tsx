/**
 * Table-of-contents sidebar for a PDF's embedded bookmarks. Unlike the Markdown
 * TocPanel (which observes DOM headings), the PDF reader paints one canvas page
 * at a time, so clicking jumps the page and the active entry is computed as the
 * last bookmark whose page is at or before the current page. Presentation
 * follows the same 目录设置 prefs as the article rail (``useTocPrefs('article')``).
 */
import { useMemo, useState } from 'react';
import { Input, Tooltip, Typography } from 'antd';
import { CloseOutlined, SearchOutlined } from '@ant-design/icons';
import type { PdfTocEntry } from '@/utils/pdfOutline';
import { relativeTocLevel, tocFontFamily } from '@/utils/tocPrefs';
import { useTocPrefs } from '@/stores/tocSettings';
import TocSettingsPopover from './TocSettingsPopover';
import IconButton from '@/components/common/IconButton';

const { Text } = Typography;

interface Props {
  entries: PdfTocEntry[];
  /** 1-based page currently shown in the canvas. */
  currentPage: number;
  /** Jump the renderer to a 1-based page. */
  onJump: (page: number) => void;
  /** Optional collapse handler; when provided, a close button is shown. */
  onClose?: () => void;
  /** Stick the rail to the top while the page scrolls (flow mode). */
  sticky?: boolean;
}

export default function PdfTocPanel({ entries, currentPage, onJump, onClose, sticky }: Props) {
  const [query, setQuery] = useState('');
  const { prefs, update, reset, overridden } = useTocPrefs('article');

  // Active = the last resolvable bookmark that starts on or before this page.
  const activeKey = useMemo(() => {
    let key: string | null = null;
    for (const e of entries) {
      if (e.page != null && e.page <= currentPage) key = e.key;
    }
    return key;
  }, [entries, currentPage]);

  const minLevel = useMemo(() => entries.reduce((m, e) => Math.min(m, e.level), 6), [entries]);
  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      entries
        .map((entry) => ({ entry, rel: relativeTocLevel(entry.level, minLevel) }))
        .filter(({ rel }) => rel <= prefs.depth)
        .filter(({ entry }) => !q || entry.title.toLowerCase().includes(q)),
    [entries, minLevel, prefs.depth, q],
  );

  if (entries.length === 0) return null;

  return (
    <nav
      className={'jz-epub-toc jz-article-toc jz-pdf-toc' + (sticky ? ' jz-pdf-toc--sticky' : '')}
      aria-label="PDF 目录"
      data-density={prefs.density}
      data-size={prefs.size}
      data-wrap={prefs.wrap ? 'on' : 'off'}
      data-font={prefs.font}
      data-color={prefs.color}
      data-weight={prefs.weight}
      style={{ ['--jz-font-toc' as string]: tocFontFamily(prefs.font) } as React.CSSProperties}
    >
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
      <div className="jz-epub-toc-tools">
        {entries.length > 12 ? (
          <Input
            size="small"
            allowClear
            variant="filled"
            prefix={<SearchOutlined className="jz-epub-toc-filter-icon" />}
            placeholder={`筛选（${entries.length} 条）`}
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
          features={{ depth: true }}
          tooltip="目录设置：间距 / 字号 / 字体 / 颜色 / 层级 / 换行"
        />
      </div>
      <ul className="jz-epub-toc-list">
        {rows.map(({ entry, rel }) => {
          const active = activeKey === entry.key;
          const jumpable = entry.page != null;
          return (
            <li
              key={entry.key}
              className={`jz-epub-toc-item is-l${rel}`}
              style={{ ['--jz-toc-depth' as string]: rel - 1 } as React.CSSProperties}
            >
              <a
                href={jumpable ? `#pdf-page-${entry.page}` : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  if (jumpable) onJump(entry.page as number);
                }}
                className={'jz-epub-toc-link jz-toc-link' + (active ? ' is-active' : '') + (jumpable ? '' : ' is-static')}
                aria-current={active ? 'true' : undefined}
                title={entry.title}
              >
                <span className="jz-epub-toc-text">{entry.title}</span>
                {jumpable && prefs.counts ? <span className="jz-epub-toc-page">{entry.page}</span> : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
