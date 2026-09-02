/**
 * Read-only directory tree for the public blog frontend — the EPUB reader's
 * TOC language applied to a knowledge base (2026-09-02, 批次 B):
 *
 * - flattened dot-path entries (``utils/kbToc.ts``) + the shared tree helpers
 *   (``utils/treeToc.ts``): two levels open by default, chevrons, the active
 *   post's ancestors auto-expand, the active row auto-scrolls into the rail;
 * - a tools row: filter (shown past 12 entries), expand/collapse-all, and a
 *   目录设置 popover — density / size / font / colour / wrap / doc counts,
 *   persisted globally under ``jz-kb-toc-prefs:v1`` (written only on explicit
 *   changes; frozen-default trap, see CLAUDE.md);
 * - rows reuse the ``.jz-epub-toc-*`` CSS wholesale (numbering split via
 *   ``splitTocTitle``, weight-only hierarchy, soft active fill), with doc
 *   format tags and the pin/favorite buttons carried over.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Input, Popover, Segmented, Switch, Tag, Tooltip } from 'antd';
import { MinusSquareOutlined, PlusSquareOutlined, RightOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons';
import type { PublicFolder, PublicPost } from '@/types';
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
import { flattenKbTree, loadKbTocPrefs, saveKbTocPrefs, type KbTocPrefs } from '@/utils/kbToc';

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

  const [prefs, setPrefs] = useState<KbTocPrefs>(() => loadKbTocPrefs());
  const updatePrefs = (patch: Partial<KbTocPrefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      saveKbTocPrefs(next);
      return next;
    });
  };

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

  const settings = (
    <div className="jz-reader-layout-pop jz-epub-toc-settings" style={{ width: 232 }}>
      <div className="jz-rl-section">
        <div className="jz-rl-label">间距</div>
        <Segmented
          block
          size="small"
          value={prefs.density}
          onChange={(v) => updatePrefs({ density: v as KbTocPrefs['density'] })}
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
          value={prefs.size}
          onChange={(v) => updatePrefs({ size: v as KbTocPrefs['size'] })}
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
          value={prefs.font}
          onChange={(v) => updatePrefs({ font: v as KbTocPrefs['font'] })}
          options={[
            { label: <span style={{ fontFamily: 'var(--jz-font-ui)' }}>界面</span>, value: 'ui', title: '站内界面字体' },
            { label: <span style={{ fontFamily: 'var(--jz-font-serif)' }}>衬线</span>, value: 'serif', title: '宋体 / 衬线' },
            { label: <span style={{ fontFamily: 'var(--jz-font-kai)' }}>楷体</span>, value: 'kai', title: '楷体' },
            { label: <span style={{ fontFamily: 'var(--jz-font-display)' }}>文楷</span>, value: 'wenkai', title: '霞鹜文楷' },
          ]}
        />
      </div>
      <div className="jz-rl-section">
        <div className="jz-rl-label">颜色</div>
        <Segmented
          block
          size="small"
          value={prefs.color}
          onChange={(v) => updatePrefs({ color: v as KbTocPrefs['color'] })}
          options={[
            { label: '正文色', value: 'text', title: '所有层级同正文色' },
            { label: '淡显', value: 'muted', title: '全部淡色，当前文档高亮' },
            { label: '分层', value: 'layered', title: '文件夹层淡显，文档正常' },
          ]}
        />
      </div>
      <div className="jz-rl-section jz-epub-toc-switches">
        <label>
          <span>长标题换行</span>
          <Switch size="small" checked={prefs.wrap} onChange={(v) => updatePrefs({ wrap: v })} />
        </label>
        <label>
          <span>显示篇数</span>
          <Switch size="small" checked={prefs.counts} onChange={(v) => updatePrefs({ counts: v })} />
        </label>
      </div>
    </div>
  );

  return (
    <nav
      className="jz-epub-toc jz-kb-toc"
      aria-label="知识库目录"
      data-density={prefs.density}
      data-size={prefs.size}
      data-wrap={prefs.wrap ? 'on' : 'off'}
      data-font={prefs.font}
      data-color={prefs.color}
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
            <Button
              type="text"
              size="small"
              className="jz-epub-toc-tool"
              icon={allExpanded ? <MinusSquareOutlined /> : <PlusSquareOutlined />}
              onClick={() => setExpanded(allExpanded ? new Set() : new Set(allFolderKeys))}
              aria-label={allExpanded ? '全部折叠' : '全部展开'}
              disabled={filtering}
            />
          </Tooltip>
        )}
        <Popover content={settings} trigger="click" placement="bottomRight">
          <Tooltip title="目录设置：间距 / 字号 / 字体 / 颜色 / 换行 / 篇数">
            <Button type="text" size="small" className="jz-epub-toc-tool" icon={<SettingOutlined />} aria-label="目录设置" />
          </Tooltip>
        </Popover>
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
                  <RightOutlined />
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
                </>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
