import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { SlashCommandItem } from '../slashCommandRegistry';
import { trackRecentSlashCommand } from '../slashCommandRegistry';
import { isMarkdownCapable } from '../markdownSlashActions';
import {
  filterInsertMenu,
  insertMenuDisplayTitle,
  insertMenuSecondaryDesc,
  insertMenuShortcut,
  type InsertMenuGrouped,
} from './insertMenuRegistry';
import { insertIconToneClass } from './insertIconTone';

interface Props {
  onInsert: (item: SlashCommandItem) => void;
  onClose: () => void;
}

function itemAvailableInMarkdown(item: SlashCommandItem): boolean {
  return isMarkdownCapable(item);
}

export default function MarkdownQuickInsertMenu({ onInsert, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const groups = useMemo(() => {
    const grouped = filterInsertMenu(query);
    return grouped
      .map((g) => ({
        ...g,
        items: g.items.filter(itemAvailableInMarkdown),
      }))
      .filter((g) => g.items.length > 0);
  }, [query]);

  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => setSelectedIndex(0), [flatItems]);

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  function runItem(item: SlashCommandItem) {
    trackRecentSlashCommand(item.title);
    onInsert(item);
    onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const n = flatItems.length;
      if (!n) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % n);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i + n - 1) % n);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = flatItems[selectedIndex];
        if (item) runItem(item);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [flatItems, selectedIndex, onInsert, onClose]);

  let rowIndex = -1;

  function renderItem(item: SlashCommandItem, grid = false) {
    rowIndex += 1;
    const idx = rowIndex;
    const title = insertMenuDisplayTitle(item);
    const shortcut = insertMenuShortcut(item);
    const secondary = grid ? undefined : insertMenuSecondaryDesc(item);
    return (
      <button
        key={item.id}
        type="button"
        ref={(el) => {
          itemRefs.current[idx] = el;
        }}
        className={
          'jz-insert-item' +
          (grid ? ' jz-insert-item--grid' : '') +
          (idx === selectedIndex ? ' is-active' : '')
        }
        onMouseEnter={() => setSelectedIndex(idx)}
        onClick={() => runItem(item)}
      >
        <span
          className={`jz-insert-item-icon ${insertIconToneClass(item.id)}`}
          aria-hidden
        >
          {item.icon}
        </span>
        <span className="jz-insert-item-body">
          <span className="jz-insert-item-title">{title}</span>
          {secondary && <span className="jz-insert-item-desc">{secondary}</span>}
          {grid && shortcut && <span className="jz-insert-item-badge">{shortcut}</span>}
        </span>
        {!grid && shortcut && <span className="jz-insert-item-shortcut">{shortcut}</span>}
      </button>
    );
  }

  function renderGroup(group: InsertMenuGrouped) {
    if (group.grid) {
      return (
        <div key={group.section} className="jz-insert-menu-group">
          <div className="jz-insert-menu-group-title">{group.section}</div>
          <div className="jz-insert-grid">{group.items.map((item) => renderItem(item, true))}</div>
        </div>
      );
    }
    return (
      <div key={group.section} className="jz-insert-menu-group">
        <div className="jz-insert-menu-group-title">{group.section}</div>
        {group.items.map((item) => renderItem(item))}
      </div>
    );
  }

  return (
    <div className="jz-insert-menu">
      <div className="jz-insert-search">
        <Input
          prefix={<SearchOutlined style={{ color: 'var(--jz-accent)' }} />}
          placeholder="搜索要插入的块（引用、表格、链接…）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          allowClear
          autoFocus
          size="middle"
        />
      </div>
      <div className="jz-insert-menu-scroll">
        {groups.length === 0 ? (
          <div className="jz-insert-menu-empty">无匹配功能</div>
        ) : (
          groups.map(renderGroup)
        )}
      </div>
    </div>
  );
}
