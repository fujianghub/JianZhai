import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tag } from 'antd';
import { CaretDownOutlined, CaretRightOutlined, FolderOpenOutlined, FolderOutlined } from '@ant-design/icons';
import type { PublicFolder, PublicPost } from '@/types';
import DocFormatTag from './DocFormatTag';

interface Props {
  /** Top-level folders in this KB (already pruned of empty subtrees). */
  folders: PublicFolder[];
  /** Documents that live directly at the KB root. */
  rootDocuments: PublicPost[];
  /** Slug of the currently-open post; highlighted in the list. */
  currentSlug?: string;
  /** Density preset. ``sidebar`` is compact (used in the post-detail rail);
   * ``page`` is roomier (used on the KB landing page beside the cards). */
  density?: 'sidebar' | 'page';
  /** ``page`` mode shows a small post-count after each folder name. */
  showCounts?: boolean;
}

/** Counts published docs in a subtree (used by the folder header badge). */
function countDocs(f: PublicFolder): number {
  return (
    f.documents.length +
    f.children.reduce((s, c) => s + countDocs(c), 0)
  );
}

/**
 * Read-only folder tree for the public blog frontend.
 *
 * Folders are rendered as collapsible groups; documents become links to
 * /posts/<slug>. Persists collapsed state per-KB in localStorage so readers
 * don't lose their place when navigating around.
 */
export default function PublicKbFolderTree({
  folders,
  rootDocuments,
  currentSlug,
  density = 'sidebar',
  showCounts = false,
}: Props) {
  /** When the active post lives inside a folder, force-expand its ancestors so
   * the reader can see where they are in the tree. */
  const initialExpanded = useMemo(() => {
    const set = new Set<number>();
    const walk = (f: PublicFolder, ancestors: number[]) => {
      const hereChain = [...ancestors, f.id];
      if (currentSlug && f.documents.some((d) => d.slug === currentSlug)) {
        hereChain.forEach((id) => set.add(id));
      }
      f.children.forEach((c) => walk(c, hereChain));
    };
    folders.forEach((f) => walk(f, []));
    return set;
  }, [folders, currentSlug]);

  const [expanded, setExpanded] = useState<Set<number>>(initialExpanded);

  // Re-merge ancestors-of-current whenever the active post changes (e.g.
  // reader navigates between posts via the sidebar).
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      initialExpanded.forEach((id) => next.add(id));
      return next;
    });
  }, [initialExpanded]);

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const isCompact = density === 'sidebar';
  const indent = isCompact ? 12 : 16;

  function renderDoc(d: PublicPost) {
    const active = d.slug === currentSlug;
    return (
      <li key={d.id} style={{ listStyle: 'none' }}>
        <Link
          to={`/posts/${encodeURIComponent(d.slug)}`}
          className={'jz-kb-nav-link' + (active ? ' is-active' : '')}
          style={{
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            padding: isCompact ? '5px 10px' : '7px 12px',
            fontSize: isCompact ? 13 : 14,
            lineHeight: 1.4,
            borderRadius: 6,
            color: active ? 'var(--jz-accent)' : 'var(--jz-text)',
            background: active
              ? 'color-mix(in srgb, var(--jz-accent) 10%, transparent)'
              : 'transparent',
            fontWeight: active ? 600 : 400,
            textDecoration: 'none',
            borderLeft: `2px solid ${active ? 'var(--jz-accent)' : 'transparent'}`,
            transition: 'background-color 120ms ease, color 120ms ease',
          }}
          title={d.title}
        >
          <span
            style={{
              flex: 1,
              minWidth: 0,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'break-all',
            }}
          >
            {d.title}
          </span>
          <DocFormatTag format={d.doc_format} size="default" />
        </Link>
      </li>
    );
  }

  function renderFolder(f: PublicFolder, depth: number) {
    const open = expanded.has(f.id);
    const childCount = countDocs(f);
    return (
      <li key={f.id} style={{ listStyle: 'none' }}>
        <button
          type="button"
          onClick={() => toggle(f.id)}
          aria-expanded={open}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            width: '100%',
            padding: isCompact ? '5px 8px 5px 10px' : '7px 10px 7px 12px',
            paddingLeft: indent * depth + (isCompact ? 10 : 12),
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--jz-text)',
            fontSize: isCompact ? 13 : 14,
            lineHeight: 1.4,
            textAlign: 'left',
            borderRadius: 6,
            fontWeight: 600,
            letterSpacing: 0.5,
          }}
          className="jz-kb-folder-toggle"
        >
          <span style={{ width: 12, display: 'inline-grid', placeItems: 'center', color: 'var(--jz-text-muted)' }}>
            {open ? <CaretDownOutlined /> : <CaretRightOutlined />}
          </span>
          <span style={{ color: 'var(--jz-gold)', display: 'inline-grid', placeItems: 'center' }}>
            {open ? <FolderOpenOutlined /> : <FolderOutlined />}
          </span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {f.name}
          </span>
          {(f.tags ?? []).slice(0, 3).map((t) => (
            <Tag
              key={t.id}
              color={t.color || undefined}
              className="jz-folder-tag"
              style={{ marginInlineEnd: 0, fontSize: 10, lineHeight: '15px', padding: '0 5px' }}
            >
              {t.name}
            </Tag>
          ))}
          {showCounts && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--jz-text-muted)',
                fontWeight: 400,
                padding: '0 6px',
                borderRadius: 10,
                background: 'color-mix(in srgb, var(--jz-surface-2) 70%, transparent)',
              }}
            >
              {childCount}
            </span>
          )}
        </button>
        {open && (
          <ul style={{ margin: 0, padding: 0, paddingLeft: indent * (depth + 1) }}>
            {f.documents.map(renderDoc)}
            {f.children.map((c) => renderFolder(c, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <ul style={{ margin: 0, padding: 0 }}>
      {folders.map((f) => renderFolder(f, 0))}
      {rootDocuments.map(renderDoc)}
    </ul>
  );
}
