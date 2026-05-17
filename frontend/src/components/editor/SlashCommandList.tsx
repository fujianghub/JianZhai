import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { Editor, Range } from '@tiptap/core';
import type { SlashCommandItem } from './slashCommand';

interface Props {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
  editor: Editor;
  range: Range;
}

export interface SlashCommandListRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const SlashCommandList = forwardRef<SlashCommandListRef, Props>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => setSelectedIndex(0), [items]);

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

  if (items.length === 0) {
    return (
      <div className="slash-menu">
        <div className="slash-menu-empty">无匹配命令</div>
      </div>
    );
  }

  return (
    <div className="slash-menu">
      {items.map((item, idx) => (
        <button
          key={item.title}
          type="button"
          className={'slash-menu-item' + (idx === selectedIndex ? ' is-active' : '')}
          onMouseEnter={() => setSelectedIndex(idx)}
          onClick={() => selectItem(idx)}
        >
          <div className="slash-menu-item-title">{item.title}</div>
          {item.description && <div className="slash-menu-item-desc">{item.description}</div>}
        </button>
      ))}
    </div>
  );
});

SlashCommandList.displayName = 'SlashCommandList';

export default SlashCommandList;
