/**
 * Emoji 选择器扩展 — `:` 触发模糊搜索 + 弹层 Picker。
 *
 * 用法：在编辑器里输入 `:smi` → 弹出 😄 候选 → ↑↓ 选择，Enter 插入。
 *
 * 实现思路：使用 Tiptap 的 Suggestion 工具（与 @ 提及 / / 斜杠命令同源），
 * 复用现有 tippy.js 弹层基础设施。
 */
import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import { PluginKey } from '@tiptap/pm/state';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { searchEmoji, type EmojiEntry } from './emojiList';

export interface EmojiPickerRef {
  onKeyDown: (e: KeyboardEvent) => boolean;
}

interface PickerProps {
  items: EmojiEntry[];
  command: (e: EmojiEntry) => void;
}

const EmojiPicker = forwardRef<EmojiPickerRef, PickerProps>(({ items, command }, ref) => {
  const [active, setActive] = useState(0);

  useEffect(() => {
    setActive(0);
  }, [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (e: KeyboardEvent): boolean => {
      if (e.key === 'ArrowDown') {
        setActive((prev) => (prev + 1) % Math.max(1, items.length));
        return true;
      }
      if (e.key === 'ArrowUp') {
        setActive((prev) => (prev - 1 + items.length) % Math.max(1, items.length));
        return true;
      }
      if (e.key === 'ArrowRight') {
        setActive((prev) => Math.min(items.length - 1, prev + 8));
        return true;
      }
      if (e.key === 'ArrowLeft') {
        setActive((prev) => Math.max(0, prev - 8));
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (items[active]) command(items[active]);
        return true;
      }
      return false;
    },
  }), [items, active, command]);

  if (items.length === 0) {
    return <div className="jz-emoji-empty">没有匹配的 emoji</div>;
  }

  return (
    <div className="jz-emoji-picker">
      <div className="jz-emoji-grid">
        {items.map((e, i) => (
          <button
            key={e.emoji + i}
            type="button"
            className={'jz-emoji-cell' + (i === active ? ' is-active' : '')}
            onMouseEnter={() => setActive(i)}
            onClick={() => command(e)}
            title={`:${e.name}:`}
          >
            <span className="jz-emoji-char">{e.emoji}</span>
          </button>
        ))}
      </div>
      {items[active] && (
        <div className="jz-emoji-hint">
          <span style={{ fontSize: 22, marginRight: 8 }}>{items[active].emoji}</span>
          <span style={{ color: 'var(--jz-text)' }}>:{items[active].name}:</span>
          <span style={{ color: 'var(--jz-text-muted)', marginLeft: 8 }}>{items[active].group}</span>
        </div>
      )}
    </div>
  );
});
EmojiPicker.displayName = 'EmojiPicker';

export const EmojiSuggestion = Extension.create({
  name: 'emojiSuggestion',

  addOptions() {
    return {
      suggestion: {
        char: ':',
        startOfLine: false,
        // null = 始终允许，避免在空段落 / 行首打不出 :smile（默认 [' ', '('] 在
        // paragraph 起点会拒绝）。:emoji: 由用户主动输入，误触发可控。
        allowedPrefixes: null,
        command: ({ editor, range, props }: { editor: import('@tiptap/core').Editor; range: { from: number; to: number }; props: EmojiEntry }) => {
          editor.chain().focus().insertContentAt(range, props.emoji + ' ').run();
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('emojiSuggestion'),
        ...this.options.suggestion,
        items: ({ query }: { query: string }) => searchEmoji(query, 56),
        render: () => {
          let component: ReactRenderer<EmojiPickerRef> | null = null;
          let popup: TippyInstance | null = null;
          return {
            onStart: (props) => {
              component = new ReactRenderer(EmojiPicker, {
                props,
                editor: props.editor,
              });
              if (!props.clientRect) return;
              popup = tippy(document.body, {
                getReferenceClientRect: () => props.clientRect?.() || new DOMRect(),
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
                theme: 'light-border',
              });
            },
            onUpdate(props) {
              component?.updateProps(props);
              if (!props.clientRect) return;
              popup?.setProps({
                getReferenceClientRect: () => props.clientRect?.() || new DOMRect(),
              });
            },
            onKeyDown(props) {
              if (props.event.key === 'Escape') {
                popup?.hide();
                return true;
              }
              return component?.ref?.onKeyDown(props.event) ?? false;
            },
            onExit() {
              popup?.destroy();
              component?.destroy();
            },
          };
        },
      }),
    ];
  },
});
