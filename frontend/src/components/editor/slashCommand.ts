import { Editor, Extension, Range } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import SlashCommandList, { type SlashCommandListRef } from './SlashCommandList';

export interface SlashCommandItem {
  title: string;
  description?: string;
  keywords?: string[];
  command: (props: { editor: Editor; range: Range }) => void;
}

const COMMANDS: SlashCommandItem[] = [
  {
    title: '一级标题',
    description: 'H1',
    keywords: ['h1', 'heading 1', '标题'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
  },
  {
    title: '二级标题',
    description: 'H2',
    keywords: ['h2', 'heading 2'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
  },
  {
    title: '三级标题',
    description: 'H3',
    keywords: ['h3', 'heading 3'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
  },
  {
    title: '无序列表',
    keywords: ['ul', 'bullet'],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: '有序列表',
    keywords: ['ol', 'ordered'],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: '任务列表',
    keywords: ['todo', 'task', 'checkbox'],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: '引用块',
    keywords: ['quote', 'blockquote'],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: '代码块',
    keywords: ['code', 'pre'],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: '分割线',
    keywords: ['hr', 'horizontal', 'rule', 'divider'],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: '表格',
    keywords: ['table'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
];

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: false,
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashCommandItem }) => {
          props.command({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }: { query: string }) => {
          const q = query.trim().toLowerCase();
          if (!q) return COMMANDS;
          return COMMANDS.filter((c) => {
            const hay = [c.title, c.description ?? '', ...(c.keywords ?? [])]
              .join(' ')
              .toLowerCase();
            return hay.includes(q);
          });
        },
        render: () => {
          let component: ReactRenderer<SlashCommandListRef> | null = null;
          let popup: TippyInstance | null = null;

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashCommandList, {
                props,
                editor: props.editor,
              });
              if (!props.clientRect) return;
              popup = tippy(document.body, {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
              });
            },
            onUpdate(props) {
              component?.updateProps(props);
              if (props.clientRect && popup) {
                popup.setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
              }
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
              popup = null;
              component = null;
            },
          };
        },
      }),
    ];
  },
});
