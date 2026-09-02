import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, Input, Popover, Segmented, Spin, Switch, Tooltip, Typography } from 'antd';
import {
  BookOutlined,
  CloseOutlined,
  DeleteOutlined,
  DownOutlined,
  ExportOutlined,
  MinusSquareOutlined,
  PlusSquareOutlined,
  RightOutlined,
  SearchOutlined,
  SettingOutlined,
  UpOutlined,
} from '@ant-design/icons';
import type { Bookmark, Highlight } from '@/api/reading';
import { groupByChapter, sortHighlights, swatchHex } from '@/utils/epubNotes';
import {
  defaultExpandedTocKeys,
  filterTocEntries,
  splitTocTitle,
  tocAncestorKeys,
  tocHasChildren,
  visibleTocEntries,
  type EpubTocEntry,
  type EpubTocPrefs,
} from '@/utils/epubReader';

const { Text } = Typography;

export interface EpubSearchHit {
  cfi: string;
  pre: string;
  match: string;
  post: string;
}

export interface EpubSearchGroup {
  label: string;
  hits: EpubSearchHit[];
}

/** Notes tab wiring (highlights + notes are private per reader). */
export interface EpubNotesProps {
  highlights: Highlight[];
  /** False while the list is loading or when the book has no document id. */
  loaded: boolean;
  /** Logged-out readers see a hint instead of an empty list. */
  loggedIn: boolean;
  onOpen: (h: Highlight) => void;
  onExport: () => void;
}

export type EpubSideTab = 'toc' | 'search' | 'notes' | 'bookmarks';

/** Bookmarks tab wiring (manual bookmarks, distinct from position memory). */
export interface EpubBookmarksProps {
  items: Bookmark[];
  loaded: boolean;
  loggedIn: boolean;
  onOpen: (b: Bookmark) => void;
  onDelete: (b: Bookmark) => void;
}

interface Props {
  entries: EpubTocEntry[];
  /** foliate TOC id of the chapter currently in view (``relocate.tocItem.id``). */
  activeId: number | null;
  onJump: (href: string) => void;
  onClose?: () => void;
  /** Book identity shown above the list. */
  title?: string;
  author?: string;
  coverUrl?: string | null;
  /** Whole-book reading progress 0–1 and section counter, for the head. */
  progress?: { fraction: number; section?: { current: number; total: number } | null } | null;
  /** TOC presentation prefs (density / size / wrap / page numbers) + setter. */
  tocPrefs: EpubTocPrefs;
  onTocPrefsChange: (patch: Partial<EpubTocPrefs>) => void;
  /** Estimated start page per entry (index-aligned with ``entries``) and total. */
  pageOf?: Array<number | null>;
  totalPages?: number;
  /** Popup container so popovers stay visible in full-screen. */
  popupContainer?: () => HTMLElement;
  /** Body font stack, for the "跟随正文字体" TOC option. */
  readerFontStack?: string;
  /** Search: run a query; resolves when the whole book has been scanned. */
  onSearch: (query: string, push: (group: EpubSearchGroup) => void) => Promise<void>;
  onClearSearch: () => void;
  onJumpToCfi: (cfi: string) => void;
  /** A search requested from elsewhere (selection bar "搜本书"): switches
   * to the search tab and runs it. ``seq`` makes repeats of the same query
   * re-run. */
  searchRequest?: { query: string; seq: number } | null;
  /** Present when the reader supports highlights (documentId known). */
  notes?: EpubNotesProps | null;
  /** Present when the reader supports bookmarks (documentId known). */
  bookmarks?: EpubBookmarksProps | null;
  /** Jump to a search hit — the reader also flashes the target. Falls back
   * to ``onJumpToCfi`` when omitted. */
  onJumpToSearchHit?: (cfi: string) => void;
  /** Force a tab (e.g. after creating the first note); ``seq`` re-applies. */
  tabRequest?: { tab: EpubSideTab; seq: number } | null;
}

