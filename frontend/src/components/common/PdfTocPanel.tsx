/**
 * Side panel for a PDF: three tabs — 目录 (embedded bookmarks), 搜索 (client
 * side full-text over the pdf.js text index) and 书签 (per-user page
 * bookmarks). Rendered either inside the reader (editor / attachment panels)
 * or in the reading page's TOC rail / drawer (PostSidePanel), so everything
 * it needs arrives through props: the outline entries and a `reader` api.
 *
 * The 目录 tab follows the same 目录设置 prefs as the article rail
 * (``useTocPrefs('article')``); the active entry is the last bookmark whose
 * page is at or before the current page.
 */
import { useEffect, useMemo, useState } from 'react';
import { Input, Segmented, Spin, Tooltip, Typography } from 'antd';
import { CloseOutlined, DeleteOutlined, ExportOutlined, SearchOutlined } from '@ant-design/icons';
import { swatchHex } from '@/utils/epubNotes';
import type { PdfTocEntry } from '@/utils/pdfOutline';
import { relativeTocLevel, tocFontFamily } from '@/utils/tocPrefs';
import { useTocPrefs } from '@/stores/tocSettings';
import TocSettingsPopover from './TocSettingsPopover';
import IconButton from '@/components/common/IconButton';
import JzEmpty from '@/components/common/JzEmpty';
import SearchResults from '@/components/common/reader/SearchResults';
import type { PdfReaderApi, PdfSideTab } from '@/utils/pdfReaderApi';
import type { PdfSearchHit } from '@/utils/pdfTextIndex';

const { Text } = Typography;

interface Props {
  entries: PdfTocEntry[];
  /** 1-based page currently shown in the canvas. */
  currentPage: number;
  /** Jump the renderer to the bookmark's target (page + in-page position). */
  onJump: (entry: PdfTocEntry) => void;
  /** Optional collapse handler; when provided, a close button is shown. */
  onClose?: () => void;
  /** Stick the rail to the top while the page scrolls (flow mode). */
  sticky?: boolean;
  /** Search + bookmarks (absent → outline only). */
  reader?: PdfReaderApi | null;
  /** External "open this tab" request (toolbar buttons / shortcuts). */
  tabRequest?: { tab: PdfSideTab; seq: number } | null;
}

export default function PdfTocPanel({ entries, currentPage, onJump, onClose, sticky, reader, tabRequest }: Props) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<PdfSideTab>(entries.length > 0 ? 'toc' : 'search');
  const { prefs, update, reset, overridden } = useTocPrefs('article');

  useEffect(() => {
    if (tabRequest) setTab(tabRequest.tab);
  }, [tabRequest]);
  // An outline arriving after mount (async parse) should win the first tab.
  useEffect(() => {
    if (entries.length > 0 && tab === 'search' && !tabRequest) setTab('toc');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length > 0]);

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

  const hasTabs = !!reader;
  if (entries.length === 0 && !hasTabs) return null;

  const bookmarkCount = reader?.bookmarks.length ?? 0;
  const noteCount = reader?.highlights.length ?? 0;

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
        {hasTabs ? (
          <Segmented
            size="small"
            value={tab}
            onChange={(v) => setTab(v as PdfSideTab)}
            options={[
              ...(entries.length > 0 ? [{ label: '目录', value: 'toc' }] : []),
              { label: '搜索', value: 'search' },
              { label: bookmarkCount ? `书签 ${bookmarkCount}` : '书签', value: 'bookmarks' },
              ...(reader?.loggedIn ? [{ label: noteCount ? `笔记 ${noteCount}` : '笔记', value: 'notes' }] : []),
            ]}
            className="jz-epub-side-tabs"
          />
        ) : (
          <Text type="secondary" style={{ fontSize: 'var(--jz-fs-2xs)', letterSpacing: 1, textTransform: 'uppercase' }}>
            目录
          </Text>
        )}
        {onClose && (
          <Tooltip title="隐藏侧栏">
            <IconButton icon={<CloseOutlined />} onClick={onClose} aria-label="隐藏侧栏" />
          </Tooltip>
        )}
      </div>

      {tab === 'toc' && entries.length > 0 && (
        <>
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
                    href={jumpable ? `?page=${entry.page}` : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      if (jumpable) onJump(entry);
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
        </>
      )}

      {tab === 'search' && reader && (
        <SearchResults<PdfSearchHit>
          placeholder={`搜索全文（${reader.pageCount} 页）…`}
          scanningLabel={reader.indexProgress != null ? `正在读取文字 ${Math.round(reader.indexProgress * 100)}%…` : '正在搜索…'}
          onSearch={reader.search}
          onClear={reader.clearSearch}
          onJump={(hit) => reader.jumpToHit(hit.target)}
        />
      )}

      {tab === 'notes' && reader && (
        <>
          <div className="jz-epub-toc-tools">
            <span style={{ flex: 1 }} />
            <Tooltip title="导出为 Markdown 笔记">
              <IconButton icon={<ExportOutlined />} onClick={reader.openExport} disabled={noteCount === 0} aria-label="导出笔记" />
            </Tooltip>
          </div>
          {!reader.highlightsLoaded ? (
            <div style={{ textAlign: 'center', padding: 12 }}>
              <Spin size="small" />
            </div>
          ) : noteCount === 0 ? (
            <JzEmpty description="选中文字后可划线、写笔记" size="sm" />
          ) : (
            <div className="jz-epub-notes">
              {reader.highlights.map((h) => (
                <button
                  type="button"
                  key={h.id}
                  className={'jz-epub-note is-' + h.style}
                  style={{ ['--jz-swatch' as string]: swatchHex(h.color) } as React.CSSProperties}
                  onClick={() => reader.openHighlight(h)}
                  title="跳转到该处"
                >
                  <span className="jz-epub-search-chapter">{h.chapter || '（正文）'}</span>
                  <span className="jz-epub-note-quote">{h.text}</span>
                  {h.note && <span className="jz-epub-note-text">{h.note}</span>}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'bookmarks' &&
        reader &&
        (!reader.loggedIn ? (
          <JzEmpty description="登录后可添加书签" size="sm" />
        ) : !reader.bookmarksLoaded ? (
          <div style={{ textAlign: 'center', padding: 12 }}>
            <Spin size="small" />
          </div>
        ) : reader.bookmarks.length === 0 ? (
          <JzEmpty description="工具条的书签按钮可收藏当前页（快捷键 b）" size="sm" />
        ) : (
          <div className="jz-epub-notes">
            {reader.bookmarks.map((b) => (
              <div key={b.id} className="jz-epub-bm-row">
                <button type="button" className="jz-epub-note jz-epub-bm" onClick={() => reader.openBookmark(b)} title="跳转到该页">
                  <span className="jz-epub-search-chapter">{b.chapter || `第 ${b.page} 页`}</span>
                  <span className="jz-epub-note-quote">{b.excerpt || '（本页）'}</span>
                  <span className="jz-epub-note-text">{new Date(b.created_at).toLocaleString()}</span>
                </button>
                <Tooltip title="删除书签">
                  <IconButton className="jz-epub-bm-del" icon={<DeleteOutlined />} onClick={() => void reader.removeBookmark(b)} aria-label="删除书签" />
                </Tooltip>
              </div>
            ))}
          </div>
        ))}
    </nav>
  );
}
