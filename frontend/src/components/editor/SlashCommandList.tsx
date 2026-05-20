import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { Editor, Range } from '@tiptap/core';
import type { SlashCommandItem } from './slashCommand';
import { getRecentSlashTitles } from './slashCommand';

interface Props {
  items: SlashCommandItem[];
  /** True when the user typed at least one char after the trigger (`/foo`).
   *  In that case we render a flat list ordered by match relevance; when false
   *  we group items by category for easier discovery. */
  hasQuery?: boolean;
  command: (item: SlashCommandItem) => void;
  editor: Editor;
  range: Range;
}

export interface SlashCommandListRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const SlashCommandList = forwardRef<SlashCommandListRef, Props>(
  ({ items, hasQuery, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const [recentTitles] = useState<string[]>(() => getRecentSlashTitles());

    useEffect(() => setSelectedIndex(0), [items]);

    /** Group items by category, preserving the original order of categories. */
    const grouped = useMemo(() => {
      if (hasQuery) return null;
      const recentItems = recentTitles
        .map((t) => items.find((it) => it.title === t))
        .filter((it): it is SlashCommandItem => !!it);
      const map = new Map<string, SlashCommandItem[]>();
      if (recentItems.length > 0) {
        map.set('最近使用', recentItems);
      }
      for (const it of items) {
        const list = map.get(it.category) ?? [];
        list.push(it);
        map.set(it.category, list);
      }
      return Array.from(map.entries());
    }, [items, hasQuery, recentTitles]);

    function selectItem(index: number) {
      const item = items[index];
      if (item) command(item);
    }

    useImperativeHandle(ref, () => ({
      onKeyDown: (event) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i + items.length - 1) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    // Keep the selected row visible while navigating with arrow keys
    useEffect(() => {
      itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    if (items.length === 0) {
      return (
        <div className="slash-menu">
          <div className="slash-menu-empty">无匹配命令</div>
        </div>
      );
    }

    function renderRow(item: SlashCommandItem, idx: number) {
      return (
        <button
          key={`${item.category}-${item.title}`}
          ref={(el) => {
            itemRefs.current[idx] = el;
          }}
          type="button"
          className={'slash-menu-item' + (idx === selectedIndex ? ' is-active' : '')}
          onMouseEnter={() => setSelectedIndex(idx)}
          onClick={() => selectItem(idx)}
        >
          <span className="slash-menu-item-icon" aria-hidden>
            {item.icon}
          </span>
          <span className="slash-menu-item-body">
            <span className="slash-menu-item-title">{item.title}</span>
            {item.description && (
              <span className="slash-menu-item-desc">{item.description}</span>
            )}
          </span>
        </button>
      );
    }

    if (grouped) {
      let idx = -1;
      return (
        <div className="slash-menu">
          {grouped.map(([category, list]) => (
            <div key={category} className="slash-menu-group">
              <div className="slash-menu-group-title">{category}</div>
              {list.map((item) => {
                idx += 1;
                return renderRow(item, idx);
              })}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="slash-menu">
        {items.map((item, idx) => renderRow(item, idx))}
      </div>
    );
  },
);

SlashCommandList.displayName = 'SlashCommandList';

export default SlashCommandList;
