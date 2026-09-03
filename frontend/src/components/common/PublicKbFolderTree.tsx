/**
 * Read-only directory tree for the public blog frontend — the EPUB reader's
 * TOC language applied to a knowledge base (2026-09-02, 批次 B):
 *
 * - flattened dot-path entries (``utils/kbToc.ts``) + the shared tree helpers
 *   (``utils/treeToc.ts``): two levels open by default, chevrons, the active
 *   post's ancestors auto-expand, the active row auto-scrolls into the rail;
 * - a tools row: filter (shown past 12 entries), expand/collapse-all, and a
 *   目录设置 popover — density / size / font / colour / wrap / doc counts,
 *   site defaults from /admin/toc + this device's overrides
 *   (``useTocPrefs('kb')``; written only on explicit changes);
 * - rows reuse the ``.jz-epub-toc-*`` CSS wholesale (numbering split via
 *   ``splitTocTitle``, weight-only hierarchy, soft active fill), with doc
 *   format tags and the pin/favorite buttons carried over.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Input, Tag, Tooltip } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { JzCollapseAllIcon, JzExpandAllIcon } from './JzIcon';
import type { PublicFolder, PublicPost } from '@/types';
import Disclosure from './Disclosure';
import DocFormatTag from './DocFormatTag';
import DocPinFavoriteButtons from './DocPinFavoriteButtons';
import { resolveTagColor } from '@/utils/tagColor';
import {
  defaultExpandedTocKeys,
  filterTocEntries,
  splitTocTitle,
  tocAncestorKeys,
  tocHasChildren,
  visibleTocEntries,
} from '@/utils/treeToc';
import { flattenKbTree } from '@/utils/kbToc';
import { tocFontFamily } from '@/utils/tocPrefs';
import { useTocPrefs } from '@/stores/tocSettings';
import TocSettingsPopover from './TocSettingsPopover';
import IconButton from '@/components/common/IconButton';

interface Props {
  /** Top-level folders in this KB (already pruned of empty subtrees). */
  folders: PublicFolder[];
  /** Documents that live directly at the KB root. */
  rootDocuments: PublicPost[];
  /** Slug of the currently-open post; highlighted + kept visible. */
  currentSlug?: string;
  /** Kept for caller compatibility — presentation now follows the 目录设置
   * prefs shared with every KB tree. */
  density?: 'sidebar' | 'page';
  showCounts?: boolean;
  canManage?: boolean;
  onTogglePin?: (doc: PublicPost) => void;
  onToggleFavorite?: (doc: PublicPost) => void;
}

/** Nearest scrollable ancestor (the rail body) — never scrollIntoView, which
 * drags every outer scroller including the window. */
function scrollParentOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const style = getComputedStyle(p);
    if (/(auto|scroll)/.test(style.overflowY) && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

export default function PublicKbFolderTree({
  folders,
  rootDocuments,
  currentSlug,
  onTogglePin,
  onToggleFavorite,
}: Props) {
  const showActions = Boolean(onTogglePin || onToggleFavorite);
  const entries = useMemo(() => flattenKbTree(folders, rootDocuments), [folders, rootDocuments]);
  const activeKey = useMemo(
    () => entries.find((e) => e.kind === 'doc' && e.doc?.slug === currentSlug)?.key ?? null,
    [entries, currentSlug],
  );

  const { prefs, update: updatePrefs, reset: resetPrefs, overridden } = useTocPrefs('kb');

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const seededRef = useRef(false);
  const activeRef = useRef<HTMLLIElement | null>(null);

  // Seed once per mount (tree reloads after pin/favorite keep the user's
  // fold state instead of resetting to the default two levels).
  useEffect(() => {
    if (seededRef.current || entries.length === 0) return;
    seededRef.current = true;
    setExpanded(new Set([...defaultExpandedTocKeys(entries, 2), ...(activeKey ? tocAncestorKeys(activeKey) : [])]));
  }, [entries, activeKey]);

  // Keep the active post visible when the reader navigates.
  useEffect(() => {
    if (!activeKey) return;
    setExpanded((prev) => {
      const need = tocAncestorKeys(activeKey).filter((k) => !prev.has(k));
      if (!need.length) return prev;
      return new Set([...prev, ...need]);
    });
  }, [activeKey]);

  useEffect(() => {
    const el = activeRef.current;
    if (!el) return;
    const rail = scrollParentOf(el);
    if (!rail) return;
    const rr = rail.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    if (er.top >= rr.top && er.bottom <= rr.bottom) return; // already visible
    rail.scrollTo({ top: rail.scrollTop + (er.top - rr.top) - rail.clientHeight / 2, behavior: 'auto' });
  }, [activeKey, expanded]);

  const filtering = query.trim().length > 0;
  const visible = useMemo(
    () => (filtering ? filterTocEntries(entries, query) : visibleTocEntries(entries, expanded)),
    [entries, expanded, filtering, query],
  );
  const hasChildren = useMemo(() => {
    const m = new Map<string, boolean>();
    entries.forEach((e, i) => m.set(e.key, tocHasChildren(entries, i)));
    return m;
  }, [entries]);
  const allFolderKeys = useMemo(
    () => entries.filter((e, i) => e.kind === 'folder' && tocHasChildren(entries, i)).map((e) => e.key),
    [entries],
  );
  const allExpanded = allFolderKeys.length > 0 && allFolderKeys.every((k) => expanded.has(k));

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (entries.length === 0) return null;

  return (
    <nav
      className="jz-epub-toc jz-kb-toc"
      aria-label="知识库目录"
      data-density={prefs.density}
      data-size={prefs.size}
      data-wrap={prefs.wrap ? 'on' : 'off'}
      data-font={prefs.font}
      data-color={prefs.color}
      data-weight={prefs.weight}
      style={{ ['--jz-font-toc' as string]: tocFontFamily(prefs.font) } as React.CSSProperties}
    >
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
        {allFolderKeys.length > 0 && (
          <Tooltip title={allExpanded ? '全部折叠' : '全部展开'}>
            <IconButton
              className="jz-epub-toc-tool"
              icon={allExpanded ? <JzCollapseAllIcon /> : <JzExpandAllIcon />}
              onClick={() => setExpanded(allExpanded ? new Set() : new Set(allFolderKeys))}
              aria-label={allExpanded ? '全部折叠' : '全部展开'}
              disabled={filtering}
            />
          </Tooltip>
        )}
        <TocSettingsPopover
          prefs={prefs}
          onChange={updatePrefs}
          onReset={resetPrefs}
          overridden={overridden}
          features={{ counts: true }}
          tooltip="目录设置：间距 / 字号 / 字体 / 颜色 / 换行 / 篇数"
        />
      </div>
      <ul className="jz-epub-toc-list">
        {visible.map((entry) => {
          const isFolder = entry.kind === 'folder';
          const open = expanded.has(entry.key);
          const active = entry.key === activeKey;
          const folderish = !filtering && isFolder && (hasChildren.get(entry.key) ?? false);
          const depth = filtering ? 0 : Math.min(entry.level, 4);
          const { num, text } = splitTocTitle(entry.title);
          return (
            <li
              key={entry.key}
              ref={active ? activeRef : undefined}
              className={'jz-epub-toc-item is-l' + depth + (active ? ' is-active' : '') + (folderish ? ' is-folder' : ' is-leaf')}
              style={{ ['--jz-toc-depth' as string]: Math.max(0, depth - 1) } as React.CSSProperties}
            >
              {folderish ? (
                <button
                  type="button"
                  className={'jz-epub-toc-chevron' + (open ? ' is-open' : '')}
                  onClick={() => toggle(entry.key)}
                  aria-label={open ? '折叠' : '展开'}
                  aria-expanded={open}
                >
                  <Disclosure open={open} />
                </button>
              ) : (
                <span className="jz-epub-toc-chevron is-leaf" aria-hidden />
              )}
              {isFolder ? (
                <button
                  type="button"
                  className="jz-epub-toc-link jz-kb-toc-folder"
                  onClick={() => (folderish ? toggle(entry.key) : undefined)}
                  title={entry.title}
                >
                  {num && <span className="jz-epub-toc-num">{num}</span>}
                  {num && ' '}
                  <span className="jz-epub-toc-text">{text}</span>
                  {(entry.tags ?? []).slice(0, 2).map((t) => (
                    <Tag
                      key={t.id}
                      color={resolveTagColor(t)}
                      className="jz-folder-tag"
                      style={{ marginInlineEnd: 0, fontSize: 'var(--jz-fs-3xs)', lineHeight: '15px', padding: '0 5px' }}
                    >
                      {t.name}
                    </Tag>
                  ))}
                  {prefs.counts && entry.count != null && (
                    <span className="jz-epub-toc-page" aria-label="篇数">
                      {entry.count}
                    </span>
                  )}
                </button>
              ) : (
                <>
                  <Link
                    to={`/posts/${encodeURIComponent(entry.doc!.slug)}`}
                    className={'jz-epub-toc-link' + (active ? ' is-active' : '')}
                    title={entry.title}
                    aria-current={active ? 'page' : undefined}
                  >
                    {num && <span className="jz-epub-toc-num">{num}</span>}
                    {num && ' '}
                    <span className="jz-epub-toc-text">{text}</span>
                    <span className="jz-kb-toc-fmt">
                      <DocFormatTag format={entry.doc!.doc_format} size="default" />
                    </span>
                  </Link>
                  {showActions && entry.doc && (
                    <span className="jz-kb-toc-actions">
                      <DocPinFavoriteButtons
                        doc={entry.doc}
                        compact
                        onTogglePin={onTogglePin ? () => onTogglePin(entry.doc!) : undefined}
                        onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(entry.doc!) : undefined}
                      />
                    </span>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
