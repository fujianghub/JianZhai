import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { Editor } from '@tiptap/core';
import type { SlashCommandItem } from '../slashCommandRegistry';
import { executeSlashCommandAtCursor } from '../slashCommandRegistry';
import type { InsertMenuActions } from '../insertMenuActions';
import {
  filterInsertMenu,
  insertMenuDisplayTitle,
  insertMenuSecondaryDesc,
  insertMenuShortcut,
  type InsertMenuGrouped,
} from './insertMenuRegistry';

interface Props {
  editor: Editor;
  actions: InsertMenuActions;
  onClose: () => void;
}

export default function QuickInsertMenu({ editor, actions, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const groups = useMemo(() => filterInsertMenu(query), [query]);

  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => setSelectedIndex(0), [flatItems]);

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  function runItem(item: SlashCommandItem) {
    executeSlashCommandAtCursor(editor, item, actions);
    try {
      editor.commands.scrollIntoView();
    } catch {
      /* optional command */
    }
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
  }, [flatItems, selectedIndex, editor, actions, onClose]);

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
        <span className="jz-insert-item-icon" aria-hidden>
          {item.icon}
        </span>
        <span className="jz-insert-item-body">
          <span className="jz-insert-item-title">{title}</span>
          {secondary && <span className="jz-insert-item-desc">{secondary}</span>}
          {grid && shortcut && (
            <span className="jz-insert-item-badge">{shortcut}</span>
          )}
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
          <div className="jz-insert-grid">
            {group.items.map((item) => renderItem(item, true))}
          </div>
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
          placeholder="请输入要搜索的功能名称"
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
