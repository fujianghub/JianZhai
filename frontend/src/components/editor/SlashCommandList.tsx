import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { Editor, Range } from '@tiptap/core';
import type { SlashCommandItem } from './slashCommandRegistry';
import { formatSlashDescription, getRecentSlashTitles } from './slashCommandRegistry';
import { insertIconToneClass } from './toolbar/insertIconTone';

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

    /** Build a single flat ordering used by BOTH the render path and the
     * keyboard navigation. Without this alignment the visible "active" row
     * desyncs from the row that Enter actually fires. */
    const { displayItems, groups } = useMemo(() => {
      if (hasQuery) {
        return { displayItems: items, groups: null as null | Array<[string, SlashCommandItem[]]> };
      }
      const recentItems: SlashCommandItem[] = [];
      const seen = new Set<string>();
      for (const title of recentTitles) {
        const hit = items.find((it) => it.title === title);
        if (hit && !seen.has(hit.title)) {
          recentItems.push(hit);
          seen.add(hit.title);
        }
      }
      const map = new Map<string, SlashCommandItem[]>();
      if (recentItems.length > 0) {
        map.set('最近使用', recentItems);
      }
      for (const it of items) {
        const list = map.get(it.category) ?? [];
        list.push(it);
        map.set(it.category, list);
      }
      const groups = Array.from(map.entries());
      // Flatten in the exact render order so index-based selection matches.
      const flat: SlashCommandItem[] = [];
      for (const [, list] of groups) flat.push(...list);
      return { displayItems: flat, groups };
    }, [items, hasQuery, recentTitles]);

    useEffect(() => setSelectedIndex(0), [displayItems]);

    function selectItem(index: number) {
      const item = displayItems[index];
      if (item) command(item);
    }

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: (event) => {
          const n = displayItems.length;
          if (n === 0) return false;
          if (event.key === 'ArrowUp') {
            setSelectedIndex((i) => (i + n - 1) % n);
            return true;
          }
          if (event.key === 'ArrowDown') {
            setSelectedIndex((i) => (i + 1) % n);
            return true;
          }
          if (event.key === 'Enter') {
            // IME confirm-Enter must not double as menu selection.
            if (event.isComposing || event.keyCode === 229) return false;
            selectItem(selectedIndex);
            return true;
          }
          return false;
        },
      }),
      // selectedIndex must be in deps so Enter fires the *current* row.
      [displayItems, selectedIndex],
    );

    useEffect(() => {
      itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    if (displayItems.length === 0) {
      return (
        <div className="slash-menu">
          <div className="slash-menu-empty">无匹配命令</div>
        </div>
      );
    }

    function renderRow(item: SlashCommandItem, idx: number) {
      return (
        <button
          key={`${item.category}-${item.title}-${idx}`}
          ref={(el) => {
            itemRefs.current[idx] = el;
          }}
          type="button"
          className={
            'slash-menu-item' +
            (idx === selectedIndex ? ' is-active' : '') +
            (item.richTextOnly ? ' is-rich-only' : '')
          }
          disabled={false}
          onMouseEnter={() => setSelectedIndex(idx)}
          onClick={() => selectItem(idx)}
        >
          <span
            className={`slash-menu-item-icon ${insertIconToneClass(item.id)}`}
            aria-hidden
          >
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
      );
    }

    if (groups) {
      let idx = -1;
      return (
        <div className="slash-menu">
          {groups.map(([category, list]) => (
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
        {displayItems.map((item, idx) => renderRow(item, idx))}
      </div>
    );
  },
);

SlashCommandList.displayName = 'SlashCommandList';

export default SlashCommandList;
