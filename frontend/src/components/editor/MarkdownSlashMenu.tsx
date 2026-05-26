import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { SlashCommandItem } from './slashCommandRegistry';
import { formatSlashDescription, getRecentSlashTitles } from './slashCommandRegistry';
import { filterMarkdownSlashCommands } from './markdownSlashActions';

interface Props {
  open: boolean;
  query: string;
  anchorRect: DOMRect | null;
  selectedIndex: number;
  onSelect: (item: SlashCommandItem) => void;
  onHoverIndex: (index: number) => void;
}

export default function MarkdownSlashMenu({
  open,
  query,
  anchorRect,
  selectedIndex,
  onSelect,
  onHoverIndex,
}: Props) {
  const items = useMemo(() => filterMarkdownSlashCommands(query), [query]);
  const recentTitles = useMemo(() => getRecentSlashTitles(), []);

  const displayItems = useMemo(() => {
    if (query.trim()) return items;
    const recent: SlashCommandItem[] = [];
    const seen = new Set<string>();
    for (const title of recentTitles) {
      const hit = items.find((it) => it.title === title);
      if (hit && !seen.has(hit.title)) {
        recent.push(hit);
        seen.add(hit.title);
      }
    }
    return [...recent, ...items.filter((it) => !seen.has(it.title))];
  }, [items, query, recentTitles]);

  if (!open || !anchorRect) return null;

  const style: React.CSSProperties = {
    position: 'fixed',
    top: anchorRect.bottom + 4,
    left: anchorRect.left,
    zIndex: 10000,
    maxHeight: 320,
    overflowY: 'auto',
  };

  return createPortal(
    <div className="slash-menu" style={style} role="listbox">
      {displayItems.length === 0 ? (
        <div className="slash-menu-empty">无匹配命令（如 dmk、yy、glk、mermaid）</div>
      ) : (
        displayItems.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            className={
              'slash-menu-item' +
              (idx === selectedIndex ? ' is-active' : '') +
              (item.richTextOnly ? ' is-rich-only' : '')
            }
            onMouseEnter={() => onHoverIndex(idx)}
            onMouseDown={(e) => {
              e.preventDefault();
              if (!item.richTextOnly) onSelect(item);
            }}
          >
            <span className="slash-menu-item-icon" aria-hidden>
              {item.icon}
            </span>
            <span className="slash-menu-item-body">
              <span className="slash-menu-item-title">{item.title}</span>
              <span className="slash-menu-item-desc">
                {formatSlashDescription(item)}
                {item.richTextOnly ? ' · 仅富文本' : ''}
              </span>
            </span>
          </button>
        ))
      )}
    </div>,
    document.body,
  );
}

export function useMarkdownSlashDisplayItems(query: string): SlashCommandItem[] {
  const items = useMemo(() => filterMarkdownSlashCommands(query), [query]);
  const recentTitles = useMemo(() => getRecentSlashTitles(), []);
  return useMemo(() => {
    if (query.trim()) return items;
    const recent: SlashCommandItem[] = [];
    const seen = new Set<string>();
    for (const title of recentTitles) {
      const hit = items.find((it) => it.title === title);
      if (hit && !seen.has(hit.title)) {
        recent.push(hit);
        seen.add(hit.title);
      }
    }
    return [...recent, ...items.filter((it) => !seen.has(it.title))];
  }, [items, query, recentTitles]);
}