/**
 * Left rail of the EPUB reader: a fixed head (cover + metadata + 目录/搜索
 * switch) over a scrolling body. The TOC is a collapsible tree — two levels
 * open by default, deeper levels behind chevrons, and the path to the active
 * chapter auto-expands so the highlight is never hidden inside a folded
 * branch. Search streams results per chapter as foliate's generator yields.
 */
export default function EpubSidebar({
  entries,
  activeId,
  onJump,
  onClose,
  title,
  author,
  coverUrl,
  progress,
  tocPrefs,
  onTocPrefsChange,
  pageOf,
  totalPages,
  popupContainer,
  readerFontStack,
  onSearch,
  onClearSearch,
  onJumpToCfi,
  searchRequest,
  notes,
  bookmarks,
  onJumpToSearchHit,
  tabRequest,
}: Props) {
  const [tab, setTab] = useState<EpubSideTab>('toc');
  const [notesQuery, setNotesQuery] = useState('');
  /** Index into the flattened hit list of the "current" search result. */
  const [hitCursor, setHitCursor] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<EpubSearchGroup[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => defaultExpandedTocKeys(entries));
  const [tocQuery, setTocQuery] = useState('');
  const runRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLLIElement | null>(null);

  // A new book → fresh default expansion.
  useEffect(() => {
    setExpanded(defaultExpandedTocKeys(entries));
  }, [entries]);

  const activeKey = useMemo(
    () => (activeId == null ? null : entries.find((e) => e.id === activeId)?.key ?? null),
    [entries, activeId],
  );

  // Unfold the path to the active chapter so the highlight is visible.
  useEffect(() => {
    if (!activeKey) return;
    const need = tocAncestorKeys(activeKey).filter((k) => !expanded.has(k));
    if (need.length) setExpanded((prev) => new Set([...prev, ...need]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  // Keep the active chapter in view as the reader turns pages — scroll only
  // the rail body itself (never scrollIntoView, which drags outer scrollers).
  useEffect(() => {
    const el = activeRef.current;
    const rail = scrollRef.current;
    if (!el || !rail) return;
    const top = el.offsetTop - rail.clientHeight / 2;
    rail.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
  }, [activeKey, expanded]);

  // Filtering ignores the fold state: a match deep in a folded branch must show.
  const filtering = tocQuery.trim().length > 0;
  const visible = useMemo(
    () => (filtering ? filterTocEntries(entries, tocQuery) : visibleTocEntries(entries, expanded)),
    [entries, expanded, filtering, tocQuery],
  );
  const hasChildren = useMemo(() => {
    const m = new Map<string, boolean>();
    entries.forEach((e, i) => m.set(e.key, tocHasChildren(entries, i)));
    return m;
  }, [entries]);
  const total = useMemo(() => groups.reduce((n, g) => n + g.hits.length, 0), [groups]);
  /** All hits in reading order (foliate yields chapters in spine order). */
  const allHits = useMemo(() => groups.flatMap((g) => g.hits), [groups]);
  const jumpHit = (i: number) => {
    if (i < 0 || i >= allHits.length) return;
    setHitCursor(i);
    (onJumpToSearchHit ?? onJumpToCfi)(allHits[i].cfi);
  };

  const allFolderKeys = useMemo(() => entries.filter((_, i) => tocHasChildren(entries, i)).map((e) => e.key), [entries]);
  const allExpanded = allFolderKeys.length > 0 && allFolderKeys.every((k) => expanded.has(k));
  const expandAll = () => setExpanded(new Set(allFolderKeys));
  const collapseAll = () => setExpanded(new Set());

  const tocSettings = (
    <div className="jz-reader-layout-pop jz-epub-toc-settings" style={{ width: 232 }}>
      <div className="jz-rl-section">
        <div className="jz-rl-label">间距</div>
        <Segmented
          block
          size="small"
          value={tocPrefs.density}
          onChange={(v) => onTocPrefsChange({ density: v as EpubTocPrefs['density'] })}
          options={[
            { label: '紧凑', value: 'compact' },
            { label: '标准', value: 'normal' },
            { label: '宽松', value: 'loose' },
          ]}
        />
      </div>
      <div className="jz-rl-section">
        <div className="jz-rl-label">字号</div>
        <Segmented
          block
          size="small"
          value={tocPrefs.size}
          onChange={(v) => onTocPrefsChange({ size: v as EpubTocPrefs['size'] })}
          options={[
            { label: '小', value: 's' },
            { label: '中', value: 'm' },
            { label: '大', value: 'l' },
          ]}
        />
      </div>
      <div className="jz-rl-section">
        <div className="jz-rl-label">字体</div>
        <Segmented
          block
          size="small"
          value={tocPrefs.font}
          onChange={(v) => onTocPrefsChange({ font: v as EpubTocPrefs['font'] })}
          options={[
            { label: <span style={{ fontFamily: 'var(--jz-font-ui)' }}>界面</span>, value: 'ui', title: '站内界面字体' },
            { label: <span style={{ fontFamily: 'var(--jz-font-serif)' }}>衬线</span>, value: 'serif', title: '宋体 / 衬线' },
            { label: <span style={{ fontFamily: 'var(--jz-font-kai)' }}>楷体</span>, value: 'kai', title: '楷体' },
            { label: <span style={{ fontFamily: 'var(--jz-font-display)' }}>文楷</span>, value: 'wenkai', title: '霞鹜文楷' },
            { label: <span style={{ fontFamily: readerFontStack }}>正文</span>, value: 'reader', title: '跟随正文字体' },
          ]}
        />
      </div>
      <div className="jz-rl-section">
        <div className="jz-rl-label">颜色</div>
        <Segmented
          block
          size="small"
          value={tocPrefs.color}
          onChange={(v) => onTocPrefsChange({ color: v as EpubTocPrefs['color'] })}
          options={[
            { label: '正文色', value: 'text', title: '所有层级同正文色' },
            { label: '淡显', value: 'muted', title: '全部淡色，当前章高亮' },
            { label: '分层', value: 'layered', title: '篇、节淡显，章为正文色' },
          ]}
        />
      </div>
      <div className="jz-rl-section jz-epub-toc-switches">
        <label>
          <span>长标题换行</span>
          <Switch size="small" checked={tocPrefs.wrap} onChange={(v) => onTocPrefsChange({ wrap: v })} />
        </label>
        <label>
          <span>显示页码（约）</span>
          <Switch size="small" checked={tocPrefs.pages} onChange={(v) => onTocPrefsChange({ pages: v })} />
        </label>
      </div>
    </div>
  );

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  useEffect(() => {
    if (!tabRequest) return;
    setTab(tabRequest.tab);
  }, [tabRequest]);

  useEffect(() => {
    if (!searchRequest || !searchRequest.query.trim()) return;
    setTab('search');
    setQuery(searchRequest.query);
    void submit(searchRequest.query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchRequest]);

  const noteGroups = useMemo(() => {
    if (!notes) return [];
    const q = notesQuery.trim().toLowerCase();
    const list = q ? notes.highlights.filter((h) => (h.text + '\n' + h.note + '\n' + h.chapter).toLowerCase().includes(q)) : notes.highlights;
    return groupByChapter(sortHighlights(list));
  }, [notes, notesQuery]);

  const submit = async (q: string) => {
    const trimmed = q.trim();
    const run = ++runRef.current;
    onClearSearch();
    setGroups([]);
    setSearched(false);
    setHitCursor(null);
    if (!trimmed) return;
    setSearching(true);
    setSearched(true);
    try {
      await onSearch(trimmed, (g) => {
        if (runRef.current !== run) return;
        setGroups((prev) => [...prev, g]);
      });
    } finally {
      if (runRef.current === run) setSearching(false);
    }
  };

  return (
    <nav
      className="jz-epub-toc"
      aria-label="电子书目录"
      data-density={tocPrefs.density}
      data-size={tocPrefs.size}
      data-wrap={tocPrefs.wrap ? 'on' : 'off'}
      data-font={tocPrefs.font}
      data-color={tocPrefs.color}
      style={tocPrefs.font === 'reader' && readerFontStack ? { fontFamily: readerFontStack } : undefined}
    >
      <div className="jz-epub-side-head">
        {coverUrl ? (
          <img className="jz-epub-cover" src={coverUrl} alt="" />
        ) : (
          <div className="jz-epub-cover jz-epub-cover--empty" aria-hidden>
            <BookOutlined />
          </div>
        )}
        <div className="jz-epub-side-meta">
          <div className="jz-epub-side-title" title={title}>
            {title || '电子书'}
          </div>
          {author && (
            <Text type="secondary" className="jz-epub-side-author" title={author}>
              {author}
            </Text>
          )}
          {progress && (
            <div className="jz-epub-side-progress" title="全书阅读进度">
              <div className="jz-epub-side-progress-bar">
                <i style={{ width: `${Math.round(Math.min(1, Math.max(0, progress.fraction)) * 100)}%` }} />
              </div>
              <span>
                已读 {Math.round(Math.min(1, Math.max(0, progress.fraction)) * 100)}%
                {progress.section && progress.section.total > 0 ? ` · ${progress.section.current + 1}/${progress.section.total} 节` : ''}
                {tocPrefs.pages && totalPages ? ` · 约 ${totalPages} 页` : ''}
              </span>
            </div>
          )}
        </div>
        {onClose && (
          <Tooltip title="隐藏侧栏">
            <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} aria-label="隐藏侧栏" className="jz-epub-side-close" />
          </Tooltip>
        )}
      </div>
      <Segmented
        block
        size="small"
        value={tab}
        onChange={(v) => setTab(v as EpubSideTab)}
        options={[
          { label: '目录', value: 'toc' },
          { label: '搜索', value: 'search' },
          ...(notes ? [{ label: notes.highlights.length ? `笔记 ${notes.highlights.length}` : '笔记', value: 'notes' }] : []),
          ...(bookmarks ? [{ label: bookmarks.items.length ? `书签 ${bookmarks.items.length}` : '书签', value: 'bookmarks' }] : []),
        ]}
        className="jz-epub-side-tabs"
      />
      {tab === 'toc' && (
        <div className="jz-epub-toc-tools">
          {entries.length > 12 ? (
            <Input
              size="small"
              allowClear
              variant="filled"
              prefix={<SearchOutlined className="jz-epub-toc-filter-icon" />}
              placeholder={`筛选（${entries.length} 条）`}
              value={tocQuery}
              onChange={(e) => setTocQuery(e.target.value)}
              className="jz-epub-toc-filter"
              aria-label="筛选目录"
            />
          ) : (
            <span style={{ flex: 1 }} />
          )}
          {allFolderKeys.length > 0 && (
            <Tooltip title={allExpanded ? '全部折叠' : '全部展开'} getPopupContainer={popupContainer}>
              <Button
                type="text"
                size="small"
                className="jz-epub-toc-tool"
                icon={allExpanded ? <MinusSquareOutlined /> : <PlusSquareOutlined />}
                onClick={allExpanded ? collapseAll : expandAll}
                aria-label={allExpanded ? '全部折叠' : '全部展开'}
                disabled={filtering}
              />
            </Tooltip>
          )}
          <Popover content={tocSettings} trigger="click" placement="bottomRight" getPopupContainer={popupContainer}>
            <Tooltip title="目录设置：间距 / 字号 / 换行 / 页码" getPopupContainer={popupContainer}>
              <Button type="text" size="small" className="jz-epub-toc-tool" icon={<SettingOutlined />} aria-label="目录设置" />
            </Tooltip>
          </Popover>
        </div>
      )}
      {tab === 'notes' && notes && (
        <div className="jz-epub-toc-tools">
          {notes.highlights.length > 8 ? (
            <Input
              size="small"
              allowClear
              variant="filled"
              prefix={<SearchOutlined className="jz-epub-toc-filter-icon" />}
              placeholder={`筛选笔记（${notes.highlights.length} 条）`}
              value={notesQuery}
              onChange={(e) => setNotesQuery(e.target.value)}
              className="jz-epub-toc-filter"
              aria-label="筛选笔记"
            />
          ) : (
            <span style={{ flex: 1 }} />
          )}
          <Tooltip title="导出为 Markdown 笔记" getPopupContainer={popupContainer}>
            <Button
              type="text"
              size="small"
              className="jz-epub-toc-tool"
              icon={<ExportOutlined />}
              onClick={notes.onExport}
              aria-label="导出笔记"
              disabled={notes.highlights.length === 0}
            />
          </Tooltip>
        </div>
      )}
      <div ref={scrollRef} className="jz-epub-side-scroll">
        {tab === 'bookmarks' && bookmarks ? (
          !bookmarks.loggedIn ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="登录后可添加书签" />
          ) : !bookmarks.loaded ? (
            <div style={{ textAlign: 'center', padding: 12 }}>
              <Spin size="small" />
            </div>
          ) : bookmarks.items.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="工具条的书签按钮可收藏当前页" />
          ) : (
            <div className="jz-epub-notes">
              {bookmarks.items.map((b) => (
                <div key={b.id} className="jz-epub-bm-row">
                  <button type="button" className="jz-epub-note jz-epub-bm" onClick={() => bookmarks.onOpen(b)} title="跳转到该页">
                    <span className="jz-epub-search-chapter">{b.chapter || '（正文）'}</span>
                    <span className="jz-epub-note-quote">{b.excerpt || '（本页）'}</span>
                    <span className="jz-epub-note-text">{new Date(b.created_at).toLocaleString()}</span>
                  </button>
                  <Tooltip title="删除书签">
                    <Button
                      type="text"
                      size="small"
                      className="jz-epub-bm-del"
                      icon={<DeleteOutlined />}
                      onClick={() => bookmarks.onDelete(b)}
                      aria-label="删除书签"
                    />
                  </Tooltip>
                </div>
              ))}
            </div>
          )
        ) : tab === 'notes' && notes ? (
          !notes.loggedIn ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="登录后可划线、写笔记" />
          ) : !notes.loaded ? (
            <div style={{ textAlign: 'center', padding: 12 }}>
              <Spin size="small" />
            </div>
          ) : notes.highlights.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选中正文文字即可划线、写笔记" />
          ) : noteGroups.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的笔记" />
          ) : (
            <div className="jz-epub-notes">
              {noteGroups.map((g, gi) => (
                <div key={gi} className="jz-epub-search-group">
                  <div className="jz-epub-search-chapter" title={g.chapter}>
                    {g.chapter || '（正文）'}
                  </div>
                  {g.items.map((h) => (
                    <button
                      type="button"
                      key={h.id}
                      className={'jz-epub-note is-' + h.style}
                      style={{ ['--jz-swatch' as string]: swatchHex(h.color) } as React.CSSProperties}
                      onClick={() => notes.onOpen(h)}
                      title="跳转到该处"
                    >
                      <span className="jz-epub-note-quote">{h.text || '（无引文）'}</span>
                      {h.note && <span className="jz-epub-note-text">{h.note}</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )
        ) : tab === 'toc' ? (
          entries.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本书没有目录" />
          ) : filtering && visible.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的目录项" />
          ) : (
            <ul className="jz-epub-toc-list">
              {visible.map((entry) => {
                const active = activeKey === entry.key;
                const jumpable = !!entry.href;
                const folder = !filtering && (hasChildren.get(entry.key) ?? false);
                const open = expanded.has(entry.key);
                const depth = filtering ? 0 : Math.min(entry.level, 4);
                const { num, text } = splitTocTitle(entry.title);
                return (
                  <li
                    key={entry.key}
                    ref={active ? activeRef : undefined}
                    className={
                      'jz-epub-toc-item is-l' + depth + (active ? ' is-active' : '') + (folder ? ' is-folder' : ' is-leaf')
                    }
                    style={{ ['--jz-toc-depth' as string]: Math.max(0, depth - 1) } as React.CSSProperties}
                  >
                    {folder ? (
                      <button
                        type="button"
                        className={'jz-epub-toc-chevron' + (open ? ' is-open' : '')}
                        onClick={() => toggle(entry.key)}
                        aria-label={open ? '折叠' : '展开'}
                        aria-expanded={open}
                      >
                        <RightOutlined />
                      </button>
                    ) : (
                      <span className="jz-epub-toc-chevron is-leaf" aria-hidden />
                    )}
                    <a
                      href={jumpable ? `#epub-${entry.key}` : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        if (entry.href) onJump(entry.href);
                        else if (folder) toggle(entry.key);
                      }}
                      className={'jz-epub-toc-link' + (active ? ' is-active' : '') + (jumpable ? '' : ' is-static')}
                      title={entry.title}
                    >
                      {num && <span className="jz-epub-toc-num">{num}</span>}
                      {/* keeps textContent "第1章 路由器…" (flex ignores the space) */}
                      {num && ' '}
                      <span className="jz-epub-toc-text">{text}</span>
                      {tocPrefs.pages && pageOf && pageOf[entries.indexOf(entry)] != null && (
                        <span className="jz-epub-toc-page" aria-label="约第几页">
                          {pageOf[entries.indexOf(entry)]}
                        </span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          <div className="jz-epub-search">
            <Input.Search
              size="small"
              allowClear
              placeholder="搜索全书…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onSearch={(v) => void submit(v)}
              loading={searching}
            />
            {searched && (
              <div className="jz-epub-search-nav">
                <Text type="secondary" style={{ fontSize: 'var(--jz-fs-xs)' }}>
                  {searching ? '正在逐章扫描…' : hitCursor == null ? `共 ${total} 处` : `${hitCursor + 1} / ${total} 处`}
                </Text>
                {total > 0 && (
                  <span className="jz-epub-search-nav-btns">
                    <Tooltip title="上一处">
                      <Button
                        type="text"
                        size="small"
                        icon={<UpOutlined />}
                        disabled={total === 0}
                        onClick={() => jumpHit(hitCursor == null ? total - 1 : (hitCursor - 1 + total) % total)}
                        aria-label="上一处"
                      />
                    </Tooltip>
                    <Tooltip title="下一处">
                      <Button
                        type="text"
                        size="small"
                        icon={<DownOutlined />}
                        disabled={total === 0}
                        onClick={() => jumpHit(hitCursor == null ? 0 : (hitCursor + 1) % total)}
                        aria-label="下一处"
                      />
                    </Tooltip>
                  </span>
                )}
              </div>
            )}
            {searching && groups.length === 0 && (
              <div style={{ textAlign: 'center', padding: 12 }}>
                <Spin size="small" />
              </div>
            )}
            {(() => {
              let flat = -1;
              return groups.map((g, gi) => (
                <div key={gi} className="jz-epub-search-group">
                  <div className="jz-epub-search-chapter" title={g.label}>
                    {g.label || '（正文）'}
                  </div>
                  {g.hits.map((h, hi) => {
                    flat += 1;
                    const idx = flat;
                    return (
                      <button
                        type="button"
                        key={hi}
                        className={'jz-epub-search-hit' + (idx === hitCursor ? ' is-current' : '')}
                        onClick={() => jumpHit(idx)}
                        title="跳转到该处"
                      >
                        <span>{h.pre}</span>
                        <mark>{h.match}</mark>
                        <span>{h.post}</span>
                      </button>
                    );
                  })}
                </div>
              ));
            })()}
            {searched && !searching && total === 0 && (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到匹配内容" />
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
